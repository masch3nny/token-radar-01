// Token Radar, radar-2. Node 22, standard library only.
//
// The program reads the sealed snapshot (from /input/snapshot.json, or
// from the file or directory named by --input), scores every rankable
// pre-token protocol with the radar-2 model, and writes the ranked board
// to the output directory together with the dashboard's data file, the
// dashboard itself, its screenshots, and the dossier the judge reads.
//
// The dashboard is a static page with no framework and no network: it
// reads the data file this program writes beside it. The model prices
// each protocol the way the market already prices its own kind — a
// category multiple read off the snapshot's live-token protocols, then
// growth, maturity and chain spread — and the board covers every rankable
// pre-token protocol, not just the watchlist floor.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleRadar, checkBoard, payloadScript, readSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The dossier's text cap, and the caps the gate holds screenshots and the dashboard to. */
const TEXT_MAX_BYTES = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const PAGE_LIMIT = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after a --name flag, in either --name value or --name=value form, or the fallback. */
function flagValue(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) {
    const next = process.argv[at + 1]!;
    if (!next.startsWith('--')) return next;
  }
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (joined !== undefined) return joined.slice(name.length + 3);
  return fallback;
}

const inputGiven = flagValue('input', '/input');
const inputFile = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snap = readSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = assembleRadar(snap);
const problem = checkBoard(board, snap);
if (problem !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), payloadScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyDir(join(here, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!SHOT_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this output directory and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SHOT_LIMIT, dashboard: PAGE_LIMIT }),
);

process.stdout.write(
  `token radar: ${snap.protocols.length} protocols, ${snap.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
