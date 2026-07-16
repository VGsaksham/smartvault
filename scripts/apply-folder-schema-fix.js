const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    console.log('Uploading fix script...');
    await ssh.putFile('./scripts/fix-folder-update.js', '/tmp/fix-folder-update.js');

    console.log('Running fix script on VPS...');
    const result = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S bash -c "cd /opt/smartvault && node /tmp/fix-folder-update.js"`);
    console.log(result.stdout || result.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
