// The {variables} a message template can use, split by whether their value
// is safe inside the address part of a Slack link (<address|text>).

/** The only variables allowed inside an address: identifiers and whole addresses. */
const ADDRESS_SAFE = ['author', 'author_lower', 'post_id', 'subreddit', 'post_url', 'thumbnail_url'] as const;

/** Everything else. Fine as link text or in the message body, refused inside an address. */
const TEXT_ONLY = [
  'title',
  'body',
  'body_preview',
  'flair',
  'flair_emoji',
  'author_flair',
  'post_type',
  'language',
  'nsfw',
  'spoiler',
  'created_at',
  'created_iso',
  'score',
  'comment_count',
] as const;

/** Whole addresses, so a link may start with one instead of https://. */
const URL_VARIABLES = ['post_url', 'thumbnail_url'];

export type TemplateVariable = (typeof ADDRESS_SAFE)[number] | (typeof TEXT_ONLY)[number];

const KNOWN = new Set<string>([...ADDRESS_SAFE, ...TEXT_ONLY]);
const REFUSED_IN_ADDRESS = new Set<string>(TEXT_ONLY);

function variablesIn(text: string): string[] {
  return [...text.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]);
}

/**
 * Checks a template a moderator is saving. Returns what is wrong with it, in
 * words for the settings page, or undefined when it can be sent. The template
 * itself is never rewritten.
 */
export function validateTemplate(template: string): string | undefined {
  let linkNumber = 0;
  let rest = template;
  let outsideLinks = '';

  while (rest.includes('<')) {
    const open = rest.indexOf('<');
    outsideLinks += rest.slice(0, open);
    const afterOpen = rest.slice(open + 1);
    const close = afterOpen.search(/[<>\n]/);
    linkNumber++;
    if (close === -1 || afterOpen[close] !== '>') return `Link ${linkNumber} is missing its closing >.`;

    const inside = afterOpen.slice(0, close);
    rest = afterOpen.slice(close + 1);
    // Slack's own tokens (<!date^...>, <!here>, <@user>, <#channel>) are left to Slack.
    if (/^[!@#]/.test(inside)) continue;

    const [address, ...textParts] = inside.split('|');
    const startsWithUrlVariable = URL_VARIABLES.some((name) => address.startsWith(`{${name}}`));
    if (!startsWithUrlVariable && !/^(https?:\/\/|mailto:)/.test(address)) {
      return `Link ${linkNumber} has to start with https:// or with a URL variable such as {post_url}.`;
    }
    if (/\s/.test(address)) {
      return `Link ${linkNumber} has a space in its address. The address is the part before the |.`;
    }
    const refused = variablesIn(address).find((name) => REFUSED_IN_ADDRESS.has(name));
    if (refused) {
      return `{${refused}} cannot be used inside a link address. Put it after the | as the link text.`;
    }
    outsideLinks += address + textParts.join('|');
  }
  outsideLinks += rest;

  const unknown = variablesIn(outsideLinks).find((name) => !KNOWN.has(name));
  if (unknown) return `{${unknown}} is not a variable this app knows. Check the spelling against the list above.`;
  return undefined;
}
