import type { SlackPost } from './posts.js';
import { DEFAULT_POST_TEMPLATE, type AppearanceOptions, type SlackTarget } from './settings.js';
import { toSlackText } from './slackText.js';
import type { TemplateVariable } from './template.js';

export type SlackMessage = {
  /** Sender name; set only when "Use post title as message sender" is on. */
  username?: string;
  /** Sender icon, e.g. ":usa:"; set only when "Use flair emoji as message icon" is on and the flair has an emoji. */
  icon_emoji?: string;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  blocks: Array<{ type: string; text: { type: string; text: string } }>;
};

export type SlackMessageRef = { channel: string; ts: string };

/** A message the app sent, as kept on record. */
export type SentMessage = SlackMessageRef & {
  /**
   * True when the message was sent with the post title as its sender name or
   * a flair emoji as its icon. Slack cannot edit those, so such a message has
   * to be deleted, not redacted, when the post is deleted.
   */
  customSender?: boolean;
  /** The channel setting at send time, kept only when it differs from `channel` (a name instead of an ID). */
  target?: string;
};

/** Normalised flair name to Slack emoji name. */
export type FlairMap = Record<string, string>;

/**
 * `error` is Slack's own error code, `http_<status>`, `request_failed` when the
 * request never completed, or `no_message_ts` when Slack's reply to a posted
 * message carried no message ID.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Lower-case letters and digits only, so "UK & Ireland" matches "uk&ireland". */
export function normalizeFlair(flair: string): string {
  return flair.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Unknown {variables} are left as typed. The settings page refuses them when a template is saved.
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) => (key in vars ? vars[key] : whole));
}

// Only for the shipped default template: a post with no flair emoji would
// otherwise start its first line with a space, and an author with no user
// flair would end "From: name ()". A template moderators wrote is sent as is.
function tidyDefaultMessage(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s+/, '').replace(/ \(\)$/, ''))
    .join('\n');
}

// Slack date token: renders in each reader's timezone, with an ISO fallback.
function slackDate(d: Date): string {
  return `<!date^${Math.floor(d.getTime() / 1000)}^{date_short_pretty} at {time}|${d.toISOString()}>`;
}

const BODY_PREVIEW_CHARS = 300;

// Slack rejects a section block whose text is longer than this.
const SLACK_TEXT_LIMIT = 3000;

function fitToSlackLimit(text: string): string {
  if (text.length <= SLACK_TEXT_LIMIT) return text;
  let cut = text.slice(0, SLACK_TEXT_LIMIT - 1);
  // Half a <link|label> or half an escaped character (&amp;) would break the
  // whole message, so the cut backs up to before it.
  const openLink = cut.lastIndexOf('<');
  if (openLink > cut.lastIndexOf('>')) cut = cut.slice(0, openLink);
  cut = cut.replace(/&[a-z]*$/, '');
  return cut.trimEnd() + '…';
}

/**
 * The body is the template with {variables} filled in (the shipped default is
 * also tidied, see tidyDefaultMessage), cut to Slack's length limit if it has
 * to be; sender name and icon follow the appearance settings. Returns null
 * when the body comes out empty, which Slack would reject.
 */
