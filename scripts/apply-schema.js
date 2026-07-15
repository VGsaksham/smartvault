const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    console.log('Applying base schema...');
    // The repo was cloned to /opt/smartvault, so the sql file is there!
    const schema = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S -u postgres psql -d smartvault -f /opt/smartvault/scripts/deploy-base-schema.sql`);
    console.log(schema.stdout || schema.stderr);
    
    console.log('Running migrations...');
    const migrate = await ssh.execCommand(`cd /opt/smartvault/smartvault-api && npm run migrate`);
    console.log(migrate.stdout || migrate.stderr);
    
    console.log('Restarting PM2 to trigger bootstrap...');
    const pm2 = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 restart sv-api`);
    console.log(pm2.stdout || pm2.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
