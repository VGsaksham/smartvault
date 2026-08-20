const pool = require('./smartvault-api/src/db/pool');
const { getUsermasterfolderAccess } = require('./smartvault-api/src/services/usermasterfolderAccessService');
async function test() {
  const access = await getUsermasterfolderAccess(pool, 3);
  console.log(access);
  const folderAccessRes = await pool.query(
    \SELECT masterfolder_id, category, folder_path, is_exclusion FROM user_folder_access WHERE user_id = \,
    [3]
  );
  console.log(folderAccessRes.rows);
  process.exit();
}
test();
