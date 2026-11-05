import type { RedditAPIClient } from '@devvit/public-api';
import { fromRedditPost, isAwaitingReview, isPublic, type SlackPost } from './posts.js';
import type { AppearanceOptions, SlackTarget } from './settings.js';
import { formatPost, postMessage, type FlairMap, type SentMessage } from './slack.js';
import { claimSend, readMessages, releaseSend, wasJustDeleted, wasPostSent, writeMessages, type RedisContext } from './store.js';

export type Delivery = { target: SlackTarget; flairMap: FlairMap; template: string; appearance: AppearanceOptions };

// AutoModerator and the spam filter can remove a post within moments of
// submission. Nothing is sent until a post is this old, so that such a
// deletion arrives first and the post is never sent at all.
export const NEW_POST_DELAY_MS = 10_000;

function oldEnough(post: { createdAt: Date }): boolean {
  return post.createdAt.getTime() <= Date.now() - NEW_POST_DELAY_MS;
}

/** The newest public posts, for the scheduled check and the historical fetch. */
export async function fetchPublicPosts(reddit: RedditAPIClient, subredditName: string, limit: number): Promise<SlackPost[]> {
  const posts = await reddit.getNewPosts({ subredditName, limit }).all();
  return posts.filter((post) => oldEnough(post) && isPublic(post)).map(fromRedditPost);
}

/**
 * The posts in Reddit's mod queue, "things requiring moderator review". The
 * list is Reddit's own, so the app does not decide what belongs in it. It
 * leaves out posts younger than NEW_POST_DELAY_MS, reported posts that are
 * public, which are sent as public posts, and anything a person has already
 * removed.
 */
export async function fetchModQueuePosts(reddit: RedditAPIClient, subredditName: string, limit: number): Promise<SlackPost[]> {
  const posts = await reddit.getModQueue({ subreddit: subredditName, type: 'post', limit }).all();
  return posts.filter((post) => oldEnough(post) && isAwaitingReview(post)).map(fromRedditPost);
}

export async function filterUnsent(context: RedisContext, subredditName: string, posts: SlackPost[], channelSetting: string): Promise<SlackPost[]> {
  const sent = await Promise.all(posts.map((post) => wasPostSent(context, subredditName, post.id, channelSetting)));
  return posts.filter((_post, i) => !sent[i]);
}

/**
 * A send that Slack accepts or refuses is logged here, so callers do not log
 * it again. A post skipped because another send holds the claim, or because
 * it was just deleted, is not logged.
 */
export async function sendPost(context: RedisContext, subredditName: string, post: SlackPost, delivery: Delivery): Promise<boolean> {
  const { target } = delivery;
  const message = formatPost(post, subredditName, delivery.flairMap, delivery.template, delivery.appearance);
  if (!message) {
    console.error(`Post ${post.id} not sent to Slack: the message format produced an empty message for it`);
    return false;
  }

  // Claim first, then look for a deletion. The deletion handler does the
  // reverse (marks the post deleted, then looks for a claim), so whichever
  // order the two run in, one of them sees the other.
  if (!(await claimSend(context, subredditName, post.id))) return false;
  if (await wasJustDeleted(context, subredditName, post.id)) {
    await releaseSend(context, subredditName, post.id);
    return false;
  }

  const result = await postMessage(target, message);
  if (!result.ok) {
    await releaseSend(context, subredditName, post.id);
    console.error(`Post ${post.id} not sent to Slack: error=${result.error}`);
    return false;
  }
  const sent: SentMessage = { ...result.value };
  if (message.username || message.icon_emoji) sent.customSender = true;
  if (target.channel !== sent.channel) sent.target = target.channel;
  const earlier = await readMessages(context, subredditName, post.id);
  await writeMessages(context, subredditName, post.id, [...earlier, sent]);
  console.log(`Post ${post.id} sent to Slack`);
  return true;
}

const SEND_DELAY_MS = 300;

export async function sendPosts(context: RedisContext, subredditName: string, posts: SlackPost[], delivery: Delivery): Promise<number> {
  let sentCount = 0;
  for (const post of posts) {
    if (await sendPost(context, subredditName, post, delivery)) sentCount++;
    await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
  }
  return sentCount;
}
