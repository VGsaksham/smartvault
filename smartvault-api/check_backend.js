const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/smartvault_db' });

async function check() {
  try {
    console.log("=== CHECKING FILES IN DB ===");
    const res = await pool.query("SELECT id, original_name, category, folder FROM vault_files LIMIT 10");
    console.log(res.rows);
    
    console.log("\n=== CHECKING BACKUP CONFIG ===");
    const configPath = path.join(__dirname, 'backup_config.json');
    console.log("Looking for config at:", configPath);
    if (fs.existsSync(configPath)) {
      console.log("Config exists! Contents:");
      console.log(fs.readFileSync(configPath, 'utf8'));
    } else {
      console.log("Config DOES NOT exist at", configPath);
    }

    const configPath2 = path.join(__dirname, '../backup_config.json');
    if (fs.existsSync(configPath2)) {
      console.log("Wait, found config at:", configPath2);
    }
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    pool.end();
  }
}

check();
