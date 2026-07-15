const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({host:'192.168.1.104', port:2022, username:'sanyasi', password:'Snyasi@098765', readyTimeout: 20000});
    const res = await ssh.execCommand('echo "Snyasi@098765" | sudo -S sed -i \'s/ADMIN_BOOTSTRAP_PASSWORD="admin"/ADMIN_BOOTSTRAP_PASSWORD="sanyasi@1981"/g\' /opt/smartvault/smartvault-api/.env && echo "Snyasi@098765" | sudo -S pm2 restart sv-api');
    console.log(res.stdout || res.stderr);
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
