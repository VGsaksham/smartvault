import { spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─── Paths ────────────────────────────────────────────────────────────────────
// Source: real backend in WSL
const WSL_BACKEND = '\\\\wsl.localhost\\Ubuntu-22.04\\home\\saksham\\smartvault-api';
// Destination: backend folder inside this repo (what gets committed)
const LOCAL_BACKEND = resolve(REPO_ROOT, 'smartvault-api');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function run(args, cwd = REPO_ROOT) {
  const result = spawnSync('git', args, { stdio: 'inherit', cwd, shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}

function runQuiet(args, cwd = REPO_ROOT) {
  return spawnSync('git', args, { stdio: 'ignore', cwd, shell: false }).status === 0;
}

// ─── Step 1: Sync real WSL backend → local copy ───────────────────────────────
console.log(`Syncing from WSL backend → smartvault-api/...`);
console.log(`  Source : ${WSL_BACKEND}`);
console.log(`  Dest   : ${LOCAL_BACKEND}`);

if (!existsSync(LOCAL_BACKEND)) {
  mkdirSync(LOCAL_BACKEND, { recursive: true });
}

// robocopy mirrors source→dest, skipping node_modules, .git, __pycache__
// Exit codes 0-7 are success for robocopy (bitfield of what changed)
try {
  execSync(
    `robocopy "${WSL_BACKEND}" "${LOCAL_BACKEND}" /MIR /XD node_modules .git __pycache__ /XF .env *.log /NP /NFL /NDL`,
    { stdio: 'inherit', cwd: REPO_ROOT }
  );
} catch (e) {
  // robocopy exits non-zero (1-7) even on success — only 8+ are real errors
  if (e.status === undefined || e.status >= 8) {
    console.error('robocopy failed with exit code', e.status);
    process.exit(1);
  }
}

console.log('Sync complete.\n');

// ─── Step 2: Commit & push ───────────────────────────────────────────────────
const message =
  process.env.npm_config_msg ||
  `backend: sync smartvault-api from WSL (${new Date().toISOString()})`;
const commitName =
  process.env.npm_config_name ||
  process.env.GIT_AUTHOR_NAME ||
  'vgsaksham';
const commitEmail =
  process.env.npm_config_email ||
  process.env.GIT_AUTHOR_EMAIL ||
  'sakshambhown1920@gmail.com';

console.log('Staging backend changes...');
run(['add', '-A', 'smartvault-api']);

if (runQuiet(['diff', '--cached', '--quiet'])) {
  console.log('No backend changes to commit. Already up to date.');
  process.exit(0);
}

console.log('Committing...');
run([
  '-c', `user.name=${commitName}`,
  '-c', `user.email=${commitEmail}`,
  'commit', '-m', message,
]);

console.log('Pushing to origin/main...');
run(['push', 'origin', 'main']);

console.log('\n✅ Backend push complete.');
