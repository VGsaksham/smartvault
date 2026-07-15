const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
async function run() {
  await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
  const logs = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 logs sv-api --lines 50 --nostream`);
  console.log(logs.stdout || logs.stderr);
  ssh.dispose();
}
run();
