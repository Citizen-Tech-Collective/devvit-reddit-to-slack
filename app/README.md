# `reddit-to-slack`

`reddit-to-slack` sends new posts from a subreddit to a channel in a Slack workspace the subreddit's moderators choose. It is for moderation teams and the people who work alongside them in Slack, so a team can see new posts as they arrive and respond on Reddit.

The app is a notification relay only. It never posts, comments, removes or edits anything on Reddit, and it never reads private messages, modmail or user profiles. It reads public posts in the subreddit it is installed on, sends one Slack message per post, and deletes or redacts that Slack message when the post is deleted on Reddit.

## What it does

- **Sends new posts to Slack.** A Reddit trigger fires for each post and the app sends one Slack message to the configured channel. By default the message shows the post title as the sender name and the flair's emoji as the icon, so the feed is easy to scan. Both can be turned off.
- **Chooses which posts count.** A setting decides between public posts only, or public posts plus the posts in Reddit's mod queue, the list of things waiting for a moderator to review. The app uses Reddit's own list and does not decide for itself what belongs in it. Mod queue posts can go to a channel of their own. A public post is sent about ten seconds after Reddit reports it, and only if Reddit still shows it as public then, so a post removed straight away is never sent. A post a moderator approves is sent to the main channel if it is not already there, including one that was in the mod queue channel or was removed and taken out of Slack earlier.
- **Catches anything missed.** A scheduled check, every 15 minutes by default, looks at the newest public posts and sends any that have not yet been sent to Slack, so a brief outage does not lose posts. The same check sends mod queue posts when those are turned on, so they arrive at the next check, not within seconds. Unless that is turned off in the settings, it leaves alone posts made before the bot token or a channel ID last changed, so setting the app up or pointing it at a new channel does not send older posts by itself. It never sends a post that has been deleted or removed.
- **Removes deleted posts from Slack.** When a post previously sent to Slack is deleted or removed, the app deletes the Slack message, or redacts it in place, and then clears its own record of the post. If Slack does not accept the removal, the app retries on a lengthening schedule. See "Handling deleted posts".
- **Maps flairs to emoji.** The Manage flairs menu action lists the subreddit's post flairs and lets moderators choose the Slack emoji for each one, without a code change.
- **Optional catch-up.** A second menu action fetches recent public posts within a date range and sends the ones not already sent to the channel currently configured, or just counts them. By default it only looks at posts made since the bot token or channel ID last changed; turn that option off to include older posts, for example to fill a new channel.

## How it is set up

Setup has two parts: creating a Slack app in the workspace, and filling in the app's settings on Reddit. Both are done by the subreddit's moderators.

**In Slack.** Create a Slack app at https://api.slack.com/apps in the workspace that should receive posts. Under OAuth & Permissions, add the bot token scopes `chat:write` and `chat:write.customize`; the second one allows the per-message sender name and icon. Install the Slack app to the workspace and copy its bot token, which starts with `xoxb-`. Invite the bot to the channel that should receive posts.

**On Reddit.** In the subreddit, open Mod Tools, then Installed Apps, then `reddit-to-slack`. The settings page has five groups.

