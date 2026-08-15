const Minio = require('minio');
const env = require('./src/config/env');

const minioClient = new Minio.Client(env.MINIO);

async function test() {
  const bucket = 'smartvault-files';
  const file = 'Sanyasi_Ayurveda/UnknownFY/Account/Sales/1786777197694-activity_report_1.csv';
  
  try {
    console.log("Checking if bucket exists...");
    const exists = await minioClient.bucketExists(bucket);
    console.log("Bucket exists:", exists);
    
    console.log("Testing statObject...");
    const stat = await minioClient.statObject(bucket, file);
    console.log("Stat success:", stat);

    console.log("Testing getObject...");
    const stream = await minioClient.getObject(bucket, file);
    let size = 0;
    stream.on('data', c => size += c.length);
    stream.on('end', () => console.log("Get success! Bytes read:", size));
    stream.on('error', err => console.error("Stream error:", err));

  } catch (err) {
    console.error("Caught error:", err);
  }
}

test();
