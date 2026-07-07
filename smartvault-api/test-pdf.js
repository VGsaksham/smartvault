const { Client } = require('minio');
const fs = require('fs');

const minioClient = new Client({
  endPoint: '127.0.0.1',
  port: 9000,
  useSSL: false,
  accessKey: 'sanyasi@1981',
  secretKey: 'sanyasi@1981'
});

async function run() {
  const chunks = [];
  const stream = await minioClient.getObject('smartvault-files', 'test2/FY_2026-27/test/1782579138719-2.pdf');
  stream.on('data', c => chunks.push(c));
  stream.on('end', () => {
    fs.writeFileSync('downloaded-2.pdf', Buffer.concat(chunks));
    console.log('Saved downloaded-2.pdf, size:', Buffer.concat(chunks).length);
  });
}
run().catch(console.error);

