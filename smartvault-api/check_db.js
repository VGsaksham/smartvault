const fs = require('fs');
const path = require('path');
const Minio = require('minio');
const env = require('./src/config/env');
const pool = require('./src/db/pool');

function ok(msg) {
  console.log(`OK   ${msg}`);
}

function warn(msg) {
  console.warn(`WARN ${msg}`);
}

function fail(msg) {
  console.error(`FAIL ${msg}`);
}

async function checkDbSnapshot() {
  const companies = await pool.query('SELECT id, name FROM companies ORDER BY id');
  console.log('COMPANIES:', JSON.stringify(companies.rows));
  const fys = await pool.query('SELECT id, name, company_id, status FROM financial_years ORDER BY id');
  console.log('FYS:', JSON.stringify(fys.rows));
  const files = await pool.query('SELECT COUNT(*) as total, m.company_id, m.fy_id FROM vault_file_metadata m GROUP BY m.company_id, m.fy_id');
  console.log('FILES_BY_CO_FY:', JSON.stringify(files.rows));
  const sample = await pool.query('SELECT f.id, f.original_name, f.category, m.company_id, m.fy_id FROM vault_files f JOIN vault_file_metadata m ON m.file_id = f.id LIMIT 10');
  console.log('SAMPLE_FILES:', JSON.stringify(sample.rows));
}

async function assertWritableDir(targetDir, label) {
  const testDir = path.resolve(targetDir);
  await fs.promises.mkdir(testDir, { recursive: true });
  const probe = path.join(testDir, `.preflight-write-${Date.now()}.tmp`);
  await fs.promises.writeFile(probe, 'ok', 'utf8');
  await fs.promises.unlink(probe);
  ok(`${label} writable: ${testDir}`);
}

async function checkMinio() {
  const minioClient = new Minio.Client(env.MINIO);
  const exists = await minioClient.bucketExists(env.MINIO.bucket).catch(() => false);
  if (exists) ok(`MinIO reachable and bucket exists: ${env.MINIO.bucket}`);
  else warn(`MinIO reachable but bucket missing: ${env.MINIO.bucket} (API can auto-create if enabled)`);
}

async function runPreflight() {
  console.log('=== SmartVault deploy preflight ===');
  console.log(`NODE_ENV=${env.NODE_ENV}`);
  console.log(`API_BIND=${env.HOST}:${env.PORT}`);
  console.log(`BACKUP_CRON=${env.BACKUP.cron}`);

  if (env.NODE_ENV === 'production' && env.CORS_ORIGINS === '*') {
    fail('CORS_ORIGINS is "*" in production');
  }
  if (String(env.JWT_SECRET || '').length < 24) {
    fail('JWT_SECRET looks weak/short');
  } else {
    ok('JWT_SECRET length is acceptable');
  }

  const ping = await pool.query('SELECT NOW() AS now');
  ok(`DB connected: ${ping.rows[0].now}`);

  await assertWritableDir(env.EXTERNAL_DRIVE_PATH, 'EXTERNAL_DRIVE_PATH');
  await assertWritableDir(env.MEDIA_PREVIEW_CACHE_PATH, 'MEDIA_PREVIEW_CACHE_PATH');
  await assertWritableDir(env.BACKUP.path, 'BACKUP_STORAGE_PATH');
  await checkMinio();
}

async function main() {
  try {
    if (process.argv.includes('preflight')) {
      await runPreflight();
    } else {
      await checkDbSnapshot();
    }
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
