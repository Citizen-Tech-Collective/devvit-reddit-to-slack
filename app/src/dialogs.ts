import { Devvit, type Context } from '@devvit/public-api';
import { outstandingDeletionsNote } from './deletions.js';
import { fetchPublicPosts, filterUnsent, sendPosts } from './sending.js';
import { DEFAULT_POSTS_LIMIT, readSettings } from './settings.js';
import { normalizeFlair } from './slack.js';
import { loadFlairList, loadFlairMap, saveFlairList, slackSettingsChangedAt, type FlairEntry } from './store.js';

async function currentSubredditName(context: Context): Promise<string> {
  return context.subredditName ?? (await context.reddit.getCurrentSubreddit()).name;
}

// Manage flairs: rename flairs, change their emoji, add new ones, or remove
// one by clearing its name.

const NEW_FLAIR_ROWS = 3;

const manageFlairsForm = Devvit.createForm(
  (data) => {
    const list = (data.list ?? []) as FlairEntry[];
    const row = (i: number, label: string, helpText: string, entry: FlairEntry) => ({
      type: 'group' as const,
      label,
      helpText,
      fields: [
        { type: 'string' as const, name: `name_${i}`, label: 'Flair name', defaultValue: entry.name },
        { type: 'string' as const, name: `emoji_${i}`, label: 'Slack emoji', defaultValue: entry.emoji },
      ],
    });
    const fields = list.map((entry, i) => row(i, entry.name || `Flair ${i + 1}`, 'Clear the name to remove this flair.', entry));
    for (let j = 0; j < NEW_FLAIR_ROWS; j++) {
      fields.push(row(list.length + j, `New flair ${j + 1}`, 'Leave blank if not needed.', { name: '', emoji: '' }));
    }
    return {
      title: 'Manage flairs',
      description:
        'Flair names must match the post flair text on Reddit (case and punctuation are ignored). Emoji is the Slack emoji name without colons.' +
        String(data.note ?? ''),
      fields,
      acceptLabel: 'Save',
    };
  },
  async (event, context) => {
    const values = event.values as Record<string, unknown>;
    const rowNumbers = Object.keys(values)
      .filter((key) => /^name_\d+$/.test(key))
      .map((key) => Number(key.slice('name_'.length)))
      .sort((a, b) => a - b);

    const list: FlairEntry[] = [];
    const seen = new Set<string>();
    for (const i of rowNumbers) {
      const name = String(values[`name_${i}`] ?? '').trim();
      const emoji = String(values[`emoji_${i}`] ?? '').trim().replace(/^:|:$/g, '');
      const key = normalizeFlair(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({ name, emoji });
    }
    await saveFlairList(context, await currentSubredditName(context), list);
    context.ui.showToast(`Saved ${list.length} flairs`);
  }
);

Devvit.addMenuItem({
  label: 'Manage flairs',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const subredditName = await currentSubredditName(context);
    const list = await loadFlairList(context, subredditName);
    // Live post flairs not yet in the saved list are added with an empty emoji to fill in.
    try {
      const known = new Set(list.map((e) => normalizeFlair(e.name)));
      for (const template of await context.reddit.getPostFlairTemplates(subredditName)) {
        const name = (template.text ?? '').trim();
        const key = normalizeFlair(name);
        if (!key || known.has(key)) continue;
        known.add(key);
        list.push({ name, emoji: '' });
      }
    } catch (error) {
      console.error('Could not load post flair templates:', error);
    }
    context.ui.showForm(manageFlairsForm, { list, note: await outstandingDeletionsNote(context, subredditName) });
  },
});

// Fetch historical posts: send recent public posts from a date range that
// are not yet in the configured channel, or just count them.

const DAY_SECONDS = 86400;

/** The start of a YYYY-MM-DD day in UTC, in Unix seconds, or null when the text is not a valid date. */
function parseDay(text: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const ms = Date.parse(`${text}T00:00:00Z`);
  // A day that does not exist, such as 30 February, would otherwise roll into the next month.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== text) return null;
  return Math.floor(ms / 1000);
}

const historicalFetchForm = Devvit.createForm(
  (data) => ({
    title: 'Fetch historical posts',
    description:
      'Sends recent public posts that have not yet been sent to the Slack channel currently set in the app settings. Posts already sent to that channel are skipped. The app keeps its record of a sent post until that post is deleted or removed on Reddit, or until the app is uninstalled and installed again; after a reinstall, every post in the range is sent again.' +
      String(data.note ?? ''),
    fields: [
      { type: 'string', name: 'startDate', label: 'Start date (YYYY-MM-DD)' },
      { type: 'string', name: 'endDate', label: 'End date (YYYY-MM-DD)' },
      { type: 'number', name: 'limit', label: 'Number of posts', defaultValue: DEFAULT_POSTS_LIMIT },
      {
        type: 'boolean',
        name: 'sinceChange',
        label: 'Only send posts with time stamps after the slackbot token or channel was changed.',
        helpText: 'Uncheck to include older posts.',
        defaultValue: true,
      },
      { type: 'boolean', name: 'countOnly', label: 'Count only (do not send to Slack)', defaultValue: false },
    ],
    acceptLabel: 'Fetch posts',
  }),
  async (event, context) => {
    const { reddit, ui } = context;
    const values = event.values as {
      startDate?: string;
      endDate?: string;
      limit?: number;
      sinceChange?: boolean;
      countOnly?: boolean;
    };

    // A blank date leaves that side of the range open.
    const startText = (values.startDate ?? '').trim();
    const endText = (values.endDate ?? '').trim();
    const start = startText ? parseDay(startText) : -Infinity;
    const end = endText ? parseDay(endText) : Infinity;
    if (start === null || end === null) {
      ui.showToast('Dates must be in YYYY-MM-DD format. Nothing was sent.');
      return;
    }

    const { target, slackFingerprint, template, appearance } = await readSettings(context.settings);
    if (!target && !values.countOnly) {
      ui.showToast('Slack bot token or channel ID not configured');
      return;
    }

    try {
      const subredditName = await currentSubredditName(context);
      const recent = await fetchPublicPosts(reddit, subredditName, values.limit || DEFAULT_POSTS_LIMIT);
      const changedAtSeconds = (await slackSettingsChangedAt(context, subredditName, slackFingerprint)) / 1000;
      const earliest = values.sinceChange === false ? start : Math.max(start, changedAtSeconds);
      // The end date is included in full.
      const inRange = recent.filter((post) => post.createdUtc >= earliest && post.createdUtc < end + DAY_SECONDS);
      if (values.countOnly || !target) {
        ui.showToast(`Found ${inRange.length} posts in that date range`);
        return;
      }

      const unsent = await filterUnsent(context, subredditName, inRange, target.channel);
      const alreadySent = inRange.length - unsent.length;
      const flairMap = await loadFlairMap(context, subredditName);
      const sentCount = await sendPosts(context, subredditName, unsent, { target, flairMap, template, appearance });
      ui.showToast(
        `Sent ${sentCount} of ${unsent.length} posts to Slack` + (alreadySent ? ` (${alreadySent} were already in this channel)` : '')
      );
    } catch (error) {
      console.error('Historical fetch failed:', error);
      ui.showToast('Could not fetch posts. Please try again.');
    }
  }
);

Devvit.addMenuItem({
  label: 'Fetch historical posts to Slack',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const note = await outstandingDeletionsNote(context, await currentSubredditName(context));
    context.ui.showForm(historicalFetchForm, { note });
  },
});
