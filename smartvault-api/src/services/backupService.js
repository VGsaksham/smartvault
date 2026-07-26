const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const Minio = require('minio');
const env = require('../config/env');

const BACKUP_PREFIX = 'smartvault-backup-';
const MANIFEST_FILE = 'manifest.json';
const DB_SNAPSHOT_FILE = 'vault_snapshot.json';
const MINIO_DIR = 'minio_objects';
const MEDIA_DIR = 'local_media';

const minioClient = new Minio.Client(env.MINIO);

function getBackupDir() {
  return env.BACKUP.path;
}

function backupStorageUnavailableError(message) {
  const err = new Error(message);
  err.code = 'STORAGE_UNAVAILABLE';
  return err;
}

async function ensureBackupDir() {
  const backupDir = getBackupDir();
  try {
    await fs.promises.mkdir(backupDir, { recursive: true });
    // Validate it is writable.
    const probe = path.join(backupDir, `.sv-backup-probe-${Date.now()}.tmp`);
    await fs.promises.writeFile(probe, 'ok', 'utf8');
    await fs.promises.unlink(probe);
    return backupDir;
  } catch (e) {
    throw backupStorageUnavailableError(
      `Backup storage path is not available or not writable: ${backupDir}`
    );
  }
}

function toBackupIdFromDirname(dirname) {
  if (!dirname.startsWith(BACKUP_PREFIX)) return null;
  return dirname.slice(BACKUP_PREFIX.length);
}

function toBackupDirname(backupId) {
  return `${BACKUP_PREFIX}${backupId}`;
}

function resolveBackupFolder(backupId) {
  if (!backupId || !/^[0-9T:\-\.Z_]+$/.test(backupId)) {
    throw new Error('Invalid backup id');
  }
  return path.join(getBackupDir(), toBackupDirname(backupId));
}

