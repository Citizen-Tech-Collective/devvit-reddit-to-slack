import { Devvit, type TriggerContext } from '@devvit/public-api';
import { retryDueDeletions } from './deletions.js';
import './dialogs.js';
import { fromTriggerPost, isPublic, type SlackPost, type TriggerPost } from './posts.js';
import { fetchModQueuePosts, fetchPublicPosts, filterUnsent, NEW_POST_DELAY_MS, sendPost, sendPosts } from './sending.js';
import { readScheduleCron, readSettings, type SlackTarget } from './settings.js';
import { clearDeleted, loadFlairMap, slackSettingsChangedAt, wasPostSent } from './store.js';

// Both this call and the `permissions` block in devvit.json are needed:
// devvit.json tells Reddit what the app may do (and lists the fetch domain,
// slack.com), while this call loads the matching clients into the public-api
// runtime, which throws "Reddit API is not enabled" without it. Keep the two
// in step.
Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

// Scheduled check: runs any deletion retry that is due, then sends any
// recent public post the trigger missed, then the posts in Reddit's mod queue
// when those are turned on.

const FETCH_JOB = 'fetchNewPosts';

Devvit.addSchedulerJob({
  name: FETCH_JOB,
  onRun: async (_event, context) => {
    try {
      const subredditName = (await context.reddit.getCurrentSubreddit()).name;
      try {
        await retryDueDeletions(context, subredditName);
      } catch (error) {
        // Sending new posts should still happen.
        console.error('Retrying outstanding removals failed:', error);
      }

      const { target, modQueueTarget, slackFingerprint, postsLimit, onlySinceChange, template, appearance } = await readSettings(context.settings);
      if (!target) {
        console.error('Slack bot token or channel ID not configured');
        return;
      }
      // Unless moderators turn the setting off, posts made before the bot
      // token or a channel last changed are skipped, so a new channel is not
      // filled without being asked. Older public posts can still be sent with
      // the historical fetch. The change time is read either way, which keeps
      // it current.
      const changedAtSeconds = (await slackSettingsChangedAt(context, subredditName, slackFingerprint)) / 1000;
      const earliestSeconds = onlySinceChange ? changedAtSeconds : 0;
      const flairMap = await loadFlairMap(context, subredditName);

      const sendUnsent = async (kind: string, posts: SlackPost[], to: SlackTarget): Promise<void> => {
        const recent = posts.filter((post) => post.createdUtc >= earliestSeconds);
        const unsent = await filterUnsent(context, subredditName, recent, to.channel);
        if (unsent.length === 0) return;
        const sentCount = await sendPosts(context, subredditName, unsent, { target: to, flairMap, template, appearance });
        console.log(`${FETCH_JOB}: sent ${sentCount} of ${unsent.length} unsent ${kind} posts in r/${subredditName}`);
      };

      await sendUnsent('public', await fetchPublicPosts(context.reddit, subredditName, postsLimit), target);
      if (modQueueTarget) {
        await sendUnsent('mod queue', await fetchModQueuePosts(context.reddit, subredditName, postsLimit), modQueueTarget);
      }
    } catch (error) {
      console.error(`${FETCH_JOB} job failed:`, error);
    }
  },
});

const FETCH_JOB_ID_KEY = `${FETCH_JOB}:jobId`;

// Cancels the job a previous install or upgrade registered, so upgrades do not stack duplicates.
async function scheduleFetchJob(context: TriggerContext): Promise<void> {
  const { scheduler, redis, settings } = context;
  const { cron, label } = await readScheduleCron(settings);

  const previousJobId = await redis.get(FETCH_JOB_ID_KEY);
  if (previousJobId) {
    try {
      await scheduler.cancelJob(previousJobId);
    } catch (error) {
      console.warn(`Could not cancel previous ${FETCH_JOB} job ${previousJobId}:`, error);
    }
  }
  const jobId = await scheduler.runJob({ name: FETCH_JOB, cron });
  await redis.set(FETCH_JOB_ID_KEY, jobId);
  console.log(`Scheduled ${FETCH_JOB} job ${jobId} (every ${label})`);
}

Devvit.addTrigger({
  events: ['AppInstall', 'AppUpgrade'],
  onEvent: async (_event, context) => {
    try {
      await scheduleFetchJob(context);
    } catch (error) {
      console.error(`Could not schedule the ${FETCH_JOB} job:`, error);
    }
  },
});

// Public posts. Reddit's "post created" event fires once its checks have
// passed, and a moderator's approval ('approvelink') makes a held or removed
// post public. Either way the post goes to the main channel if it is not
// there already. Mod queue posts are not sent from events: the scheduled
// check reads Reddit's mod queue list.

type IncomingEvent = 'PostCreate' | 'ModAction:approvelink';

async function handleIncomingPost(
  eventName: IncomingEvent,
  post: TriggerPost | undefined,
  author: string | undefined,
  eventSubreddit: string | undefined,
  context: TriggerContext
): Promise<void> {
  const { target, slackFingerprint, template, appearance } = await readSettings(context.settings);
  const isApproval = eventName === 'ModAction:approvelink';

  if (!target) {
    console.error('Slack bot token or channel ID not configured');
    return;
  }
  const subredditName = eventSubreddit ?? context.subredditName;
  if (!post || !subredditName) {
    console.error(`${eventName} event had no post or subreddit`);
    return;
  }
  try {
    // Keeps the recorded change time current even if no scheduled check has run since a settings change.
    await slackSettingsChangedAt(context, subredditName, slackFingerprint);
    if (isApproval) {
      await clearDeleted(context, subredditName, post.id);
    } else {
      await new Promise((resolve) => setTimeout(resolve, NEW_POST_DELAY_MS));
    }
    if (await wasPostSent(context, subredditName, post.id, target.channel)) return;
    // The event carries a snapshot. Reddit's guidance is to fetch the current
    // object when a decision depends on its state, here whether it is public.
    if (!isPublic(await context.reddit.getPostById(post.id))) return;
    const flairMap = await loadFlairMap(context, subredditName);
    await sendPost(context, subredditName, fromTriggerPost(post, author ?? ''), { target, flairMap, template, appearance });
  } catch (error) {
    console.error(`${eventName} for ${post.id} failed:`, error);
  }
}

Devvit.addTrigger({
  event: 'PostCreate',
  onEvent: (event, context) => handleIncomingPost('PostCreate', event.post, event.author?.name, event.subreddit?.name, context),
});

Devvit.addTrigger({
  event: 'ModAction',
  onEvent: (event, context) => {
    if (event.action !== 'approvelink' || !event.targetPost) return;
    return handleIncomingPost('ModAction:approvelink', event.targetPost, event.targetUser?.name, event.subreddit?.name, context);
  },
});

export default Devvit;
