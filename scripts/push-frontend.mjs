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
  `frontend: update app changes (${new Date().toISOString()})`;
const commitName =
  process.env.npm_config_name ||
  process.env.GIT_AUTHOR_NAME ||
  'vgsaksham';
const commitEmail =
  process.env.npm_config_email ||
  process.env.GIT_AUTHOR_EMAIL ||
  'sakshambhown1920@gmail.com';

console.log('Staging frontend changes...');
run([
  'add',
  '-A',
  '.',
  ':(exclude)smartvault-api',
  ':(exclude)localtunnel.err.log',
  ':(exclude)localtunnel.out.log',
  ':(exclude)localtunnel.ps.log',
]);

if (runQuiet(['diff', '--cached', '--quiet'])) {
  console.log('No frontend changes to commit.');
  process.exit(0);
}

console.log('Committing frontend changes...');
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

console.log('Frontend push complete.');
