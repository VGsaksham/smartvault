const pool = require('./src/db/pool');

async function run() {
  try {
    await pool.query('DROP INDEX IF EXISTS idx_company_category_folders_unique_name;');
    // We cannot use COALESCE(parent_folder_id, 0) directly in standard Postgres UNIQUE without making it an expression index.
    // Actually, NULL values in Postgres are considered distinct. So if parent_folder_id is NULL, multiple NULLs are allowed for the same name, which is NOT what we want.
    // Wait, the index was probably created with (category_id, name).
    // Let's create an index with COALESCE if needed, or two indexes:
    // One for parent_folder_id IS NOT NULL, one for parent_folder_id IS NULL.
    await pool.query('CREATE UNIQUE INDEX idx_cdf_unique_name_parent ON company_category_folders(category_id, parent_folder_id, LOWER(name)) WHERE parent_folder_id IS NOT NULL;');
    await pool.query('CREATE UNIQUE INDEX idx_cdf_unique_name_root ON company_category_folders(category_id, LOWER(name)) WHERE parent_folder_id IS NULL;');
    console.log('Indexes updated!');
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
