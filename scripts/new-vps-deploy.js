const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');
const ssh = new NodeSSH();

async function deploy() {
  try {
    console.log('Connecting to new VPS...');
    await ssh.connect({
      host: '192.168.1.104',
      port: 22,
      username: 'sanyasi',
      password: 'Snyasi@098765',
      readyTimeout: 30000
    });
    console.log('Connected!');

    // Read the install script locally and convert CRLF to LF
    const scriptPath = path.join(__dirname, 'server-fresh-install.sh');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n');

    // Write the install script to the VPS
    console.log('Uploading install script to /tmp/install.sh...');
    // Use putFile since script contains 'EOF' which breaks cat here-doc
    
    // First save the LF-fixed version to a temp local file
    const tempLocalPath = path.join(__dirname, 'server-fresh-install-fixed.sh');
    fs.writeFileSync(tempLocalPath, scriptContent);
    await ssh.putFile(tempLocalPath, '/tmp/install.sh');
    fs.unlinkSync(tempLocalPath);

    // Environment variables
    const envVars = [
      'DB_PASS=sanyasi@1981',
      'MINIO_ROOT_PASSWORD=sanyasi@1981',
      'MINIO_SECRET_KEY=sanyasi@1981',
      'ADMIN_EMAIL=sanyasi@smartvault.local',
      'ADMIN_PASSWORD=sanyasi@1981',
      'LAN_IP=192.168.1.104'
    ].join(' ');

    console.log('Executing fresh install script (this will take 10+ minutes)...');
    
    // Execute as root using sudo
    // We export variables before running bash
    const command = `echo "Snyasi@098765" | sudo -S env ${envVars} bash /tmp/install.sh`;
    
    // We'll use stream execution to see progress
    await new Promise((resolve, reject) => {
      ssh.connection.exec(command, { pty: true }, (err, stream) => {
        if (err) return reject(err);
        
        stream.on('data', (data) => process.stdout.write(data.toString()));
        stream.stderr.on('data', (data) => process.stderr.write(data.toString()));
        
        stream.on('close', (code) => {
          if (code !== 0) reject(new Error(`Script exited with code ${code}`));
          else resolve();
        });
      });
    });

    console.log('Deployment completed successfully!');

  } catch (err) {
    console.error('Deployment Failed:', err);
  } finally {
    ssh.dispose();
  }
}

deploy();
