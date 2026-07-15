const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function probe() {
  try {
    await ssh.connect({ host: '192.168.1.104', username: 'sanyasi', password: '987654', readyTimeout: 20000 });
    const commands = [
      'w',
      'last -n 20',
      'echo "987654" | sudo -S tail -n 50 /var/log/auth.log | grep sshd'
    ];
    for (const cmd of commands) {
      const res = await ssh.execCommand(cmd);
      console.log(`== ${cmd} ==`);
      console.log((res.stdout || res.stderr).trim());
    }
    ssh.dispose();
  } catch (e) {
    console.error('Probe failed:', e);
  }
}
probe();
