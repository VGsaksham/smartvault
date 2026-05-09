import { spawnSync } from 'node:child_process';

function run(args, options = {}) {
  const result = spawnSync('git', args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runQuiet(args) {
  const result = spawnSync('git', args, {
    stdio: 'ignore',
    cwd: process.cwd(),
    shell: false,
  });
  return result.status === 0;
}

const message =
  process.env.npm_config_msg ||
  `backend: update smartvault-api changes (${new Date().toISOString()})`;
const commitName =
  process.env.npm_config_name ||
  process.env.GIT_AUTHOR_NAME ||
  'vgsaksham';
const commitEmail =
  process.env.npm_config_email ||
  process.env.GIT_AUTHOR_EMAIL ||
  'sakshambhown1920@gmail.com';

console.log('Staging backend changes (smartvault-api)...');
run(['add', '-A', 'smartvault-api']);

if (runQuiet(['diff', '--cached', '--quiet'])) {
  console.log('No backend changes to commit.');
  process.exit(0);
}

console.log('Committing backend changes...');
run([
  '-c',
  `user.name=${commitName}`,
  '-c',
  `user.email=${commitEmail}`,
  'commit',
  '-m',
  message,
]);

console.log('Pushing to origin/main...');
run(['push', 'origin', 'main']);

console.log('Backend push complete.');
