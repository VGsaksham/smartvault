const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
async function run() {
  await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
  const res = await ssh.execCommand(`cd /opt/smartvault/smartvault-api && npm run preflight`);
  console.log(res.stdout || res.stderr);
  ssh.dispose();
}
run();
