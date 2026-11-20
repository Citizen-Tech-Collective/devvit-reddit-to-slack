// The app's imports end in ".js", as the Devvit TypeScript config requires,
// while the tests run the ".ts" sources directly. This hook, loaded by the
// test command, points such an import at the ".ts" file when one exists.
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';

if (isMainThread) register(import.meta.url);

export function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL) {
    const asTs = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(asTs))) return next(asTs.href, context);
  }
  return next(specifier, context);
}
