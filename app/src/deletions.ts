import { Devvit, type Context } from '@devvit/public-api';
import { readSettings } from './settings.js';
import { removeMessage, type SentMessage } from './slack.js';
import { isSendInProgress, markDeleted, readMessages, readPendingDeletions, writeMessages, writePendingDeletion, type PendingDeletion } from './store.js';

// Reddit requires the app to remove what it sent to Slack when a post is
// deleted or removed. The app keeps its record (post ID and Slack message
// identifier, which Reddit allows) while a removal is being retried or waits
// for a settings change, and drops it once the removal succeeds or the app
// gives up retrying. The deleted post itself is never looked up on Reddit.

type DeletionContext = Pick<Context, 'redis' | 'settings' | 'scheduler'>;

const RETRY_JOB = 'retryDeletions';

// Slack refusals that only a change to the bot token or a channel ID setting
// can fix. The removal is parked and tried again when any of those changes.
const NEEDS_SETTINGS_CHANGE = new Set([
  // The channel is gone, archived, or the bot is no longer in it
  'channel_not_found',
  'invalid_channel_id',
  'is_inactive',
  'is_archived',
  // The bot token or its account is not usable
  'invalid_auth',
  'token_revoked',
  'token_expired',
  'not_authed',
  'account_inactive',
  'no_permission',
  'missing_scope',
  'not_allowed_token_type',
  'access_denied',
  'team_access_not_granted',
  'org_login_required',
  'ekm_access_denied',
  'two_factor_setup_required',
  'enterprise_is_restricted',
  // The bot may not act on this message
  'cant_delete_message',
  'cant_update_message',
  'compliance_exports_prevent_deletion',
]);

// Any other failure (rate limits, outages, anything unexpected) is retried
// after each of these waits in turn, then given up on.
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RETRY_DELAYS_SECONDS = [10, 30, 3 * MINUTE, 10 * MINUTE, 30 * MINUTE, 1 * HOUR, 12 * HOUR, 3 * DAY, 7 * DAY];

async function removeDeletedPost(context: DeletionContext, subredditName: string, postId: string, pending: PendingDeletion): Promise<void> {
  const outOfRetries = pending.attempt >= RETRY_DELAYS_SECONDS.length;
  const retryLater = async (): Promise<void> => {
    const nextAt = Date.now() + RETRY_DELAYS_SECONDS[pending.attempt] * 1000;
    await writePendingDeletion(context, subredditName, postId, { ...pending, attempt: pending.attempt + 1, nextAt, parkedWith: undefined });
    try {
      await context.scheduler.runJob({ name: RETRY_JOB, data: { subredditName }, runAt: new Date(nextAt) });
    } catch (error) {
      // The scheduled check runs retryDueDeletions too, so the retry still happens, only later.
      console.error(`Could not book the retry for ${postId}:`, error);
    }
  };

  const messages = await readMessages(context, subredditName, postId);
  if (messages.length === 0) {
    // A send that began before the deletion arrived may not have written its
    // record yet. Look again once it has finished or its claim has lapsed.
    if (!outOfRetries && (await isSendInProgress(context, subredditName, postId))) {
      await retryLater();
    } else {
      await writePendingDeletion(context, subredditName, postId, null);
    }
    return;
  }

  const { target, slackFingerprint } = await readSettings(context.settings);
  const park = () => writePendingDeletion(context, subredditName, postId, { ...pending, attempt: 0, nextAt: undefined, parkedWith: slackFingerprint });
  if (!target) {
    // Nothing can be removed until a bot token and channel are set again.
    await park();
    return;
  }

  const post = {
    id: postId,
    subredditName,
    deletedAt: new Date(pending.deletedAt),
    createdAt: pending.createdAt === undefined ? undefined : new Date(pending.createdAt),
  };
  const blocked: SentMessage[] = [];
  let retryable: SentMessage[] = [];
  for (const message of messages) {
    const result = await removeMessage(target.token, message, post);
    if (result.ok) continue;
    console.error(`Post ${postId}: Slack message not removed, error=${result.error}`);
    (NEEDS_SETTINGS_CHANGE.has(result.error) ? blocked : retryable).push(message);
  }

  const gaveUp = retryable.length > 0 && outOfRetries;
  if (gaveUp) {
    console.error(`Post ${postId}: gave up removing it from Slack after ${pending.attempt + 1} attempts`);
    retryable = [];
  }
  await writeMessages(context, subredditName, postId, [...blocked, ...retryable]);

  if (retryable.length > 0) {
    await retryLater();
  } else if (blocked.length > 0) {
    await park();
  } else {
    await writePendingDeletion(context, subredditName, postId, null);
    if (!gaveUp) console.log(`Post ${postId} removed from Slack`);
  }
}

