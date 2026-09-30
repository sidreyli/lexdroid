/**
 * One command that takes a fresh clone to a runnable state.
 *
 * ESCAP marks a stranger deploying this on a clean machine in under thirty minutes, so setup has
 * to say what it is doing and what is still missing rather than failing at the first gap.
 *
 *   npm run setup
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, WORKING_DB_PATH } from '../src/db/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, '..');
const repoRoot = join(backendRoot, '..');

const rel = (p: string) => relative(repoRoot, p).replace(/\\/g, '/');

function step(name: string, fn: () => void | Promise<void>): Promise<boolean> {
  process.stdout.write(`  ${name} ... `);
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log('ok');
      return true;
    })
    .catch((err: unknown) => {
      console.log('failed');
      console.log(`      ${err instanceof Error ? err.message : String(err)}`);
      return false;
    });
}

/** npm rather than a direct tsx path: in a workspace, dependencies hoist to the repo root. */
function runScript(npmScript: string): void {
  const r = spawnSync('npm', ['run', '--silent', npmScript], {
    cwd: backendRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'no output').trim().split('\n').slice(-4).join('\n      '));
  }
}

async function main(): Promise<void> {
  console.log('LexDroid setup\n');

  const sampleKit = join(repoRoot, 'docs', 'database');
  const haveDocs = existsSync(sampleKit);

  const ok: boolean[] = [];

  ok.push(
    await step('working store', () => {
      openDb().close();
    }),
  );

  if (haveDocs) {
    ok.push(await step("rubric derived from ESCAP's methodology sheet", () => runScript('derive-rubric')));
    ok.push(await step('sample-kit instrument list imported for the NEW/KNOWN tag', () => runScript('import-baseline')));
  } else {
    console.log(`  rubric and baseline ... skipped`);
    console.log(`      ${rel(sampleKit)} is not present. ESCAP's documents are not redistributed`);
    console.log(`      with this repository; place them there and re-run "npm run setup".`);
  }

  console.log('\nEngines');
  const ollama = spawnSync('ollama list', { encoding: 'utf8', shell: true });
  if (ollama.status === 0) {
    const models = ollama.stdout
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(/\s+/)[0])
      .filter((m): m is string => Boolean(m));
    console.log(`  ollama reachable, ${models.length} model(s) installed`);
  } else {
    console.log('  ollama not reachable. Both declared engines run locally through it;');
    console.log('  install it from https://ollama.com and pull the models named in the README.');
  }

  console.log(`\nStore: ${rel(WORKING_DB_PATH)}`);
  if (ok.every(Boolean)) {
    console.log('Ready. Run "npm run dev".');
  } else {
    console.log('Setup did not complete. Fix the failures above and run "npm run setup" again.');
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
