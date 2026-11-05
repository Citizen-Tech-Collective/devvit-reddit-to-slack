import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateTemplate } from '../src/template.ts';

function link(address: string, text = 'x'): string {
  return `<${address}|${text}>`;
}

describe('templates that can be saved', () => {
  const accepted: [string, string][] = [
    ['the shipped default', '{flair_emoji} *<https://www.reddit.com/r/{subreddit}/comments/{post_id}|{title}>*\nFrom: {author} ({author_flair})'],
    ['the earlier default with a profile link', 'User: <https://www.reddit.com/user/{author_lower}|{author}>\nRespond to *{flair}* Post: <https://www.reddit.com/r/{subreddit}/comments/{post_id}|{title}>'],
    ['an empty box, which restores the default', ''],
    ['plain text with no links or variables', 'A new post arrived'],
    ['links that start with a URL variable', '<{post_url}|{title}> and <{thumbnail_url}|thumb>'],
    ['a link with no text part', '<https://www.reddit.com/r/{subreddit}>'],
    ['a mailto link', '<mailto:mods@example.com|Email the mods>'],
    ["Slack's own date token written by hand", 'Posted <!date^1700000000^{date_short_pretty} at {time}|then>'],
    ['Slack mentions and channel links', '<!here> <@U123ABC> <#C123ABC>'],
    ['a quote marker and a pipe outside any link', '> quoted {title} | {flair}'],
    ['every variable used as text', '{title} {author} {author_lower} {flair} {flair_emoji} {subreddit} {post_id} {post_url} {body} {body_preview} {thumbnail_url} {nsfw} {spoiler} {post_type} {author_flair} {language} {created_at} {created_iso} {score} {comment_count}'],
    ['a free-text variable as link text', link('https://example.com', '{title} by {author} in {flair}')],
  ];
  for (const [name, template] of accepted) {
    it(name, () => assert.equal(validateTemplate(template), undefined));
  }
});

describe('variables inside a link address', () => {
  for (const name of ['author', 'author_lower', 'post_id', 'subreddit']) {
    it(`allows {${name}}`, () => assert.equal(validateTemplate(link(`https://example.com/{${name}}`)), undefined));
  }
  const refused = ['title', 'body', 'body_preview', 'flair', 'flair_emoji', 'author_flair', 'post_type', 'language', 'nsfw', 'spoiler', 'created_at', 'created_iso', 'score', 'comment_count'];
  for (const name of refused) {
    it(`refuses {${name}}`, () =>
      assert.equal(
        validateTemplate(link(`https://example.com/{${name}}`)),
        `{${name}} cannot be used inside a link address. Put it after the | as the link text.`
      ));
  }
});

describe('links that cannot work', () => {
  it('missing its closing >', () => {
    assert.equal(validateTemplate('<https://reddit.com/{post_id}|{title}'), 'Link 1 is missing its closing >.');
  });
  it('unclosed link followed by a good one', () => {
    assert.equal(validateTemplate('<https://a.com|x <https://b.com|y>'), 'Link 1 is missing its closing >.');
  });
  it('a link broken across two lines', () => {
    assert.equal(validateTemplate('<https://a.com|first\nsecond>'), 'Link 1 is missing its closing >.');
  });
  it('names the right link when an earlier one is fine', () => {
    assert.equal(validateTemplate('<https://a.com|ok> then <https://b.com|broken'), 'Link 2 is missing its closing >.');
  });
  it('no https:// at the start', () => {
    assert.equal(
      validateTemplate('<www.reddit.com/{post_id}|{title}>'),
      'Link 1 has to start with https:// or with a URL variable such as {post_url}.'
    );
  });
  it('starts with a variable that is not a URL', () => {
    assert.equal(
      validateTemplate('<{subreddit}/comments/{post_id}|{title}>'),
      'Link 1 has to start with https:// or with a URL variable such as {post_url}.'
    );
  });
  it('a space in the address', () => {
    assert.equal(
      validateTemplate('<https://reddit.com/ {post_id}|{title}>'),
      'Link 1 has a space in its address. The address is the part before the |.'
    );
  });
});

describe('variable names', () => {
  it('a misspelled variable in the text', () => {
    assert.equal(validateTemplate('From {autor}'), '{autor} is not a variable this app knows. Check the spelling against the list above.');
  });
  it('a misspelled variable as link text', () => {
    assert.equal(validateTemplate(link('https://example.com', '{titel}')), '{titel} is not a variable this app knows. Check the spelling against the list above.');
  });
  it('a misspelled variable inside an address', () => {
    assert.equal(validateTemplate(link('https://example.com/{post_idd}')), '{post_idd} is not a variable this app knows. Check the spelling against the list above.');
  });
  it('{link_url} is not a known variable', () => {
    assert.equal(validateTemplate('<{link_url}|link>'), 'Link 1 has to start with https:// or with a URL variable such as {post_url}.');
    assert.equal(validateTemplate('See {link_url}'), '{link_url} is not a variable this app knows. Check the spelling against the list above.');
  });
  it('braces that are not a variable are left alone', () => {
    assert.equal(validateTemplate('Score {Score} and {123} and { title }'), undefined);
  });
});