| Group and setting | What it does |
| --- | --- |
| **💬 SLACK SETTINGS** | Opens with the Slack setup steps above and how to find a channel ID. |
| Slack bot token | The Slack app's bot token, starting with `xoxb-`. Reddit does not allow secret settings for a single subreddit's install, so this token is stored as a normal setting and is visible to the subreddit's moderators. |
| Channel ID for post notifications | The Slack channel that receives post notifications, for example C08HZK6B8KA. Required. The bot must be a member of the channel. To find it, open the channel, click its name at the top, and copy the ID at the bottom of the About tab. |
| Channel ID for mod queue posts (optional) | If filled in, and mod queue posts are turned on, those posts go to this channel. If left blank they go to the same channel as public posts. The bot must be a member of this channel too. |
| **🎨 MESSAGE APPEARANCE** | Opens with a note on how these two options change what happens when a post is deleted. |
| Use post title as message sender | On by default. The post title is shown as the message's sender name. When off, the message shows the Slack app's own name. |
| Use flair emoji as message icon | On by default. The emoji mapped to the post's flair in Manage flairs is shown as the message's icon. A post whose flair has no emoji, or no flair at all, shows the Slack app's own icon. |
| **➡️ WHAT SHOULD BE SENT TO SLACK?** | |
| Send | "Public posts" (default) sends each post once Reddit has made it visible, and a post a moderator approves. "Public posts and mod queue posts" also sends the posts in Reddit's mod queue, picked up at each scheduled check. If a post is later deleted or removed, its Slack message is deleted or redacted. |
| **🔄 MISSED POST SETTINGS** | |
| Number of posts to fetch | How many of the newest posts the scheduled check looks at. Default 10. |
| Only send posts with time stamps after the slackbot token or channel was changed. | On by default. The scheduled check leaves alone any post made before the Slack bot token or a channel ID last changed, so setting the app up or changing a channel does not send older posts. Uncheck to include older posts. |
| Schedule interval | How often the scheduled check runs: 5, 10, 15, 20 or 30 minutes, or 1, 2, 3, 4, 6, 12 or 24 hours. Default 15 minutes. Changes take effect on the next app upgrade or reinstall. |
| **✏️ MESSAGE FORMAT** | Opens with the list of variables below. |
| Post notification text | The body of each post notification, pre-filled with the default text below. Edit it freely. The message body is this text with its variables filled in. Two things can alter it, both described below: the shipped default text is tidied when a value is missing, and a body longer than Slack allows is shortened. The text is checked when it is saved, and the settings page refuses it, saying why, if a link is missing its closing `>`, does not start with `https://` or a URL variable, has a space in its address, or uses any variable inside an address other than `{author}`, `{author_lower}`, `{post_id}`, `{subreddit}`, `{post_url}` or `{thumbnail_url}`; or if a variable name is not one the app knows. Links use Slack's syntax, `<url\|text to display>`, so the author name or title can be shown as the text of any link you choose. Variables are replaced when the message is sent: `{title}`, `{author}`, `{author_lower}` (for URLs), `{author_flair}`, `{post_url}`, `{post_id}`, `{post_type}` (the post type as Reddit reports it; empty for posts sent by the scheduled check or the historical fetch, where Reddit does not supply it), `{body}`, `{body_preview}` (first 300 characters), `{thumbnail_url}` (exactly as Reddit stores it, which can be a word such as "self" instead of an address), `{flair}`, `{flair_emoji}`, `{subreddit}`, `{language}`, `{nsfw}` and `{spoiler}` (the words NSFW or Spoiler when flagged, otherwise empty), `{created_at}` (shown in each reader's timezone), `{created_iso}`, `{score}` and `{comment_count}` (as of the moment of sending). An unknown variable is left as typed so a typo is visible in Slack. Emptying the box restores the default text. |

The scheduled check is created by the install itself. There is nothing to start by hand.

## Flairs and their emoji

The app can show each post's flair as an emoji icon on its Slack message, which makes a busy feed easier to scan. No flairs are mapped when the app is first installed.

Open the subreddit's "…" menu and choose **Manage flairs**. The dialog shows one card per flair, plus three blank cards. It is pre-filled from the subreddit's current post flairs: any flair not yet saved appears with its name and an empty emoji field, and flairs already saved keep their emoji. Type the Slack emoji name without colons, for example `tada` for :tada:. Edit a name to rename a flair, fill a blank card to add one, or clear a name to remove one, then Save. Flair names are matched to Reddit's post flair text ignoring case, spaces and punctuation. If the subreddit has no post flairs and nothing has been saved, the dialog opens with just the three blank cards.

A post whose flair has no emoji, or no flair at all, is sent without an icon, so Slack shows the Slack app's own icon. If an emoji does not exist in the workspace, Slack also shows the app's icon.

## What a Slack message looks like

With both MESSAGE APPEARANCE options on, each post sent to Slack produces one message:

