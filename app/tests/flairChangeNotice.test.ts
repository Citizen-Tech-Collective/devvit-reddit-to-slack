import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { flairChangeNotice } from '../src/flair.ts';

describe('the notice posted in a thread when a flair changes', () => {
  const cases: [string, string, string | undefined, string][] = [
    ['from one flair to another', 'Discussion', 'News', 'Flair changed from *News* to *Discussion*'],
    ['a flair added to a post that had none', 'Q&A', '', 'Flair set to *Q&amp;A*'],
    ['a flair change on a message sent before the flair was kept', 'Discussion', undefined, 'Flair changed to *Discussion*'],
    ['a flair removed', '', 'News', 'Flair *News* removed'],
    ['a flair removed from a message sent before the flair was kept', '', undefined, 'Flair removed'],
  ];
  for (const [name, flair, previous, expected] of cases) {
    it(name, () => assert.equal(flairChangeNotice(flair, previous), expected));
  }
});
