const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    const dbCheck = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -d smartvault -c "SELECT id, email, role FROM users;"`);
    console.log('=== DB Users ===');
    console.log(dbCheck.stdout || dbCheck.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
