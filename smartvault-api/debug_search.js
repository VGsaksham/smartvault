const pool = require('./src/db/pool');

async function run() {
  const q = process.argv[2] || 'mng';
  const query = `
    WITH all_folders AS (
      SELECT f.id, f.name as original_name, 'folder' as type,
             c.name as masterfolder_name, dept.name as category,
             parent.name as folder,
             NULL as user_alias, f.created_at as upload_date,
             dept.masterfolder_id
      FROM masterfolder_category_folders f
      JOIN masterfolder_categories dept ON f.category_id = dept.id
      JOIN masterfolders c ON dept.masterfolder_id = c.id
      LEFT JOIN masterfolder_category_folders parent ON f.parent_folder_id = parent.id
      
      UNION ALL
      
      SELECT dept.id, dept.name as original_name, 'category' as type,
             c.name as masterfolder_name, dept.name as category,
             NULL as folder,
             NULL as user_alias, dept.created_at as upload_date,
             dept.masterfolder_id
      FROM masterfolder_categories dept
      JOIN masterfolders c ON dept.masterfolder_id = c.id
    )
    SELECT * FROM all_folders f
    WHERE 1=1
    AND (f.original_name ILIKE $2 OR COALESCE(f.user_alias, '') ILIKE $2)
    AND f.category = $3
  `;
  try {
    const res = await pool.query(query, [1, `%${q}%`, 'Management']);
    console.table(res.rows);
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    pool.end();
  }
}
run();
