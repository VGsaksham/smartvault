const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function deploy() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({
      host: '192.168.1.104',
      username: 'sanyasi',
      password: '123456'
    });
    console.log('Connected!');

    const projectPath = '/opt/smartvault';
    console.log(`Using project path: ${projectPath}`);

    const commands = [
      'git fetch origin main',
      'git reset --hard origin/main',
      'git clean -fd',
      'npm install',
      'cd smartvault-api && npm install',
      'cd smartvault-api && npm run migrate',
      'npm run build',
      'HOST=0.0.0.0 HOSTNAME=0.0.0.0 pm2 restart sv-web --update-env',
      'HOST=0.0.0.0 HOSTNAME=0.0.0.0 pm2 restart sv-api --update-env'
    ];

    for (const cmd of commands) {
      console.log(`\n> ${cmd}`);
      const result = await ssh.execCommand(cmd, { cwd: projectPath });
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
    }

    console.log('\nDeployment Complete!');
  } catch (err) {
    console.error('Deployment Failed:', err);
  } finally {
    ssh.dispose();
  }
}

deploy();
