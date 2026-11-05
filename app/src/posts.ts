import type { Post, TriggerEventType } from '@devvit/public-api';

/**
 * The post data this app uses, in one shape for both sources: Reddit API
 * `Post` objects (scheduled check, historical fetch) and trigger payloads.
 */
export type SlackPost = {
  id: string;
  title: string;
  author: string;
  url: string;
  flairText: string;
  /** Unix seconds */
  createdUtc: number;
  /** '' for link posts */
  body: string;
  /**
   * From a trigger payload, Reddit's thumbnail field unchanged: a URL, or a
   * word such as "self" or "nsfw". From the Reddit API (scheduled check,
   * historical fetch), the thumbnail URL, or '' when the SDK reports none.
   */
  thumbnailUrl: string;
  nsfw: boolean;
  spoiler: boolean;
  /** Reddit's own type for the post, passed through unchanged; '' when Reddit does not supply one. */
  postType: string;
  authorFlair: string;
  /** '' when unknown */
  language: string;
  score: number;
  commentCount: number;
};

/** The post object Reddit sends with post triggers and moderator actions. */
export type TriggerPost = NonNullable<TriggerEventType['PostCreate']['post']>;

// Reddit gives a post's permalink as a path ("/r/sub/comments/...").
function permalinkUrl(permalink: string): string {
  return `https://www.reddit.com${permalink.startsWith('/') ? '' : '/'}${permalink}`;
}

/** Reddit reports no removal of any kind for the post. */
export function isPublic(post: Post): boolean {
  return !post.removed && !post.spam && !post.removedByCategory;
}

// What Reddit records when a person has already decided against a post. Such
// a post is never sent, wherever it is listed.
const DECIDED_AGAINST = new Set(['author', 'deleted', 'moderator', 'anti_evil_ops', 'community_ops', 'content_takedown', 'copyright_takedown']);

/** A post from Reddit's mod queue list that is waiting for review: not public, and not already removed by someone. */
export function isAwaitingReview(post: Post): boolean {
  return !isPublic(post) && !DECIDED_AGAINST.has(post.removedByCategory ?? '');
}

export function fromRedditPost(post: Post): SlackPost {
  return {
    id: post.id,
    title: post.title,
    author: post.authorName,
    url: permalinkUrl(post.permalink),
    flairText: post.flair?.text ?? '',
    createdUtc: Math.floor(post.createdAt.getTime() / 1000),
    body: post.body ?? '',
    thumbnailUrl: post.thumbnail?.url ?? '',
    nsfw: post.nsfw,
    spoiler: post.spoiler,
    // The API's post object carries no type, unlike trigger payloads.
    postType: '',
    authorFlair: post.authorFlair?.text ?? '',
    language: '',
    score: post.score,
    commentCount: post.numberOfComments,
  };
}

export function fromTriggerPost(p: TriggerPost, author: string): SlackPost {
  return {
    id: p.id,
    title: p.title,
    author,
    url: permalinkUrl(p.permalink),
    flairText: p.linkFlair?.text ?? '',
    createdUtc: Math.floor(p.createdAt / 1000),
    body: p.selftext,
    thumbnailUrl: p.thumbnail,
    nsfw: p.nsfw,
    spoiler: p.isSpoiler,
    postType: p.type,
    authorFlair: p.authorFlair?.text ?? '',
    language: p.languageCode,
    score: p.score,
    commentCount: p.numComments,
  };
}
