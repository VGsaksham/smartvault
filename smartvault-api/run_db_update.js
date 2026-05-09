const { exec } = require('child_process');

const cmd = `echo Veron1920@ | sudo -S -u postgres psql -d smartvault_db -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'light'; ALTER TABLE users ADD COLUMN IF NOT EXISTS can_upload_to_allowed BOOLEAN DEFAULT false;"`;

exec(cmd, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});
