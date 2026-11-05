# Deploying the reddit-to-slack Devvit app

This guide covers building, testing, uploading and installing `reddit-to-slack` (`app/` in this repository) on Devvit 0.15. The app sends a subreddit's new posts to a Slack channel through a Slack app's bot token, which each subreddit's moderators enter in the app's settings.

For what the app does, how moderators configure it, and how deletions are handled, see [`app/README.md`](../app/README.md). That file ships inside the app and is what Reddit's reviewers read.

## Prerequisites

- Node.js 18 or newer.
- The Devvit CLI, installed globally. The package is `devvit`, not the older `@devvit/cli`:

  ```bash
  npm install -g devvit
  ```

- A Reddit account to own the app. App ownership is tied to the account that first uploads it and is not easily transferred, so use the account that should hold it long term, not a personal one.
- The Terms of Service and Privacy Policy hosted at public URLs. Their source is `app/TERMS.md` and `app/PRIVACY.md`.
- For testing, a Slack workspace where you can create an app, and a test channel.

## Project layout

```
devvit-reddit-to-slack/
├── app/                  # the Devvit app
│   ├── devvit.json       # app name, entry point, triggers, permissions
│   ├── package.json      # @devvit/public-api 0.15.0, typescript 5.8.3
│   ├── tsconfig.json     # extends the SDK's config
│   ├── src/main.tsx      # the whole app
│   ├── README.md         # user-facing documentation, read by Reddit's reviewers
│   ├── PRIVACY.md        # source for the hosted Privacy Policy
│   └── TERMS.md          # source for the hosted Terms of Service
└── docs/                 # this guide
```

Devvit 0.15 removed support for `devvit.yaml`. If one reappears in the folder, delete it; `devvit.json` is the only configuration file.

TypeScript is pinned to 5.8.3 on purpose. That is the version Devvit 0.15.0 itself develops against, and it is only used for the local type check. Devvit's upload bundles the app with its own toolchain, so the local compiler version never affects what runs on Reddit.

## 1. Install dependencies and type-check

```bash
cd app && npm install
```

```bash
cd app && npx tsc --noEmit
```

The type check should finish with no output. Run it after every code change.

## 2. Log in

```bash
cd app && npx devvit login
```

This opens a browser for Reddit sign-in. Confirm the account:

```bash
cd app && npx devvit whoami
```

## 3. Create a Slack app for testing

1. Create an app at https://api.slack.com/apps, from scratch, in the test workspace.
2. Under OAuth & Permissions, add the bot token scopes `chat:write` and `chat:write.customize`.
3. Install the app to the workspace and copy the Bot User OAuth Token, which starts with `xoxb-`.
4. Invite the bot to the test channel, and note the channel's ID (click the channel name; the ID is at the bottom of the About tab).

## 4. Playtest on a test subreddit

Create or pick a small test subreddit you moderate. Playtesting installs a live-reloading build there and streams logs to the terminal:

```bash
cd app && npx devvit playtest YOUR_TEST_SUBREDDIT
```

The first playtest or upload with `slack.com` in `devvit.json` submits that domain for Reddit's review. Until it is approved, every Slack call fails with a network error. Approval usually takes one to two business days. Approved domains appear under Developer Settings on the app's page at developers.reddit.com.

Configure the app on the test subreddit: Mod Tools, then Installed Apps, then `reddit-to-slack`. Paste the bot token into "Slack bot token", enter the test channel's ID, and submit a post to the subreddit. Expect one Slack message per post. With the MESSAGE APPEARANCE options on, the post title is the sender name and the flair emoji, if one is mapped in Manage flairs, is the icon.

To test deletion handling, delete a test post on Reddit and confirm its Slack message is deleted. Then turn both MESSAGE APPEARANCE options off, send another post, delete it, and confirm its Slack message is redacted in place to a "Reddit post deleted" notice.

## 5. Fill in the app details

On the app's page at developers.reddit.com, open its details or settings form and set:

- **Terms of Service** and **Privacy Policy** links, pointing at the hosted copies of `app/TERMS.md` and `app/PRIVACY.md`. Reddit requires both for any app that uses fetch, and rejects links to Reddit's own policies.
- A description that summarises `README.md`.

If `PRIVACY.md` or `TERMS.md` changes, update the hosted copies. Hosting them where editing keeps the URL means the links on Reddit do not need updating.

## 6. Upload a version

```bash
cd app && npx devvit upload
```

The first upload creates the app under the signed-in account. The app name in `devvit.json` is `reddit-to-slack` and must be unique across Reddit and no longer than 20 characters. Later uploads add versions and bump the version in `package.json`.

An uploaded version is private by default: only the uploading account can install it.

## 7. Publish for review

To install on a subreddit other than your own test one, the version must be reviewed:

```bash
cd app && npx devvit publish
```

Review normally takes one to two business days for version updates and longer for first submissions or apps using fetch.

Every version you want to install must be published, so batch changes rather than publishing each small fix.

## 8. Install and configure on a subreddit

Once approved, install from the app's page on developers.reddit.com, choosing the subreddit. A moderator of that subreddit then creates the subreddit's own Slack app (step 3) and configures the install: Mod Tools, then Installed Apps, then `reddit-to-slack`.

| Setting | Value |
| --- | --- |
| Slack bot token | The subreddit's Slack app bot token, starting with `xoxb-` |
| Channel ID for post notifications | The channel that should receive posts; the bot must be a member |
| Use post title as message sender | On unless the team prefers the Slack app's name as sender |
| Use flair emoji as message icon | On unless the team prefers the Slack app's icon |
| Send | "Only published posts" unless you want held posts pushed before moderation |
| Number of posts to fetch | 10 unless the subreddit is very busy |
| Schedule interval (minutes) | 15 by default; 5 minimum |

Then open the subreddit's "…" menu, choose **Manage flairs**, and set an emoji for each flair that should have an icon.

The scheduled poll is created by the install itself. There is nothing to start by hand.

## 9. Upgrade an existing install

After publishing a new version, upgrade the install from the app's page or from Mod Tools. The upgrade re-creates the scheduled poll with the current interval setting, cancelling the previous job first. Changes to the schedule interval only take effect on upgrade or reinstall.

## 10. Watch logs

```bash
cd app && npx devvit logs r/YOUR_SUBREDDIT
```

Logs are kept for 5,000 entries or 7 days. Add `--verbose` for timestamps.

## Troubleshooting

- **Slack calls fail with a network error.** The `slack.com` domain is not yet approved for this app. Check Developer Settings on the app's page.
- **Slack returns `not_in_channel`.** Invite the bot to that channel in Slack.
- **Slack returns `invalid_auth` or `missing_scope`.** The "Slack bot token" setting is empty or wrong, or the Slack app lacks `chat:write` / `chat:write.customize`. Paste a fresh bot token into the setting.
- **A deleted post's Slack message stays, with `message_not_found` or `cant_delete_message` in the logs.** The message was already removed in Slack, or was sent by a different Slack app than the one whose token is now set.
- **Posts arrive twice.** The Redis record of processed posts was cleared, usually by a reinstall. It self-heals: each post is recorded on first send.
- **The scheduled poll never runs.** The install predates the AppInstall and AppUpgrade triggers. Upgrade the install once to create the job.
- **The CLI refuses `devvit.yaml`.** Delete the file. Configuration lives in `devvit.json` on Devvit 0.15.
- **"App can only be installed on subreddits with fewer than 200 subscribers."** The version is not published or not yet approved. Private versions can only go on small subreddits you moderate.
