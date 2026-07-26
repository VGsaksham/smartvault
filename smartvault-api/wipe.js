const pool = require('./src/db/pool');
const Minio = require('minio');
const env = require('./src/config/env');

const minioClient = new Minio.Client(env.MINIO);

async function wipe() {
  try {
    console.log('Wiping database tables...');
    // Delete in correct order to respect foreign keys or just use CASCADE where applicable
    // Or just TRUNCATE with CASCADE
    await pool.query(`TRUNCATE TABLE masterfolders CASCADE`);
    await pool.query(`TRUNCATE TABLE vault_files CASCADE`);
    await pool.query(`TRUNCATE TABLE audit_logs CASCADE`);
    await pool.query(`TRUNCATE TABLE file_sequences CASCADE`);
    
    // Delete all users except Admin
    await pool.query(`DELETE FROM users WHERE role != 'Admin'`);
    console.log('Database wiped successfully. Admin user preserved.');

    console.log('Wiping MinIO bucket...');
    const bucket = env.MINIO.bucket;
    const exists = await minioClient.bucketExists(bucket).catch(() => false);
    if (exists) {
      const objectsList = [];
      const stream = minioClient.listObjects(bucket, '', true);
      stream.on('data', function(obj) { objectsList.push(obj.name); });
      stream.on('error', function(err) { console.error('MinIO list error', err); });
      stream.on('end', async function() {
        if (objectsList.length > 0) {
          await minioClient.removeObjects(bucket, objectsList);
          console.log(`Removed ${objectsList.length} objects from MinIO bucket ${bucket}.`);
        } else {
          console.log('MinIO bucket is already empty.');
        }
        process.exit(0);
      });
    } else {
      console.log('MinIO bucket does not exist.');
      process.exit(0);
    }
  } catch (err) {
    console.error('Wipe failed:', err);
    process.exit(1);
  }
}

wipe();