> [flair emoji] **Post title**  
> [flair emoji] **[post title]** (linked)  
> From: [reddit username] ([author's user flair])

Example:

> :tada: **Looking for advice on a first build**  
> :tada: **[Looking for advice on a first build](https://www.reddit.com/r/example/comments/abc123/)**  
> From: testuser (Regular)

With "Use post title as message sender" off, the first line shows the Slack app's name instead of the title. The body lines come from the MESSAGE FORMAT setting, whose default is:

```
{flair_emoji} *<https://www.reddit.com/r/{subreddit}/comments/{post_id}|{title}>*
From: {author} ({author_flair})
```

Moderators can edit it there. With the default in place, a post whose flair has no emoji drops the leading space, and an author with no user flair drops the empty parentheses; an edited template is sent exactly as written. Text from Reddit (titles, post text, flair and user flair) is prepared so it displays in Slack as the author wrote it: the three characters Slack treats specially, `&`, `<` and `>`, are escaped, and HTML entities Reddit sometimes includes, such as `&amp;`, are turned back into their characters first. Slack accepts at most 3,000 characters in a message of this kind, so a longer one, for example a template that includes `{body}` on a long post, is cut to fit and ends with "…"; the cut never falls inside a link. If the template produces an empty message for a post, for example a template made only of `{nsfw}` on a post that is not flagged, the post is not sent and the app logs that it was skipped. Link previews are turned off to keep the feed compact.

## Handling deleted posts

Reddit requires apps to remove deleted content from everywhere the app has sent it. When a post is deleted on Reddit, the app:

1. Removes the Slack message, in one of two ways depending on how that message was sent, which the MESSAGE APPEARANCE settings decided at the time:
   - **If the message was sent with the post title as sender or a flair emoji as icon, it is deleted.** Slack does not allow a message's sender name or icon to be changed after it is sent, and those would still show the post's title or flair, so the whole message is removed.
   - **Otherwise the Slack message is redacted in place.** Its text is replaced with a short notice that carries only the post's short ID, the subreddit, when the post was made and when it was deleted, with times shown in each reader's own timezone. The title, author and link are removed.
2. Deletes its own record of the post and of the Slack message it sent, from Reddit-hosted storage, once Slack confirms.

Example of a redacted message:

> 🗑 **Reddit post deleted**  
> Post ID: abc123 (r/example)  
> Posted: Oct 22 at 4:26 PM  
> Deleted: Oct 22 at 6:04 PM

Deleting or redacting a message does not touch replies in its thread, or copies people have made elsewhere in Slack. The moderators and workspace admins who install the app are responsible for reviewing and removing those. This responsibility is set out in the Terms of Service.

If Slack cannot find the message, for example because someone already deleted it, the app treats the post as handled. If Slack does not accept a removal, what happens next depends on Slack's answer:

- **The channel no longer exists or the bot is no longer in it, the bot token or its account is no longer usable, or the bot is not allowed to act on the message** (for example `channel_not_found`, `invalid_auth`, `token_revoked`, `missing_scope`, `cant_delete_message`): the app stops trying and keeps its record (the post ID and Slack message reference only, never the content). It tries again at the next scheduled check after the bot token or channel ID setting changes. Until then the moderators must remove the message in Slack by hand.
- **Anything else, including rate limits and outages:** the app keeps its record (the post ID and Slack message reference only, never the content) and tries again after 10 seconds, 30 seconds, 3 minutes, 10 minutes, 30 minutes, 1 hour, 12 hours, 3 days and 1 week. If the last attempt fails it gives up and clears its record; the moderators must remove the message in Slack by hand.

While any removal is outstanding, the Manage flairs and Fetch historical posts dialogs say how many deleted posts the app is still retrying, and how many could not be removed and are waiting for a settings change.

If the channel setting changes, older messages stay on record with the channel they were sent to, so a post that was sent to both the old and the new channel is removed from both. If the bot token is replaced with one that cannot reach the old channel, for example a token from a different Slack workspace, removals of older messages wait as described above and run if the earlier token is restored. The app keeps the Slack message reference for every post it has sent until that post is deleted or removed on Reddit, so a deletion can be acted on no matter how old the post is.

## Data handling in brief

The app reads post data the subreddit's moderators can see: public posts, and, when mod queue posts are turned on, the posts in Reddit's mod queue, which are not public. The default message uses the post ID, title, author username, author flair and post flair. Through the MESSAGE FORMAT variables, moderators can also include the post's body text, link and thumbnail URLs, post type, NSFW and spoiler flags, language, creation time, score and comment count. Whatever the message contains is sent to the Slack channel the moderators configured. In Reddit-hosted storage it keeps, for each post sent to Slack, the post ID and a reference to each Slack message it posted (channel and message ID), so it does not send the same post twice and can delete or redact that message later; the record is removed when the post is deleted or removed on Reddit and its Slack message has been deleted or redacted. It also keeps the flair list moderators save in Manage flairs and a short one-way fingerprint of the bot token and channel ID settings with the time they last changed, used only to notice that one of them has changed. The Slack bot token is stored in the app's settings for the subreddit and is visible to that subreddit's moderators. Nothing goes to the developer or to any other third party. Full details are in the Privacy Policy linked from the app's details page.

## Fetch domains

This app makes outbound HTTPS requests to exactly one host.

| Domain | Why it is needed |
| --- | --- |
| `slack.com` | Every post notification is a call to Slack's `chat.postMessage` API. When a post is deleted on Reddit, the app calls `chat.delete` to delete its Slack message, or `chat.update` to redact it. All calls go to `https://slack.com/api/` and are authenticated with the subreddit's own bot token. No other external requests are made. |

The domain is declared in `devvit.json` under `permissions.http.domains`.

## Limitations

- Each install sends to one Slack channel, or two when mod queue posts are given a channel of their own.
- The scheduled check looks at the newest posts only, up to the configured limit.
- The catch-up action looks at the newest posts up to the number entered in its dialog, then keeps those inside the date range, so a wide date range on a busy subreddit needs a larger number.
- Replies in a Slack message's thread are not removed when the post is deleted.

## Troubleshooting

**No posts are arriving in Slack.**
- Check that the Slack bot token and channel ID are both filled in on the app's settings page.
- Check that the bot has been invited to the channel. In Slack, type `/invite @your-app-name` in that channel.
- The scheduled check only sends posts made since the bot token or a channel ID last changed. To send older posts, use **Fetch historical posts to Slack** and uncheck "Only send posts with time stamps after the slackbot token or channel was changed."

**Mod queue posts are not arriving.**
- Check that "Send" is set to "Public posts and mod queue posts".
- Mod queue posts are sent at each scheduled check, not within seconds. Wait one schedule interval.
- If a separate channel is set for them, the bot must be invited to that channel too.

**A message shows the Slack app's name or icon instead of the post title or flair emoji.**
- Check that the two MESSAGE APPEARANCE options are on.
- The Slack app needs the `chat:write.customize` scope. If the scope was added after the app was installed, reinstall the Slack app to the workspace and paste the new bot token into the settings.
- For the icon, open **Manage flairs** and check that the post's flair has an emoji. The emoji name is entered without colons and must exist in the Slack workspace under exactly that name.

**A post was deleted on Reddit but its message is still in Slack.**
- Open **Manage flairs** or **Fetch historical posts to Slack**. If removals are outstanding, the dialog says how many are being retried and how many are waiting for a settings change.
- A removal waits for a settings change when the bot has been removed from the channel, the channel is archived, or the bot token is no longer valid. Fix that in Slack, or correct the token or channel ID in the settings, and the app tries again at the next scheduled check.
- Replies in the message's thread, and copies people made elsewhere in Slack, are never removed by the app.

**The settings page will not save the message format.**
- Read the message it shows: it names the link or variable that is wrong. The rules are listed under "Post notification text" in the settings table above.

**A message is cut short, or a post produced no message.**
- Slack accepts at most 3,000 characters, so a longer message is shortened and ends with "…". This usually means the format includes `{body}`.
- A post is skipped when the message format produces nothing for it.

**The schedule interval was changed but the timing did not.**
- A new interval takes effect the next time the app is upgraded or reinstalled on the subreddit.

**For the developer.** The app's logs record post IDs, counts and Slack's error codes, never post content. Read them with `npx devvit logs YOUR_SUBREDDIT`.

## Support and reporting problems

The app is developed by Citizen Tech Collective, LLC. To report a bug, ask a question, or raise a policy concern, open an issue at https://github.com/Citizen-Tech-Collective/devvit-reddit-to-slack/issues. Reports are reviewed and acted on within a reasonable time.

## For developers

The app is written in TypeScript on `@devvit/public-api` 0.15.0 with the legacy entry point `src/main.tsx` and configuration in `devvit.json`. From this folder, run `npm install`, `npx tsc --noEmit` to type-check, `npm test` to run the tests (Node 22.6 or later; they cover the message format check and the preparation of Reddit text for Slack, and need no extra packages), `npx devvit playtest YOUR_TEST_SUBREDDIT` to try it on a test subreddit, and `npx devvit upload` to publish a version. Terms of Service and Privacy Policy links must be saved in the app details form before a version that uses fetch can be approved. The full deployment guide is in `docs/devvit-deployment-guide.md` in the repository.

### Project structure

| File in `src/` | What it holds |
|---|---|
| `main.tsx` | The scheduled check and the triggers for new posts and approvals |
| `settings.ts` | The settings page, and reading settings with their defaults |
| `posts.ts` | The shape of a post, from Reddit's API and from trigger payloads |
| `slack.ts` | Building Slack messages and calling the Slack Web API |
| `slackText.ts` | Preparing Reddit text so it displays correctly in Slack |
| `template.ts` | The message format's variables and the check run when it is saved |
| `store.ts` | Everything kept in Reddit-hosted storage |
| `sending.ts` | Sending one post or a batch |
| `deletions.ts` | Removing messages from Slack when a post is deleted, with retries |
| `dialogs.ts` | The Manage flairs and Fetch historical posts dialogs |

Tests are in `tests/`. `devvit.json` declares the triggers, permissions and the one fetch domain.

## Contributing

Bug reports, questions and suggestions are welcome as issues at https://github.com/Citizen-Tech-Collective/devvit-reddit-to-slack/issues. Please do not include a Slack bot token or anything sensitive; issues are public.

The code is not open source, so please open an issue to discuss a change before sending one. Anything you send, including a proposed change, may be used by Citizen Tech Collective, LLC as the LICENSE file describes.

## License

Copyright (c) 2026 Citizen Tech Collective, LLC. All rights reserved.

Anyone may install and use the app as it is published on Reddit's Developer Platform. The source code is published so it can be read and checked; it is not open source, and it may not be copied, modified, redistributed or deployed without written permission from Citizen Tech Collective, LLC. The full terms are in the [LICENSE](https://github.com/Citizen-Tech-Collective/devvit-reddit-to-slack/blob/main/LICENSE) file.
