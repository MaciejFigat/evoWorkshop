import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [id, ...titleWords] = process.argv.slice(2);
const usage = 'usage: yarn new-game <id> [Title words...]   (id: [a-z0-9-])';

if (id === undefined || !/^[a-z0-9-]+$/.test(id)) {
  console.error(usage);
  process.exit(1);
}

const gamesDir = resolve(import.meta.dirname, '../apps/bench/games');
const template = resolve(gamesDir, '_template');
const target = resolve(gamesDir, id);

if (existsSync(target)) {
  console.error(`games/${id} already exists`);
  process.exit(1);
}

const title = titleWords.length > 0 ? titleWords.join(' ') : id;
cpSync(template, target, { recursive: true });
for (const name of readdirSync(target)) {
  const file = resolve(target, name);
  const text = readFileSync(file, 'utf8').replaceAll('__ID__', id).replaceAll('__TITLE__', title);
  writeFileSync(file, text);
}
console.log(`created apps/bench/games/${id} — it is already in the gallery. Write docs/passports/${id}.md before touching main.ts.`);
