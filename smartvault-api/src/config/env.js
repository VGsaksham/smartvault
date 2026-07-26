const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const asBool = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
};

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5005),
  HOST: process.env.HOST || '0.0.0.0',
  JWT_SECRET: process.env.JWT_SECRET || '',
  CORS_ORIGINS: process.env.CORS_ORIGINS || '',
  EXTERNAL_DRIVE_PATH: process.env.EXTERNAL_DRIVE_PATH || '/home/saksham/dummy_hdd/smartvault_media',
  MEDIA_PREVIEW_CACHE_PATH: process.env.MEDIA_PREVIEW_CACHE_PATH || '/tmp/smartvault/previews',
  AUTO_CREATE_MEDIA_DIRS: asBool(process.env.AUTO_CREATE_MEDIA_DIRS, true),
  DB: {
    user: process.env.DB_USER || 'vaultadmin',
    host: process.env.DB_HOST || '127.0.0.1',
    database: process.env.DB_NAME || 'smartvault_db',
    password: String(process.env.DB_PASSWORD ?? ''),
    port: Number(process.env.DB_PORT || 5432),
  },
  MINIO: {
    endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: asBool(process.env.MINIO_USE_SSL),
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: String(process.env.MINIO_SECRET_KEY ?? ''),
    bucket: process.env.MINIO_BUCKET || 'smartvault-files',
  },
  MINIO_ROOT: {
    user: process.env.MINIO_ROOT_USER || '',
    password: String(process.env.MINIO_ROOT_PASSWORD || ''),
  },
  DEPLOYMENT: {
    autoCreateBucket: asBool(process.env.AUTO_CREATE_MINIO_BUCKET, true),
  },
  BACKUP: {
    path: process.env.BACKUP_STORAGE_PATH || '/var/backups/smartvault',
    cron: process.env.BACKUP_CRON || '0 2 * * *',
    retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 30),
  },
  ADMIN_BOOTSTRAP: {
    enabled: asBool(process.env.ADMIN_BOOTSTRAP_ENABLED),
    username: process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin',
    email: process.env.ADMIN_BOOTSTRAP_EMAIL || '',
    password: String(process.env.ADMIN_BOOTSTRAP_PASSWORD || ''),
    category: process.env.ADMIN_BOOTSTRAP_DEPARTMENT || 'Admin',
  },
  ROOT_DIR: path.resolve(__dirname, '..', '..'),
};

// Fail-fast production validation (prevents half-working deployments).
if (env.NODE_ENV === 'production') {
  const missing = [];
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 24) missing.push('JWT_SECRET (set a long random value)');
  if (!env.CORS_ORIGINS || env.CORS_ORIGINS === '*') missing.push('CORS_ORIGINS (do not use "*")');
  if (!env.DB.password) missing.push('DB_PASSWORD');
  if (!env.MINIO.accessKey) missing.push('MINIO_ACCESS_KEY');
  if (!env.MINIO.secretKey) missing.push('MINIO_SECRET_KEY');
  if (!env.ADMIN_BOOTSTRAP.enabled && (env.ADMIN_BOOTSTRAP.email || env.ADMIN_BOOTSTRAP.password)) {
    // Not required; just avoid confusing partial config.
  }
  if (missing.length > 0) {
    throw new Error(`[ENV] Missing/invalid production settings: ${missing.join(', ')}`);
  }
}

// Dev defaults (keeps local setup easy while still encouraging explicit env in prod)
if (env.NODE_ENV !== 'production') {
  if (!env.JWT_SECRET) env.JWT_SECRET = 'dev-only-secret-change-me';
  if (!env.CORS_ORIGINS) env.CORS_ORIGINS = '*';
  if (!env.DB.password) env.DB.password = 'password123';
  if (!env.MINIO.accessKey) env.MINIO.accessKey = 'admin';
  if (!env.MINIO.secretKey) env.MINIO.secretKey = 'password123';
}

module.exports = env;
