const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({host:'192.168.1.104', port:22, username:'sanyasi', password:'Snyasi@098765'});
    
    console.log('Uploading fixed MainDashboard.tsx (Folder layout toggle)...');
    await ssh.putFile('./src/components/MainDashboard.tsx', '/tmp/MainDashboard.tsx');
    await ssh.execCommand(`echo "Snyasi@098765" | sudo -S cp /tmp/MainDashboard.tsx /opt/smartvault/src/components/MainDashboard.tsx`);

    console.log('Rebuilding Web App (this may take a couple of minutes)...');
    // Rebuild nextjs app
    await new Promise((resolve, reject) => {
      ssh.connection.exec(`echo "Snyasi@098765" | sudo -S bash -c "cd /opt/smartvault && npm run build"`, { pty: true }, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stderr.write(d.toString()));
        stream.on('close', code => resolve());
      });
    });
    
    console.log('Restarting Web App...');
    const webRes = await ssh.execCommand(`echo "Snyasi@098765" | sudo -S pm2 restart sv-web`);
    console.log(webRes.stdout || webRes.stderr);
    
    ssh.dispose();
  } catch(e) {
    console.error(e);
  }
}
run();
