import type { Context } from '@devvit/public-api';
import { normalizeFlair, type FlairMap, type SentMessage } from './slack.js';

// The app's Redis records, apart from the scheduled job's ID, which main.tsx
// keeps. All of it is identifiers, settings, times and short-lived counters:
// no post titles, text or usernames.

export type RedisContext = Pick<Context, 'redis'>;

// Reddit reports a subreddit's name through several routes (trigger payload,
// context, API). Keys use the lower-cased name so a difference in case cannot
// make one route miss a record another route wrote.
function sub(subredditName: string): string {
  return subredditName.toLowerCase();
}

// post:<subreddit>:<postId> -> the Slack messages the post became. Usually
// one; more when the channel setting changed and the post was sent again, or
// when a mod queue post was approved and sent to the main channel as well. No
// expiry: Reddit lets apps keep post and message IDs, and this record is what
// makes a later deletion actionable. Cleared once the post has been deleted
// on Reddit and its Slack messages are gone, or when the app gives up
// retrying their removal.
function postKey(subredditName: string, postId: string): string {
  return `post:${sub(subredditName)}:${postId}`;
}

export async function readMessages(context: RedisContext, subredditName: string, postId: string): Promise<SentMessage[]> {
  const raw = await context.redis.get(postKey(subredditName, postId));
  return raw ? (JSON.parse(raw) as SentMessage[]) : [];
}

export async function writeMessages(context: RedisContext, subredditName: string, postId: string, messages: SentMessage[]): Promise<void> {
  if (messages.length === 0) {
    await context.redis.del(postKey(subredditName, postId));
  } else {
    await context.redis.set(postKey(subredditName, postId), JSON.stringify(messages));
  }
}

/** Sent means sent to the channel currently configured. */
export async function wasPostSent(context: RedisContext, subredditName: string, postId: string, channelSetting: string): Promise<boolean> {
  const messages = await readMessages(context, subredditName, postId);
  return messages.some((m) => m.channel === channelSetting || m.target === channelSetting);
}

// sending:<subreddit>:<postId> -> a counter that lives for a minute while a
// post is being sent. It does two jobs. A trigger and the scheduled check can
// pick up the same post at the same moment: whoever increments it to 1 sends,
// the other skips. And a deletion that finds no record yet can tell that a
// send is under way and look again shortly.
const SEND_CLAIM_SECONDS = 60;
function sendClaimKey(subredditName: string, postId: string): string {
  return `sending:${sub(subredditName)}:${postId}`;
}

export async function claimSend(context: RedisContext, subredditName: string, postId: string): Promise<boolean> {
  const key = sendClaimKey(subredditName, postId);
  const holders = await context.redis.incrBy(key, 1);
  await context.redis.expire(key, SEND_CLAIM_SECONDS);
  return holders === 1;
}

export async function releaseSend(context: RedisContext, subredditName: string, postId: string): Promise<void> {
  await context.redis.del(sendClaimKey(subredditName, postId));
}

export async function isSendInProgress(context: RedisContext, subredditName: string, postId: string): Promise<boolean> {
  return Boolean(await context.redis.get(sendClaimKey(subredditName, postId)));
}

// deleted:<subreddit>:<postId> -> set when Reddit reports a post deleted or
// removed, and kept for ten minutes. It stops a send that was already under
// way when the deletion arrived. A moderator's approval clears it.
const DELETED_MARK_SECONDS = 10 * 60;
function deletedKey(subredditName: string, postId: string): string {
  return `deleted:${sub(subredditName)}:${postId}`;
}

export async function markDeleted(context: RedisContext, subredditName: string, postId: string): Promise<void> {
  await context.redis.set(deletedKey(subredditName, postId), '1', { expiration: new Date(Date.now() + DELETED_MARK_SECONDS * 1000) });
}

export async function clearDeleted(context: RedisContext, subredditName: string, postId: string): Promise<void> {
  await context.redis.del(deletedKey(subredditName, postId));
}

export async function wasJustDeleted(context: RedisContext, subredditName: string, postId: string): Promise<boolean> {
  return Boolean(await context.redis.get(deletedKey(subredditName, postId)));
}