async function readJson(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function writeJson(filePath, payload) {
  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function encodeObjectName(objectName) {
  return Buffer.from(objectName, 'utf8').toString('base64url');
}

function decodeObjectName(encoded) {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function calculateDirSize(dirPath) {
  let total = 0;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await calculateDirSize(fullPath);
    } else if (entry.isFile()) {
      const st = await fs.promises.stat(fullPath);
      total += st.size;
    }
  }
  return total;
}

async function fetchVaultSnapshotFromDb(client, filters = {}) {
  let query = `
    SELECT
      vf.*,
      vfm.masterfolder_id,
      vfm.fy_id
    FROM vault_files vf
    LEFT JOIN vault_file_metadata vfm ON vfm.file_id = vf.id
    WHERE 1=1
  `;
  const values = [];
  
  if (filters.masterfolder_id) {
    values.push(filters.masterfolder_id);
    query += ` AND vfm.masterfolder_id = $${values.length}`;
  }
  if (filters.category) {
    values.push(filters.category);
    query += ` AND vf.category = $${values.length}`;
  }
  if (filters.folder) {
    if (filters.folder === 'null') {
      query += ` AND (vf.folder IS NULL OR vf.folder = 'null')`;
    } else {
      values.push(filters.folder);
      query += ` AND vf.folder = $${values.length}`;
    }
  }
  
  query += ` ORDER BY vf.id ASC`;
  
  const result = await client.query(query, values);

  return result.rows.map((row) => {
    const { masterfolder_id, fy_id, ...fileRow } = row;
    return {
      file: fileRow,
      metadata: {
        masterfolder_id: masterfolder_id ?? null,
        fy_id: fy_id ?? null,
      },
    };
  });
}

function buildChangesSummary(snapshotRecords, currentRecords) {
  const snapshotById = new Map(snapshotRecords.map((r) => [Number(r.file.id), r]));
  const currentById = new Map(currentRecords.map((r) => [Number(r.file.id), r]));

  let filesToAdd = 0;
  let filesToRemove = 0;
  let filesRenamed = 0;
  let filesMoved = 0;
  let filesUpdated = 0;

  for (const [id, record] of snapshotById.entries()) {
    const curr = currentById.get(id);
    if (!curr) {
      filesToAdd += 1;
      continue;
    }

    if ((record.file.original_name || '') !== (curr.file.original_name || '')) filesRenamed += 1;

    const moved =
      (record.file.category || null) !== (curr.file.category || null) ||
      (record.file.folder || null) !== (curr.file.folder || null) ||
      (record.metadata.masterfolder_id || null) !== (curr.metadata.masterfolder_id || null) ||
      (record.metadata.dummyNull || null) !== (curr.metadata.dummyNull || null);
    if (moved) filesMoved += 1;

    const updated =
      (record.file.custom_name || null) !== (curr.file.custom_name || null) ||
      (record.file.tags || null) !== (curr.file.tags || null) ||
      (record.file.expiry_date || null) !== (curr.file.expiry_date || null) ||
      (record.file.is_starred || false) !== (curr.file.is_starred || false);
    if (updated) filesUpdated += 1;
  }

  for (const id of currentById.keys()) {
    if (!snapshotById.has(id)) filesToRemove += 1;
  }

  return {
    files_in_backup: snapshotRecords.length,
    files_current: currentRecords.length,
    files_to_add: filesToAdd,
    files_to_remove: filesToRemove,
    files_renamed: filesRenamed,
    files_moved: filesMoved,
    files_updated: filesUpdated,
  };
}

async function listBackups() {
  const backupDir = await ensureBackupDir();
  const entries = await fs.promises.readdir(backupDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const backups = [];
  for (const dirname of dirs) {
    const backupId = toBackupIdFromDirname(dirname);
    if (!backupId) continue;
    const fullPath = path.join(backupDir, dirname);
    const manifestPath = path.join(fullPath, MANIFEST_FILE);
    if (!(await pathExists(manifestPath))) continue;
    const manifest = await readJson(manifestPath).catch(() => null);
    if (!manifest) continue;
    const size = await calculateDirSize(fullPath).catch(() => 0);
    backups.push({
      backup_id: backupId,
      filename: dirname,
      path: fullPath,
      size_bytes: size,
      created_at: manifest.created_at || null,
    });
  }

  backups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return backups;
}

async function getLatestBackup() {
  const backups = await listBackups();
  return backups[0] || null;
}

async function backupMinioObjects(targetDir, records = [], onProgress = null) {
  const minioDir = path.join(targetDir, MINIO_DIR);
  const objectStoreDir = path.join(getBackupDir(), 'object_store');
  await fs.promises.mkdir(minioDir, { recursive: true });
  await fs.promises.mkdir(objectStoreDir, { recursive: true });
  const objects = [];

  const objectsToBackup = new Set();
  if (!records || records.length === 0) {
    const stream = minioClient.listObjectsV2(env.MINIO.bucket, '', true);
    for await (const obj of stream) {
      if (obj?.name) objectsToBackup.add(obj.name);
    }
  } else {
    for (const r of records) {
      if (r.file && r.file.minio_filename && !r.file.minio_filename.startsWith('local:')) {
        objectsToBackup.add(r.file.minio_filename);
      }
    }
  }

  let processed = 0;
  const total = objectsToBackup.size;

  for (const objectName of objectsToBackup) {
    const encoded = encodeObjectName(objectName);
    const storePath = path.join(objectStoreDir, encoded);
    const outPath = path.join(minioDir, encoded);

    if (!(await pathExists(storePath))) {
      try {
        const readStream = await minioClient.getObject(env.MINIO.bucket, objectName);
        await pipeline(readStream, fs.createWriteStream(storePath));
      } catch (err) {
        console.error('Failed to download object from MinIO for backup:', objectName, err);
        processed++;
        continue;
      }
    }

    try {
      await fs.promises.link(storePath, outPath);
      const stat = await fs.promises.stat(storePath);
      objects.push({
        name: objectName,
        size: Number(stat.size || 0),
        file: encoded,
      });
    } catch (err) {
      console.error('Failed to link object from store:', objectName, err);
    }
    
    processed++;
    if (onProgress) onProgress(processed, total);
  }

  return objects;
}


async function restoreMinioObjects(sourceDir, records = [], onProgress = null) {
  const minioDir = path.join(sourceDir, MINIO_DIR);
  if (!(await pathExists(minioDir))) return;

  const exists = await minioClient.bucketExists(env.MINIO.bucket).catch(() => false);
  if (!exists) await minioClient.makeBucket(env.MINIO.bucket);

  const objectsToRestore = new Set();
  if (!records || records.length === 0) {
    const entries = await fs.promises.readdir(minioDir);
    for (const file of entries) {
      objectsToRestore.add(file);
    }
    
    const existing = [];
    const listStream = minioClient.listObjectsV2(env.MINIO.bucket, '', true);
    for await (const obj of listStream) {
      if (obj?.name) existing.push(obj.name);
    }
    if (existing.length > 0) {
      for (const objectName of existing) {
        await minioClient.removeObject(env.MINIO.bucket, objectName).catch(() => {});
      }
    }
  } else {
    for (const r of records) {
      if (r.file && r.file.minio_filename && !r.file.minio_filename.startsWith('local:')) {
        objectsToRestore.add(encodeObjectName(r.file.minio_filename));
      }
    }
  }

  let processed = 0;
  const total = objectsToRestore.size;

  for (const file of objectsToRestore) {
    const objectName = decodeObjectName(file);
    if (!objectName) continue;
    const filePath = path.join(minioDir, file);
    if (!(await pathExists(filePath))) continue;
    
    try {
      const data = await fs.promises.readFile(filePath);
      await minioClient.putObject(env.MINIO.bucket, objectName, data);
    } catch (e) {
      console.error('Failed to restore object to MinIO:', objectName, e);
    }
    
    processed++;
    if (onProgress) onProgress(processed, total, 'minio');
  }
}

async function backupLocalMedia(targetDir) {
  const mediaTarget = path.join(targetDir, MEDIA_DIR);
  await fs.promises.mkdir(mediaTarget, { recursive: true });
  const source = env.EXTERNAL_DRIVE_PATH;
  if (!(await pathExists(source))) return { copied: false };
  await fs.promises.cp(source, mediaTarget, { recursive: true });
  return { copied: true };
}

function assertSafeDelete(targetPath) {
  const normalized = path.resolve(targetPath);
  if (normalized === '/' || normalized.length < 5) {
    throw new Error(`Refusing to delete unsafe path: ${normalized}`);
  }
}

async function restoreLocalMedia(sourceDir) {
  const mediaSource = path.join(sourceDir, MEDIA_DIR);
  const mediaTarget = env.EXTERNAL_DRIVE_PATH;
  if (!(await pathExists(mediaSource))) return;
  await fs.promises.mkdir(path.dirname(mediaTarget), { recursive: true });
  if (await pathExists(mediaTarget)) {
    assertSafeDelete(mediaTarget);
    await fs.promises.rm(mediaTarget, { recursive: true, force: true });
  }
  await fs.promises.mkdir(mediaTarget, { recursive: true });
  await fs.promises.cp(mediaSource, mediaTarget, { recursive: true });
}

async function createBackupSnapshot(pool, options = {}) {
  const backupDir = await ensureBackupDir();
  const backupId = new Date().toISOString().replace(/:/g, '-');
  const folderPath = path.join(backupDir, toBackupDirname(backupId));
  await fs.promises.mkdir(folderPath, { recursive: true });
  const client = await pool.connect();

  try {
    const records = await fetchVaultSnapshotFromDb(client, options.filters || {});
    const minioObjects = await backupMinioObjects(folderPath, records);
    
    // For granular backups, local media might not be explicitly filtered right now,
    // but we'll copy it unless filters were heavily restricted, or we can just backup
    // it always for safety. For simplicity, we copy it if it's a full backup.
    let mediaResult = { copied: false };
    if (!options.filters || Object.keys(options.filters).length === 0) {
      mediaResult = await backupLocalMedia(folderPath);
    }
    
    const payload = {
      backup_id: backupId,
      created_at: new Date().toISOString(),
      created_by_user_id: options.userId || null,
      reason: options.reason || 'scheduled',
      filters: options.filters || null,
      storage: {
        backup_path: folderPath,
        minio_bucket: env.MINIO.bucket,
        minio_objects: minioObjects,
        local_media_path: env.EXTERNAL_DRIVE_PATH,
        local_media_copied: mediaResult.copied,
      },
    };

    await writeJson(path.join(folderPath, MANIFEST_FILE), payload);
    await writeJson(path.join(folderPath, DB_SNAPSHOT_FILE), { vault_files: records });
    
    // Retention policy removed as per user request
    // await applyRetention();
    
    return { backup_id: backupId, path: folderPath, files_count: records.length };
  } finally {
    client.release();
  }
}


async function getBackupPreview(pool, backupId, options = {}) {
  const client = await pool.connect();
  try {
    const backupFolder = resolveBackupFolder(backupId);
    const payload = await readJson(path.join(backupFolder, MANIFEST_FILE));
    const dbSnapshot = await readJson(path.join(backupFolder, DB_SNAPSHOT_FILE));
    let snapshotRecords = dbSnapshot?.vault_files || [];
    
    if (options.filters && Object.keys(options.filters).length > 0) {
      const { masterfolder_id, category, folder } = options.filters;
      snapshotRecords = snapshotRecords.filter(r => {
        if (masterfolder_id && r.metadata?.masterfolder_id !== Number(masterfolder_id)) return false;
        if (category && r.file?.category !== category) return false;
        if (folder && r.file?.folder !== folder) return false;
        return true;
      });
    }

    const currentRecords = await fetchVaultSnapshotFromDb(client, options.filters || {});
    const changes = buildChangesSummary(snapshotRecords, currentRecords);

    return {
      backup_id: payload.backup_id || backupId,
      created_at: payload.created_at || null,
      reason: payload.reason || null,
      changes,
    };
  } finally {
    client.release();
  }
}


async function restoreBackup(pool, backupId, options = {}, onProgress = null) {
  const client = await pool.connect();
  try {
    const backupFolder = resolveBackupFolder(backupId);
    const dbSnapshot = await readJson(path.join(backupFolder, DB_SNAPSHOT_FILE));
    let snapshotRecords = dbSnapshot?.vault_files || [];

    if (options.filters && Object.keys(options.filters).length > 0) {
      const { masterfolder_id, category, folder } = options.filters;
      snapshotRecords = snapshotRecords.filter(r => {
        if (masterfolder_id && r.metadata?.masterfolder_id !== Number(masterfolder_id)) return false;
        if (category && r.file?.category !== category) return false;
        if (folder && r.file?.folder !== folder) return false;
        return true;
      });
    }

    const currentRecords = await fetchVaultSnapshotFromDb(client, options.filters || {});
    const preview = buildChangesSummary(snapshotRecords, currentRecords);

    const snapshotById = new Map(snapshotRecords.map((r) => [Number(r.file.id), r]));
    const currentById = new Map(currentRecords.map((r) => [Number(r.file.id), r]));
    
    const schemaColsResult = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vault_files'"
    );
    const vaultFileColumns = new Set(schemaColsResult.rows.map((r) => r.column_name));

    const fieldMap = [
      ['original_name', 'original_name'],
      ['minio_filename', 'minio_filename'],
      ['size_bytes', 'size_bytes'],
      ['mime_type', 'mime_type'],
      ['category', 'category'],
      ['folder', 'folder'],
      ['file_hash', 'file_hash'],
      ['uploaded_by', 'uploaded_by'],
      ['tags', 'tags'],
      ['auto_name', 'auto_name'],
      ['custom_name', 'custom_name'],
      ['is_starred', 'is_starred'],
      ['expiry_date', 'expiry_date'],
    ].filter(([col]) => vaultFileColumns.has(col));

    await client.query('BEGIN');

    for (const currentId of currentById.keys()) {
      if (snapshotById.has(currentId)) continue;
      await client.query('DELETE FROM vault_file_metadata WHERE file_id = $1', [currentId]);
      await client.query('DELETE FROM vault_files WHERE id = $1', [currentId]);
    }

    let processed = 0;
    const total = snapshotRecords.length;

    for (const record of snapshotRecords) {
      const file = record.file || {};
      const metadata = record.metadata || {};
      const fileId = Number(file.id);
      if (!Number.isFinite(fileId)) continue;

      const {
        original_name = null, minio_filename = null, size_bytes = null, mime_type = null,
        category = null, folder = null, file_hash = null, uploaded_by = null,
        tags = null, auto_name = null, custom_name = null, is_starred = false, expiry_date = null,
      } = file;

      const exists = await client.query('SELECT id FROM vault_files WHERE id = $1 LIMIT 1', [fileId]);
      const normalizedTags = tags == null ? null : (typeof tags === 'string' ? tags : JSON.stringify(tags));
      const fileValueByCol = {
        original_name, minio_filename, size_bytes, mime_type, category, folder, file_hash,
        uploaded_by, tags: normalizedTags, auto_name, custom_name, is_starred, expiry_date,
      };

      if (exists.rows.length > 0) {
        const setParts = [];
        const values = [];
        let p = 1;
        for (const [col] of fieldMap) {
          setParts.push(`${col} = $${p}`);
          values.push(fileValueByCol[col]);
          p++;
        }
        values.push(fileId);
        await client.query(`UPDATE vault_files SET ${setParts.join(', ')} WHERE id = $${p}`, values);
      } else {
        const insertCols = ['id', ...fieldMap.map(([col]) => col)];
        const insertValues = [fileId, ...fieldMap.map(([col]) => fileValueByCol[col])];
        const placeholders = insertValues.map((_, idx) => `$${idx + 1}`);
        await client.query(`INSERT INTO vault_files (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`, insertValues);
      }

      if (metadata.masterfolder_id == null && metadata.fy_id == null) {
        await client.query('DELETE FROM vault_file_metadata WHERE file_id = $1', [fileId]);
      } else {
        const metadataUpdate = await client.query(
          `UPDATE vault_file_metadata SET masterfolder_id = $2, fy_id = $3 WHERE file_id = $1`,
          [fileId, metadata.masterfolder_id, metadata.fy_id]
        );
        if (metadataUpdate.rowCount === 0) {
          await client.query(
            `INSERT INTO vault_file_metadata (file_id, masterfolder_id, fy_id) VALUES ($1, $2, $3)`,
            [fileId, metadata.masterfolder_id, metadata.fy_id]
          );
        }
      }
      processed++;
      if (onProgress) onProgress(processed, total, 'db');
    }

    await client.query('COMMIT');
    await restoreMinioObjects(backupFolder, snapshotRecords, onProgress);
    
    if (!options.filters || Object.keys(options.filters).length === 0) {
      await restoreLocalMedia(backupFolder);
    }
    return { backup_id: backupId, changes: preview };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function applyRetention() {
  const retentionDays = Number(env.BACKUP.retentionDays || 30);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const backups = await listBackups();
  for (const backup of backups) {
    const createdAt = new Date(backup.created_at).getTime();
    if (!Number.isFinite(createdAt) || createdAt >= cutoff) continue;
    await fs.promises.rm(backup.path, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  ensureBackupDir,
  listBackups,
  getLatestBackup,
  createBackupSnapshot,
  getBackupPreview,
  restoreBackup,
};
