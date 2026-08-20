const fs = require('fs');

const NEW_FETCH_SNAPSHOT = async function fetchVaultSnapshotFromDb(client, filters = {}) {
  let query = \\\    SELECT
      vf.*,
      vfm.masterfolder_id,
      vfm.fy_id
    FROM vault_files vf
    LEFT JOIN vault_file_metadata vfm ON vfm.file_id = vf.id
    WHERE 1=1
  \\\\;
  const values = [];
  
  if (filters.masterfolder_id) {
    values.push(filters.masterfolder_id);
    query += \\\\ AND vfm.masterfolder_id = \\$\\\\\\\;
  }
  if (filters.category) {
    values.push(filters.category);
    query += \\\\ AND vf.category = \\$\\\\\\\;
  }
  if (filters.folder) {
    if (filters.folder === 'null') {
      query += \\\\ AND (vf.folder IS NULL OR vf.folder = 'null')\\\\;
    } else {
      values.push(filters.folder);
      query += \\\\ AND vf.folder = \\$\\\\\\\;
    }
  }
  
  query += \\\\ ORDER BY vf.id ASC\\\\;
  
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
\;

const NEW_BACKUP_MINIO = async function backupMinioObjects(targetDir, records = []) {
  const minioDir = path.join(targetDir, MINIO_DIR);
  const objectStoreDir = path.join(getBackupDir(), 'object_store');
  await fs.promises.mkdir(minioDir, { recursive: true });
  await fs.promises.mkdir(objectStoreDir, { recursive: true });
  const objects = [];

  const objectsToBackup = new Set();
  if (records.length === 0) {
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
  }

  return objects;
}
\;

const NEW_CREATE_BACKUP = async function createBackupSnapshot(pool, options = {}) {
  const backupDir = await ensureBackupDir();
  const backupId = new Date().toISOString().replace(/:/g, '-');
  const folderPath = path.join(backupDir, toBackupDirname(backupId));
  await fs.promises.mkdir(folderPath, { recursive: true });
  const client = await pool.connect();

  try {
    const records = await fetchVaultSnapshotFromDb(client, options.filters || {});
    const minioObjects = await backupMinioObjects(folderPath, records);
    
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
    
    return { backup_id: backupId, path: folderPath, files_count: records.length };
  } finally {
    client.release();
  }
}
\;

let content = fs.readFileSync('smartvault-api/src/services/backupService.js', 'utf8');

// Replace fetchVaultSnapshotFromDb
content = content.replace(/async function fetchVaultSnapshotFromDb[\s\S]*?function buildChangesSummary/m, NEW_FETCH_SNAPSHOT + '\nfunction buildChangesSummary');

// Replace backupMinioObjects
content = content.replace(/async function backupMinioObjects[\s\S]*?async function restoreMinioObjects/m, NEW_BACKUP_MINIO + '\nasync function restoreMinioObjects');

// Replace createBackupSnapshot
content = content.replace(/async function createBackupSnapshot[\s\S]*?async function getBackupPreview/m, NEW_CREATE_BACKUP + '\nasync function getBackupPreview');

// Remove applyRetention call (wait, it's already removed in NEW_CREATE_BACKUP)

fs.writeFileSync('smartvault-api/src/services/backupService.js', content);
console.log('Replaced successfully!');