// slack_settings:<subreddit> -> { fingerprint, changedAt }: the fingerprint
// of the bot token and channel ID settings, and when they last changed. The
// scheduled check and the historical fetch use the time to leave alone posts
// made before the change.
// slack_settings_saved:<subreddit> -> the time a moderator last saved a
// different bot token or channel ID, written by the settings page as it
// validates. If it is missing, or not later than the change already on
// record, the change is dated from when the app first notices the new
// fingerprint.
function slackSettingsKey(subredditName: string): string {
  return `slack_settings:${sub(subredditName)}`;
}
function slackSettingsSavedKey(subredditName: string): string {
  return `slack_settings_saved:${sub(subredditName)}`;
}

export async function noteSlackSettingsSaved(context: RedisContext, subredditName: string): Promise<void> {
  await context.redis.set(slackSettingsSavedKey(subredditName), String(Date.now()));
}

/** Milliseconds since epoch. */
export async function slackSettingsChangedAt(context: RedisContext, subredditName: string, fingerprint: string): Promise<number> {
  const raw = await context.redis.get(slackSettingsKey(subredditName));
  const known = raw ? (JSON.parse(raw) as { fingerprint: string; changedAt: number }) : undefined;
  if (known?.fingerprint === fingerprint) return known.changedAt;

  const savedAt = Number(await context.redis.get(slackSettingsSavedKey(subredditName))) || 0;
  const changedAt = savedAt > (known?.changedAt ?? 0) ? savedAt : Date.now();
  await context.redis.set(slackSettingsKey(subredditName), JSON.stringify({ fingerprint, changedAt }));
  return changedAt;
}

// pending_deletions:<subreddit> -> hash of postId -> PendingDeletion, for posts
// deleted on Reddit whose Slack message has not been removed yet.
function pendingKey(subredditName: string): string {
  return `pending_deletions:${sub(subredditName)}`;
}

export type PendingDeletion = {
  /** Milliseconds since epoch; the deletion notice shows both times. */
  deletedAt: number;
  createdAt?: number;
  /** Failed attempts so far. */
  attempt: number;
  /** When the next attempt is due (ms). Absent while parked. */
  nextAt?: number;
  /**
   * Set when Slack refused for a reason only a settings change can fix, or
   * when no bot token or channel is configured. Holds the fingerprint of the
   * Slack settings at that moment; the removal is tried again once the
   * fingerprint differs.
   */
  parkedWith?: string;
};

export async function readPendingDeletions(context: RedisContext, subredditName: string): Promise<Record<string, PendingDeletion>> {
  // The client returns null for a missing hash, although its types say it cannot.
  const raw = (await context.redis.hGetAll(pendingKey(subredditName))) ?? {};
  return Object.fromEntries(Object.entries(raw).map(([postId, value]) => [postId, JSON.parse(value) as PendingDeletion]));
}

export async function writePendingDeletion(context: RedisContext, subredditName: string, postId: string, pending: PendingDeletion | null): Promise<void> {
  if (pending) {
    await context.redis.hSet(pendingKey(subredditName), { [postId]: JSON.stringify(pending) });
  } else {
    await context.redis.hDel(pendingKey(subredditName), [postId]);
  }
}

// flair_list:<subreddit> -> what moderators saved in the Manage flairs dialog.
function flairListKey(subredditName: string): string {
  return `flair_list:${sub(subredditName)}`;
}

export type FlairEntry = { name: string; emoji: string };

export async function loadFlairList(context: RedisContext, subredditName: string): Promise<FlairEntry[]> {
  const raw = await context.redis.get(flairListKey(subredditName));
  return raw ? (JSON.parse(raw) as FlairEntry[]) : [];
}

export async function saveFlairList(context: RedisContext, subredditName: string, list: FlairEntry[]): Promise<void> {
  await context.redis.set(flairListKey(subredditName), JSON.stringify(list));
}

export async function loadFlairMap(context: RedisContext, subredditName: string): Promise<FlairMap> {
  const map: FlairMap = {};
  for (const { name, emoji } of await loadFlairList(context, subredditName)) {
    if (normalizeFlair(name) && emoji) map[normalizeFlair(name)] = emoji;
  }
  return map;
}
