// Slack treats exactly three characters as control characters in message
// text: & < and >. Everything else is displayed as typed.

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0' };

// Reddit sometimes delivers text with HTML entities already in it ("Q&amp;A").
// Escaping that again would show the entity itself in Slack ("Q&amp;A"
// instead of "Q&A"), so entities are turned back into characters first.
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** Text from Reddit, made safe to place in a Slack message so that it displays as the author wrote it. */
export function toSlackText(text: string): string {
  return decodeEntities(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
