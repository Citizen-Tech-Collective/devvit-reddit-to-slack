# `reddit-to-slack` — Privacy Policy

**Last updated:** 4 November 2026
**Developer:** Citizen Tech Collective, LLC ("CTC", "we")

`reddit-to-slack` is a Reddit Developer Platform (Devvit) app that sends new subreddit posts to a Slack channel configured by that subreddit's moderators. It also deletes or redacts the Slack messages it creates when the corresponding posts are deleted or removed on Reddit.

Moderators choose the Slack destination and message format. The app never asks Reddit users for anything and never acts on a user's behalf. This policy is available from the app's listing on Reddit's Developer Platform before the app is installed, and from the app's source repository.

## Information the app processes

The app processes information only to deliver messages, prevent duplicates, and delete or redact Slack messages when posts are deleted or removed.

- **Post information.** Messages use data from public posts. If the installing moderators turn on mod queue posts, the app also reads Reddit's mod queue for the subreddit and sends those posts, which are not public and are visible on Reddit only to the subreddit's moderators. By default, this includes the post title, post ID, author's username, and flair. Moderators can change the message using the variables available in the app.
- **Moderator actions.** The app receives subreddit moderator-action events to identify post approvals. It ignores other moderator actions without storing them.
- **Installation settings.** Reddit stores the Slack bot token, channel ID, and other moderator-configured options in the app's installation settings. The token is visible to the subreddit's moderators but is never included in messages or logs.
- **Stored records.** Reddit-hosted storage holds each forwarded post's ID and, for each Slack message it became, the Slack channel and message identifiers. These records prevent duplicate messages and allow the app to locate messages for deletion or redaction. The app also stores moderator-configured flair names and their corresponding Slack emoji names. The app stores a short one-way fingerprint of the bot token and channel ID settings and the time they last changed. The fingerprint cannot be turned back into the token; it only lets the app notice that a setting has changed. While a deleted post's Slack message is waiting to be removed, the app also stores the post's creation and deletion times. It does not store post titles, post text, or usernames in this storage.
- **Diagnostic logs.** The app logs post IDs, subreddit names, counts, and error messages. It does not log post titles, post text, usernames, or Slack bot tokens. Reddit hosts these logs and keeps, per installation, the most recent 5,000 entries or 7 days, whichever is less. CTC can read them.

## Storage and sharing

The app runs on Reddit's Developer Platform. Reddit hosts its installation settings, stored records, and diagnostic logs. CTC keeps no separate database or copy of this information and has no access to any Slack workspace the app posts to other than ones where a CTC account is one of that workspace's users. Installing the app or using a Slack bot token in the app does not by itself grant CTC access to the corresponding Slack workspace or visibility into its messages.

CTC can read the app's diagnostic logs, which contain only the items listed above as being part of the diagnostic logs, and can see the installation settings of a subreddit only where a CTC account is one of that subreddit's moderators. The app's source code is public, so anyone can verify these statements.

Post information is sent to the Slack workspace and channel selected by the installing moderators. Slack messages are subject to Slack's policies and the workspace's access and retention settings. CTC does not control that workspace or its members' use of messages. Reddit and Slack may process information in countries other than the post author's country; the installing moderators choose the Slack workspace and are responsible for any resulting transfer of data across borders.

The app does not sell or license data, use it for advertising or AI training, or perform tracking, analytics, profiling, or surveillance. It does not read private messages or modmail, collect user credentials, or modify Reddit posts or accounts.

## Retention and deletion

The app retains post-to-message records so it can prevent duplicates and find the corresponding Slack messages. It removes a record when the post is deleted or removed on Reddit and the Slack message has been deleted or redacted. If Slack does not accept the removal, the app keeps the record, which holds identifiers only, and retries on a lengthening schedule for up to about eleven days. If Slack reports that the channel or the bot token is no longer valid, or that the app may not act on the message, the app stops retrying, keeps the record, and tries again when the installing moderators change the bot token or channel ID setting; until then the message must be removed in Slack by the moderators. If the last scheduled retry fails, the app removes its record and the message must be removed in Slack by the moderators. Flair settings remain until moderators change them or the installation's data is deleted.

When Reddit notifies the app that a forwarded post has been deleted or removed, the app:

- Deletes the Slack message if the post title was used as its sender name or the flair was used as its icon, because those fields cannot be edited.
- Otherwise, replaces the message with a deletion notice containing only the post ID, subreddit, posting time, and deletion time.

The app cannot delete copies, forwards, threaded replies, or other content created by Slack users or automations.

Uninstalling the app stops further processing and automatic updates to Slack messages. It does not delete messages already in Slack; moderators must remove those messages separately.

## Your choices and requests

**Post authors:** Deleting your post on Reddit triggers the deletion or redaction process described above. For questions or additional deletion requests, contact CTC using the link below. Requests concerning messages in a moderator-controlled Slack workspace may require coordination with that subreddit's moderators.

**Moderators:** You can change or clear the app's settings, delete messages directly in Slack, or uninstall the app to stop further processing.

**Opting out:** The app only ever acts on posts in subreddits whose moderators installed it, and has no individual opt-out setting. Contact the subreddit's moderators if you do not want your posts forwarded to their Slack channel.

CTC will handle deletion requests in accordance with applicable law and Reddit's requirements, including the DPA's 10-day deletion requirement.

## Responsibilities

CTC and Reddit are independent controllers of Reddit personal data under Reddit's [Developer Data Protection Addendum](https://redditinc.com/policies/developer-dpa).

Installing moderators control the Slack destination, message configuration, and workspace access. They must use the app in accordance with applicable law and Reddit's and Slack's rules.

This policy does not override Reddit's [Developer Terms](https://redditinc.com/policies/developer-terms), [User Agreement](https://redditinc.com/policies/user-agreement), or [Privacy Policy](https://www.reddit.com/policies/privacy-policy).

## Security

The app uses Reddit's platform for execution and storage. Outbound requests use HTTPS and go only to `slack.com`. Slack bot tokens are never logged or included in messages.

If CTC becomes aware of a security incident affecting app data, we will promptly notify and cooperate with Reddit and provide other notifications as required by law or agreed with Reddit.

## Children

The app is not directed at children under 13 and does not knowingly process their data.

## Changes to this policy

We may update this policy to reflect changes to the app or its data practices. The date above identifies the latest revision.

## Contact

For questions, concerns, or deletion requests, [open an issue in the app's GitHub repository](https://github.com/Citizen-Tech-Collective/devvit-reddit-to-slack/issues). GitHub issues are public; do not include sensitive information or Slack bot tokens.
