const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    console.log('Uploading accessService.js...');
    await ssh.putFile('./smartvault-api/src/services/accessService.js', '/tmp/accessService.js');
    await ssh.execCommand(`echo "Snyasi@098765" | sudo -S cp /tmp/accessService.js /opt/smartvault/smartvault-api/src/services/accessService.js`);

    console.log('Restarting API...');
    const apiRes = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 restart sv-api`);
    console.log(apiRes.stdout || apiRes.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