export function formatPost(
  post: SlackPost,
  subredditName: string,
  flairMap: FlairMap,
  template: string,
  appearance: AppearanceOptions
): SlackMessage | null {
  const emojiName = flairMap[normalizeFlair(post.flairText)] ?? '';
  const flairEmoji = emojiName ? `:${emojiName}:` : '';
  const created = new Date(post.createdUtc * 1000);
  const bodyPreview =
    post.body.length > BODY_PREVIEW_CHARS ? post.body.slice(0, BODY_PREVIEW_CHARS).trimEnd() + '…' : post.body;

  const vars: Record<TemplateVariable, string> = {
    title: toSlackText(post.title),
    author: toSlackText(post.author),
    author_lower: encodeURIComponent(post.author.toLowerCase()),
    flair: toSlackText(post.flairText),
    flair_emoji: flairEmoji,
    subreddit: subredditName,
    post_id: post.id.replace(/^t3_/, ''),
    post_url: post.url,
    body: toSlackText(post.body),
    body_preview: toSlackText(bodyPreview),
    thumbnail_url: post.thumbnailUrl,
    nsfw: post.nsfw ? 'NSFW' : '',
    spoiler: post.spoiler ? 'Spoiler' : '',
    post_type: post.postType,
    author_flair: toSlackText(post.authorFlair),
    language: post.language,
    created_at: slackDate(created),
    created_iso: created.toISOString(),
    score: String(post.score),
    comment_count: String(post.commentCount),
  };

  const rendered = renderTemplate(template, vars);
  const text = fitToSlackLimit(template === DEFAULT_POST_TEMPLATE ? tidyDefaultMessage(rendered) : rendered);
  if (!text.trim()) return null;
  const message: SlackMessage = {
    unfurl_links: false,
    unfurl_media: false,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
  };
  if (appearance.useTitleAsSender) message.username = post.title;
  if (appearance.useFlairAsIcon && flairEmoji) message.icon_emoji = flairEmoji;
  return message;
}

/**
 * What a deleted post's Slack message is replaced with when it is redacted in
 * place. Only the post ID, subreddit and times: Reddit does not allow the
 * title, body, author or link of deleted content to be kept or re-sent.
 */
function deletionNotice(postId: string, subredditName: string, deletedAt: Date, createdAt: Date | undefined): SlackMessage['blocks'] {
  const posted = createdAt ? `\nPosted: ${slackDate(createdAt)}` : '';
  const text = `:wastebasket: *Reddit post deleted*\nPost ID: ${postId.replace(/^t3_/, '')} (r/${subredditName})${posted}\nDeleted: ${slackDate(deletedAt)}`;
  return [{ type: 'section', text: { type: 'mrkdwn', text } }];
}

async function callSlack(token: string, method: string, payload: Record<string, unknown>): Promise<Result<Record<string, unknown>>> {
  try {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok && body.ok === true) return { ok: true, value: body };
    return { ok: false, error: typeof body.error === 'string' ? body.error : `http_${response.status}` };
  } catch (error) {
    console.error(`Slack ${method} request failed:`, error);
    return { ok: false, error: 'request_failed' };
  }
}

// chat.postMessage is the only Slack method that honours a per-message sender
// name and icon; it needs the chat:write and chat:write.customize scopes.
export async function postMessage(target: SlackTarget, message: SlackMessage): Promise<Result<SlackMessageRef>> {
  const result = await callSlack(target.token, 'chat.postMessage', { channel: target.channel, ...message });
  if (!result.ok) return result;
  const { channel, ts } = result.value;
  if (typeof ts !== 'string') return { ok: false, error: 'no_message_ts' };
  return { ok: true, value: { channel: typeof channel === 'string' ? channel : target.channel, ts } };
}

/**
 * Take a deleted post's content out of Slack. A message sent with a custom
 * sender name or icon is deleted outright, because Slack cannot change those
 * after it is sent. Any other message is redacted in place.
 */
export async function removeMessage(
  token: string,
  message: SentMessage,
  post: { id: string; subredditName: string; deletedAt: Date; createdAt: Date | undefined }
): Promise<Result<null>> {
  const result = message.customSender
    ? await callSlack(token, 'chat.delete', { channel: message.channel, ts: message.ts })
    : await callSlack(token, 'chat.update', {
        channel: message.channel,
        ts: message.ts,
        blocks: deletionNotice(post.id, post.subredditName, post.deletedAt, post.createdAt),
      });
  // message_not_found: someone already deleted it in Slack, which is the outcome wanted.
  if (result.ok || result.error === 'message_not_found') return { ok: true, value: null };
  return result;
}
