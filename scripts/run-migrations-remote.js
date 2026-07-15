const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    console.log('Running migrations...');
    // Create the DB if it doesn't exist, just in case
    await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -c "CREATE USER sv_user WITH PASSWORD 'sv_pass_123';"`);
    await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -c "CREATE DATABASE smartvault OWNER sv_user;"`);
    await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE smartvault TO sv_user;"`);
    
    // Run the node migration script
    const res = await ssh.execCommand(`cd /opt/smartvault/smartvault-api && npm run migrate`);
    console.log('=== Migrations ===');
    console.log(res.stdout || res.stderr);
    
    // Restart PM2 to re-trigger the bootstrap user creation
    const pm2 = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 restart sv-api`);
    console.log('=== PM2 Restart ===');
    console.log(pm2.stdout || pm2.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
