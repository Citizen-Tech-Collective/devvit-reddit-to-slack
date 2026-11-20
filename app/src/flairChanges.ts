import { Devvit, type TriggerContext } from '@devvit/public-api';
import { flairChangeNotice, flairEmoji } from './flair.js';
import { fromTriggerPost, type TriggerPost } from './posts.js';
import { readSettings } from './settings.js';
import { formatPost, postMessage, textBlocks, updateMessage, type SentMessage, type SlackMessage } from './slack.js';
import { loadFlairMap, readMessages, wasJustDeleted, writeMessages } from './store.js';

// When a sent post's flair changes, each Slack message it became is rewritten
// with the current flair, and a short notice is posted in that message's
// thread, sent as "Flair updated" with the new flair's emoji as its icon. A
// sender icon the message was sent with cannot change, so when the flair
// emoji is the icon, the message keeps showing the old one.

async function announceFlairChange(context: TriggerContext, subredditName: string, post: TriggerPost, author: string | undefined): Promise<void> {
  const messages = await readMessages(context, subredditName, post.id);
  // Never sent, already removed, or on its way out.
  if (messages.length === 0 || (await wasJustDeleted(context, subredditName, post.id))) return;

  const flair = post.linkFlair?.text ?? '';
  // Reddit also fires this event when a flair is first set, and can repeat it.
  const outdated = messages.filter((m) => !m.reply && m.flair !== flair);
  if (outdated.length === 0) return;

  const { target, template, appearance } = await readSettings(context.settings);
  if (!target) {
    console.error('Slack bot token or channel ID not configured');
    return;
  }
  const flairMap = await loadFlairMap(context, subredditName);
  const authorName = author ?? (await context.reddit.getPostById(post.id)).authorName;
  const body = formatPost(fromTriggerPost(post, authorName), subredditName, flairMap, template, appearance);
  const emoji = flairEmoji(flair, flairMap);

  const replies: SentMessage[] = [];
  let failures = 0;
  for (const message of outdated) {
    if (body) {
      const updated = await updateMessage(target.token, message, body.blocks);
      if (!updated.ok) {
        failures++;
        console.error(`Post ${post.id}: Slack message not updated for the flair change, error=${updated.error}`);
        // Someone deleted the message in Slack, so there is no thread to reply in.
        if (updated.error === 'message_not_found') continue;
      }
    }
    const notice: SlackMessage = {
      thread_ts: message.ts,
      username: 'Flair updated',
      unfurl_links: false,
      unfurl_media: false,
      blocks: textBlocks(flairChangeNotice(flair, message.flair)),
    };
    if (emoji) notice.icon_emoji = emoji;
    const reply = await postMessage({ token: target.token, channel: message.channel }, notice);
    if (reply.ok) {
      replies.push({ ...reply.value, reply: true });
    } else {
      failures++;
      console.error(`Post ${post.id}: flair change notice not sent to Slack, error=${reply.error}`);
    }
  }

  // The new flair is recorded even after a failure: Reddit sends no further
  // event for this change, so there is nothing to retry against.
  const current = messages.map((m) => (outdated.includes(m) ? { ...m, flair } : m));
  await writeMessages(context, subredditName, post.id, [...current, ...replies]);
  if (failures === 0) console.log(`Post ${post.id}: flair change sent to Slack`);
}

Devvit.addTrigger({
  event: 'PostFlairUpdate',
  onEvent: async (event, context) => {
    const subredditName = event.subreddit?.name ?? context.subredditName;
    if (!event.post || !subredditName) {
      console.error('PostFlairUpdate event had no post or subreddit');
      return;
    }
    try {
      await announceFlairChange(context, subredditName, event.post, event.author?.name);
    } catch (error) {
      console.error(`PostFlairUpdate for ${event.post.id} failed:`, error);
    }
  },
});
