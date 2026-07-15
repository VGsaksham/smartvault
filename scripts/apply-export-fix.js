const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    console.log('Fixing export separator...');
    // Replace slash with " > " in export.js
    const fix = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S sed -i 's/parent ? \`\${parent}\\/\${f.name}\` : f.name;/parent ? \`\${parent} > \${f.name}\` : f.name;/g' /opt/smartvault/smartvault-api/src/routes/export.js`);
    console.log(fix.stdout || fix.stderr);
    
    console.log('Restarting PM2 API...');
    const pm2 = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 restart sv-api`);
    console.log(pm2.stdout || pm2.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