// A one-off job can start a moment before the time it was booked for.
const EARLY_RUN_ALLOWANCE_MS = 5000;

/**
 * Try every outstanding removal that is due: a retry whose wait is over, or a
 * parked one whose Slack settings have changed since it was parked. Run by
 * the scheduled check, and by a one-off job booked for each retry so that a
 * short wait is not held up until the next check.
 */
export async function retryDueDeletions(context: DeletionContext, subredditName: string): Promise<void> {
  const { slackFingerprint } = await readSettings(context.settings);
  for (const [postId, pending] of Object.entries(await readPendingDeletions(context, subredditName))) {
    const parked = pending.parkedWith !== undefined;
    const due = parked ? pending.parkedWith !== slackFingerprint : (pending.nextAt ?? 0) <= Date.now() + EARLY_RUN_ALLOWANCE_MS;
    if (!due) continue;
    try {
      await removeDeletedPost(context, subredditName, postId, parked ? { ...pending, attempt: 0 } : pending);
    } catch (error) {
      // One post's failure must not hold up the others.
      console.error(`Retrying the removal of ${postId} failed:`, error);
    }
  }
}

Devvit.addSchedulerJob({
  name: RETRY_JOB,
  onRun: async (event, context) => {
    const subredditName = event.data?.subredditName;
    if (typeof subredditName !== 'string') return;
    try {
      await retryDueDeletions(context, subredditName);
    } catch (error) {
      console.error(`${RETRY_JOB} failed:`, error);
    }
  },
});

// Reddit documents these times as ISO text, while the SDK types them as
// dates. Either is accepted.
function toMs(time: unknown): number | undefined {
  if (time === undefined || time === null) return undefined;
  const ms = new Date(time as string | number | Date).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

Devvit.addTrigger({
  event: 'PostDelete',
  onEvent: async (event, context) => {
    const subredditName = event.subreddit?.name ?? context.subredditName;
    if (!event.postId || !subredditName) {
      console.error('PostDelete event had no post ID or subreddit');
      return;
    }
    try {
      await markDeleted(context, subredditName, event.postId);
      await removeDeletedPost(context, subredditName, event.postId, {
        deletedAt: toMs(event.deletedAt) ?? Date.now(),
        createdAt: toMs(event.createdAt),
        attempt: 0,
      });
    } catch (error) {
      console.error(`PostDelete for ${event.postId} failed:`, error);
    }
  },
});

/** A sentence or two for the moderator dialogs, or '' when nothing is outstanding. */
export async function outstandingDeletionsNote(context: Pick<Context, 'redis'>, subredditName: string): Promise<string> {
  const all = Object.values(await readPendingDeletions(context, subredditName));
  const parked = all.filter((p) => p.parkedWith !== undefined).length;
  const retrying = all.length - parked;
  const posts = (n: number) => (n === 1 ? '1 deleted post' : `${n} deleted posts`);
  let note = '';
  if (retrying > 0) {
    note += ` ${posts(retrying)} ${retrying === 1 ? 'is' : 'are'} waiting to be removed from Slack; the app is retrying.`;
  }
  if (parked > 0) {
    note += ` ${posts(parked)} could not be removed from Slack. The app will try again when the bot token or channel ID setting changes; until then, remove ${parked === 1 ? 'it' : 'them'} in Slack by hand.`;
  }
  return note;
}
