const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    // Fix MINIO_ACCESS_KEY in .env
    const fixEnv = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S sed -i 's/MINIO_ACCESS_KEY=smartvault-app/MINIO_ACCESS_KEY=minioadmin/g' /opt/smartvault/smartvault-api/.env`);
    console.log(fixEnv.stdout || fixEnv.stderr);
    
    // Restart PM2 API
    const pm2 = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 restart sv-api`);
    console.log(pm2.stdout || pm2.stderr);
    
    // Also restart sv-minio just to be absolutely sure the process is healthy
    const minio = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 restart sv-minio`);
    console.log(minio.stdout || minio.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
