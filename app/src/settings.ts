import { Devvit, type Context } from '@devvit/public-api';
import { noteSlackSettingsSaved } from './store.js';
import { validateTemplate } from './template.js';

// Body of the post notification. Moderators can edit it in the MESSAGE FORMAT
// setting; {variables} are filled in at send time by renderTemplate().
export const DEFAULT_POST_TEMPLATE =
  '{flair_emoji} *<https://www.reddit.com/r/{subreddit}/comments/{post_id}|{title}>*\n' +
  'From: {author} ({author_flair})';

export const DEFAULT_POSTS_LIMIT = 10;

// Every choice divides evenly into an hour or a day, so the scheduled check
// really does run that far apart. Other values would not: the scheduler works
// from clock patterns, and "every 45 minutes" would run at :00 and :45.
const DEFAULT_INTERVAL = { minutes: 15, label: '15 minutes' };
export const SCHEDULE_INTERVALS = [
  { minutes: 5, label: '5 minutes' },
  { minutes: 10, label: '10 minutes' },
  DEFAULT_INTERVAL,
  { minutes: 20, label: '20 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 360, label: '6 hours' },
  { minutes: 720, label: '12 hours' },
  { minutes: 1440, label: '24 hours' },
];

// Devvit settings fields do not accept `required`; validation runs through
// onValidate when moderators save the settings page.
type FieldEvent = { value: string | undefined };

function requireValue({ value }: FieldEvent): string | undefined {
  return value && value.trim() ? undefined : 'This field is required.';
}

// For the bot token and the channel IDs: record the moment a moderator saves
// a different value, so the app knows when its Slack destination changed.
async function noteChange(settingName: string, { value }: FieldEvent, context: Context): Promise<void> {
  try {
    const current = String((await context.settings.get(settingName)) ?? '').trim();
    if ((value ?? '').trim() !== current && context.subredditName) {
      await noteSlackSettingsSaved(context, context.subredditName);
    }
  } catch (error) {
    console.error('Could not record the settings change time:', error);
  }
}

Devvit.addSettings([
  {
    type: 'group',
    label: '💬 SLACK SETTINGS',
    helpText:
      '\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0To connect this subreddit to Slack:\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A01. Create a Slack app at https://api.slack.com/apps (From scratch) in the workspace that should receive posts.\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A02. Under OAuth & Permissions, add the Bot Token Scopes chat:write and chat:write.customize.\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A03. Install the app to the workspace, then copy the Bot User OAuth Token (it starts with xoxb-) into the field below.\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A04. In Slack, invite the bot to the channel, for example by typing /invite @your-app-name in that channel.\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A05. Find the channel ID: open the channel, click its name at the top, and copy the ID shown at the bottom of the About tab.\n',
    fields: [
      // Installation scope so each subreddit brings its own Slack app. Reddit
      // does not allow secret settings at installation scope, so this is a
      // plain string and moderators of the subreddit can see it.
      {
        type: 'string',
        name: 'slackBotToken',
        onValidate: async (event, context) => {
          const problem = requireValue(event);
          if (!problem) await noteChange('slackBotToken', event, context);
          return problem;
        },
        label: '\u00A0\u00A0\u00A0Slack bot token',
        helpText: '\n\u00A0\u00A0\u00A0\u00A0Starts with xoxb-. The Slack app needs the chat:write and chat:write.customize scopes, and the bot must be invited to the channel below. Moderators of this subreddit can see this token.',
        scope: 'installation',
      },
      {
        type: 'string',
        name: 'slackChannelId',
        onValidate: async (event, context) => {
          const problem = requireValue(event);
          if (!problem) await noteChange('slackChannelId', event, context);
          return problem;
        },
        label: '\u00A0\u00A0\u00A0Channel ID for post notifications',
        helpText: '\n\u00A0\u00A0\u00A0\u00A0Where we should send post notifications (for example C08HZK6B8KA). The app must be invited to this channel.',
        scope: 'installation',
      },
      {
        type: 'string',
        name: 'modQueueChannelId',
        onValidate: async (event, context) => {
          await noteChange('modQueueChannelId', event, context);
        },
        label: '\u00A0\u00A0\u00A0Channel ID for mod queue posts (optional)',
        helpText: '\n\u00A0\u00A0\u00A0\u00A0If filled in, and mod queue posts are turned on below, those posts go to this channel. If left blank, they go to the same channel as public posts. The app must be invited to this channel too.',
        scope: 'installation',
      },
    ],
  },
  {
    type: 'group',
    label: '🎨 MESSAGE APPEARANCE',
    helpText:
      '\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0Slack cannot change the sender name or icon of a message after it is sent. So when either option below is on, the app deletes a post\'s Slack message outright if the post is deleted on Reddit.\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0When both are off, the app instead edits the message in place, replacing its text with a short notice that the post was deleted.\n',
    fields: [
      {
        type: 'boolean',
        name: 'useTitleAsSender',
        label: '\u00A0\u00A0\u00A0Use post title as message sender',
        defaultValue: true,
        scope: 'installation',
      },
      {
        type: 'boolean',
        name: 'useFlairAsIcon',
        label: '\u00A0\u00A0\u00A0Use flair emoji as message icon',
        defaultValue: true,
        scope: 'installation',
      },
    ],
  },
  {
    type: 'group',
    label: '➡️ WHAT SHOULD BE SENT TO SLACK?',
    helpText:
      '\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0• "Public posts" sends each post once Reddit has made it visible, and sends a post a moderator approves.\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0• "Public posts and mod queue posts" also sends the posts in Reddit\'s mod queue, the list of things waiting for a moderator to review. Those are picked up at each scheduled check.\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0If a post is later deleted or removed, its Slack message is deleted or redacted.\n',
    fields: [
      {
        type: 'select',
        name: 'postsToSend',
        label: '\u00A0\u00A0\u00A0Send',
        options: [
          { label: 'Public posts', value: 'public' },
          { label: 'Public posts and mod queue posts', value: 'modqueue' },
        ],
        defaultValue: ['public'],
        multiSelect: false,
      },
    ],
  },
  {
    type: 'group',
    label: '🔄 MISSED POST SETTINGS',
    helpText: '\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0A scheduled check catches anything the push missed.',
    fields: [
      {
        type: 'number',
        name: 'postsLimit',
        label: '\u00A0\u00A0\u00A0Number of posts to fetch',
        defaultValue: 10,
        helpText: '\n\u00A0\u00A0\u00A0\u00A0How many of the newest posts each scheduled check looks at.',
      },
      {
        type: 'boolean',
        name: 'onlySinceChange',
        label: '\u00A0\u00A0\u00A0Only send posts with time stamps after the slackbot token or channel was changed.',
        helpText: '\n\u00A0\u00A0\u00A0\u00A0Uncheck to include older posts.',
        defaultValue: true,
        scope: 'installation',
      },
      {
        type: 'select',
        name: 'scheduleInterval',
        label: '\u00A0\u00A0\u00A0Schedule interval',
        options: SCHEDULE_INTERVALS.map(({ minutes, label }) => ({ label, value: String(minutes) })),
        defaultValue: [String(DEFAULT_INTERVAL.minutes)],
        multiSelect: false,
        helpText: '\n\u00A0\u00A0\u00A0\u00A0Changes take effect on the next app upgrade or reinstall.',
      },
    ],
  },
  {
    type: 'group',
    label: '✏️ MESSAGE FORMAT',
    helpText:
      '\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0The text of each post notification. The sender name and icon are set under MESSAGE APPEARANCE; this box controls the body.\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0Links use Slack\'s syntax: <url|text to display>. Variables are replaced when the message is sent:\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0{author} the Reddit username   {author_lower} the same in lower case, for URLs   {author_flair} the author\'s user flair\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0{title} the post title   {post_url} the post\'s Reddit URL   {post_id} the post ID   {post_type} the post type as Reddit reports it\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0{body} the full post text   {body_preview} its first 300 characters   {thumbnail_url} the thumbnail as Reddit stores it\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0{flair} the flair text   {flair_emoji} the flair emoji, e.g. :usa:   {subreddit} the subreddit name   {language} the language code\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0{nsfw} the word NSFW when flagged, else empty   {spoiler} the word Spoiler when flagged, else empty\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0{created_at} when the post was made, in each reader\'s timezone   {created_iso} the same as an ISO timestamp   {score} and {comment_count} at the time of sending\n' +
      '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0Slack formatting works: *bold*, _italic_. Leave the box empty to restore the default.\n',
    fields: [
      {
        type: 'paragraph',
        name: 'postTemplate',
        onValidate: ({ value }) => validateTemplate(value ?? ''),
        label: '\u00A0\u00A0\u00A0Post notification text',
        defaultValue: DEFAULT_POST_TEMPLATE,
        lineHeight: 4,
        scope: 'installation',
      },
    ],
  },
]);

export type AppearanceOptions = { useTitleAsSender: boolean; useFlairAsIcon: boolean };
export type SlackTarget = { token: string; channel: string };

/**
 * A 32-bit FNV-1a hash of the bot token and the two channel ID settings. It
 * cannot be turned back into the token; it only lets the app notice that one
 * of those settings has changed.
 */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

// Select settings come back as an array of chosen values.
async function selected(settings: Context['settings'], name: string): Promise<unknown> {
  const value = await settings.get(name);
  return Array.isArray(value) ? value[0] : value;
}

/** The clock pattern for the chosen schedule interval. */
export async function readScheduleCron(settings: Context['settings']): Promise<{ cron: string; label: string }> {
  const chosen = Number(await selected(settings, 'scheduleInterval'));
  const interval = SCHEDULE_INTERVALS.find(({ minutes }) => minutes === chosen) ?? DEFAULT_INTERVAL;
  const hours = interval.minutes / 60;
  let cron = `*/${interval.minutes} * * * *`;
  if (hours === 24) cron = '0 0 * * *';
  else if (hours >= 1) cron = `0 */${hours} * * *`;
  return { cron, label: interval.label };
}

export async function readSettings(settings: Context['settings']) {
  const token = String((await settings.get('slackBotToken')) ?? '').trim();
  const channel = String((await settings.get('slackChannelId')) ?? '').trim();
  const modQueueChannel = String((await settings.get('modQueueChannelId')) ?? '').trim();
  const target: SlackTarget | null = token && channel ? { token, channel } : null;
  const sendModQueue = (await selected(settings, 'postsToSend')) === 'modqueue';
  const template = String((await settings.get('postTemplate')) ?? '');
  // These toggles default to on; a setting never saved comes back undefined
  const appearance: AppearanceOptions = {
    useTitleAsSender: (await settings.get('useTitleAsSender')) !== false,
    useFlairAsIcon: (await settings.get('useFlairAsIcon')) !== false,
  };
  return {
    target,
    /** Where mod queue posts go: their own channel if one is set, otherwise the main one. Null when they are not being sent. */
    modQueueTarget: target && sendModQueue ? { token, channel: modQueueChannel || channel } : null,
    slackFingerprint: fingerprint(`${token}\n${channel}\n${modQueueChannel}`),
    postsLimit: Number(await settings.get('postsLimit')) || DEFAULT_POSTS_LIMIT,
    onlySinceChange: (await settings.get('onlySinceChange')) !== false,
    template: template.trim() ? template : DEFAULT_POST_TEMPLATE,
    appearance,
  };
}
