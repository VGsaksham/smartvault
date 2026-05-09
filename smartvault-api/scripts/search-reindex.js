const pool = require('../src/db/pool');
const { enabled, client, index, pingElastic } = require('../src/services/elasticClient');

async function run() {
  if (!enabled || !client) {
    console.log('Elasticsearch is disabled (USE_ELASTICSEARCH=false).');
    process.exit(0);
  }

  const ok = await pingElastic();
  if (!ok) {
    console.error('Elasticsearch is not reachable.');
    process.exit(1);
  }

  const createResult = await client.indices.exists({ index });
  if (!createResult) {
    await client.indices.create({
      index,
      mappings: {
        properties: {
          file_id: { type: 'integer' },
          original_name: { type: 'text' },
          custom_name: { type: 'text' },
          auto_name: { type: 'text' },
          mime_type: { type: 'keyword' },
          department: { type: 'keyword' },
          folder: { type: 'keyword' },
          company_id: { type: 'integer' },
          fy_id: { type: 'integer' },
          fy_status: { type: 'keyword' },
          company_name: { type: 'text' },
          upload_date: { type: 'date' },
          uploaded_by: { type: 'integer' },
          tags: { type: 'keyword' },
        },
      },
    });
  }

  const rows = await pool.query(`
    SELECT
      f.id as file_id,
      f.original_name,
      f.custom_name,
      f.auto_name,
      f.mime_type,
      f.department,
      f.folder,
      f.upload_date,
      f.uploaded_by,
      f.tags,
      m.company_id,
      m.fy_id,
      c.name as company_name,
      fy.status as fy_status
    FROM vault_files f
    LEFT JOIN vault_file_metadata m ON m.file_id = f.id
    LEFT JOIN companies c ON c.id = m.company_id
    LEFT JOIN financial_years fy ON fy.id = m.fy_id
  `);

  const ops = [];
  for (const row of rows.rows) {
    ops.push({ index: { _index: index, _id: String(row.file_id) } });
    ops.push(row);
  }

  if (ops.length > 0) {
    await client.bulk({ refresh: true, operations: ops });
  }

  console.log(`Indexed ${rows.rows.length} files into ${index}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
