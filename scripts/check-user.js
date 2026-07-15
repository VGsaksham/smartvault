const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
async function run() {
  await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
  const res = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -d smartvault_db -c "SELECT id, email, role FROM users;"`);
  console.log(res.stdout || res.stderr);
  
  const logs = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 logs sv-api --lines 20 --nostream`);
  console.log(logs.stdout || logs.stderr);
  ssh.dispose();
}
run();
