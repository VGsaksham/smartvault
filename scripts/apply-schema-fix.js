const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    // Run against smartvault_db !
    const schema = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -d smartvault_db -f /opt/smartvault/scripts/deploy-base-schema.sql`);
    console.log(schema.stdout || schema.stderr);
    
    // Also run db migrations against smartvault_db
    const migrate = await ssh.execCommand(`cd /opt/smartvault/smartvault-api && npm run migrate`);
    console.log(migrate.stdout || migrate.stderr);
    
    // Restart PM2
    const pm2 = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 restart sv-api`);
    console.log(pm2.stdout || pm2.stderr);
    
    // Check if user was created
    const dbCheck = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -d smartvault_db -c "SELECT id, email, role FROM users;"`);
    console.log(dbCheck.stdout || dbCheck.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
