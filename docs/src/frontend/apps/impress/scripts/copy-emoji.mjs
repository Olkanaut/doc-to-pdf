/**
 * Copies Apple emoji images from emoji-datasource-apple into the public directory.
 * Used as a pre-step for both `dev` (Turbopack) and `build` (webpack) so that
 * neither pipeline needs a webpack CopyPlugin for this purpose.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const src = resolve(
  __dirname,
  '../../../node_modules/emoji-datasource-apple/img/apple/64',
);
const dest = resolve(__dirname, '../public/assets/fonts/emoji');

// Plain read/write instead of cpSync: since Node 24's native cpSync, files are
// created write-only (0200) then fail with EACCES on Docker Desktop bind mounts.
// Removing first also replaces any unreadable leftover from an interrupted copy.
mkdirSync(dest, { recursive: true });
for (const name of readdirSync(src)) {
  const target = resolve(dest, name);
  rmSync(target, { force: true });
  writeFileSync(target, readFileSync(resolve(src, name)));
}

console.log('✔ Emoji assets copied to public/assets/fonts/emoji');
