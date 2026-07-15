const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    // Check DB users
    const dbCheck = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -d smartvault -c "SELECT id, email, role FROM users;"`);
    console.log('=== DB Users ===');
    console.log(dbCheck.stdout || dbCheck.stderr);
    
    // Check PM2 logs
    const logs = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 logs sv-api --lines 50 --nostream`);
    console.log('=== API Logs ===');
    console.log(logs.stdout || logs.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
