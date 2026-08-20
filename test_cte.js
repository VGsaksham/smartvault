const { Pool } = require('pg');
const env = require('./smartvault-api/src/config/env');
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const query = `
    WITH all_folders AS (
      SELECT f.id, f.name as original_name, 'folder' as type,
             c.name as masterfolder_name, dept.name as category,
             parent.name as folder,
             ufa.alias_name as user_alias, f.created_at as upload_date,
             dept.masterfolder_id, c.fy_id
      FROM masterfolder_category_folders f
      JOIN masterfolder_categories dept ON f.category_id = dept.id
      JOIN masterfolders c ON dept.masterfolder_id = c.id
      LEFT JOIN masterfolder_category_folders parent ON f.parent_folder_id = parent.id
      LEFT JOIN user_folder_aliases ufa ON ufa.folder_id = f.id AND ufa.user_id = $1
      
      UNION ALL
      
      SELECT dept.id, dept.name as original_name, 'category' as type,
             c.name as masterfolder_name, dept.name as category,
             NULL as folder,
             NULL as user_alias, dept.created_at as upload_date,
             dept.masterfolder_id, c.fy_id
      FROM masterfolder_categories dept
      JOIN masterfolders c ON dept.masterfolder_id = c.id
    )
    SELECT * FROM all_folders f
    WHERE 1=1
    AND (f.original_name ILIKE $2 OR COALESCE(f.user_alias, '') ILIKE $2)
    AND f.category = $3
    ORDER BY CASE WHEN f.original_name ILIKE $4 THEN 0 ELSE 1 END ASC, f.upload_date DESC LIMIT 50
  `;
  try {
    const res = await pool.query(query, [1, '%mng%', 'Management', 'mng']);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
