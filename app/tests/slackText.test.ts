import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toSlackText } from '../src/slackText.ts';

describe('text from Reddit prepared for Slack', () => {
  const cases: [string, string, string][] = [
    ['plain text is unchanged', 'Looking for advice', 'Looking for advice'],
    ['an ampersand', 'Q&A thread', 'Q&amp;A thread'],
    ['angle brackets', 'if a < b then <tag>', 'if a &lt; b then &lt;tag&gt;'],
    ['a pipe is left alone', 'this | that', 'this | that'],
    ['an entity Reddit already encoded is not escaped twice', 'Q&amp;A thread', 'Q&amp;A thread'],
    ['encoded angle brackets', '5 &lt; 6 &gt; 4', '5 &lt; 6 &gt; 4'],
    ['quotes and apostrophes delivered as entities', '&quot;it&#39;s fine&quot; &apos;ok&apos;', '"it\'s fine" \'ok\''],
    ['numeric entities, decimal and hex', 'caf&#233; &#x2764;', 'café ❤'],
    ['an encoded entity that hides a bracket', '&#60;b&#62;', '&lt;b&gt;'],
    ['an unknown entity is kept as text', 'AT&T; &madeup; done', 'AT&amp;T; &amp;madeup; done'],
    ['accents, emoji and non-Latin text pass through', 'Año nuevo 🎉 日本語', 'Año nuevo 🎉 日本語'],
    ['Slack formatting characters pass through', '*bold* _under_score ~x~ `code`', '*bold* _under_score ~x~ `code`'],
    ['a non-breaking space delivered as an entity', 'a&nbsp;b', 'a\u00A0b'],
    ['an empty value', '', ''],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => assert.equal(toSlackText(input), expected));
  }
});
