const Minio = require('minio');
const env = require('./src/config/env');

const minioClient = new Minio.Client(env.MINIO);

async function run() {
  const bucket = 'smartvault-files';
  const testFile = 'test-file-' + Date.now() + '.txt';

  try {
    console.log("1. Checking bucket...");
    console.log("Bucket exists:", await minioClient.bucketExists(bucket));

    console.log("2. Putting object...");
    await minioClient.putObject(bucket, testFile, 'hello world');
    console.log("Put object success!");

    console.log("3. Stat object...");
    const stat = await minioClient.statObject(bucket, testFile);
    console.log("Stat success:", stat);

    console.log("4. Get object...");
    const stream = await minioClient.getObject(bucket, testFile);
    let data = '';
    stream.on('data', chunk => data += chunk);
    stream.on('end', () => console.log("Get success! Data:", data));
    
    // Also try stat on a non-existent file to see if it throws AccessDenied or NoSuchKey
    try {
      await minioClient.statObject(bucket, 'does-not-exist.txt');
    } catch (err) {
      console.log("Expected error for non-existent file:", err.code);
    }

  } catch (err) {
    console.error("Test failed:", err);
  }
}

run();
