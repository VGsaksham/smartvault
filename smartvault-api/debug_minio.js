const { exec } = require('child_process');

exec('pm2 logs sv-minio --lines 30 --nostream', (err, stdout, stderr) => {
  console.log(stdout);
  if (stderr) console.error(stderr);
});
