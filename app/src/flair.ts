import { toSlackText } from './slackText.js';

/** Normalized flair name to Slack emoji name. */
export type FlairMap = Record<string, string>;

/** Lower-case letters and digits only, so "UK & Ireland" matches "uk&ireland". */
export function normalizeFlair(flair: string): string {
  return flair.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The Slack emoji for a flair, as ":name:", or '' when Manage flairs has none for it. */
export function flairEmoji(flair: string, flairMap: FlairMap): string {
  const emojiName = flairMap[normalizeFlair(flair)] ?? '';
  return emojiName ? `:${emojiName}:` : '';
}

/**
 * The text of the reply posted in a message's thread when the post's flair
 * changes. `previous` is undefined for a message sent before the app began
 * keeping the flair.
 */
export function flairChangeNotice(flair: string, previous: string | undefined): string {
  const current = `*${toSlackText(flair)}*`;
  const before = previous ? `*${toSlackText(previous)}*` : '';
  if (!flair) return before ? `Flair ${before} removed` : 'Flair removed';
  if (before) return `Flair changed from ${before} to ${current}`;
  return `Flair ${previous === '' ? 'set to' : 'changed to'} ${current}`;
}
