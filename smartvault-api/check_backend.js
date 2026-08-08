const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function check() {
  try {
    console.log("=== CHECKING BACKUP CONFIG ===");
    const configPath = path.join(__dirname, 'backup_config.json');
    console.log("Looking for config at:", configPath);
    if (fs.existsSync(configPath)) {
      console.log("Config exists! Contents:");
      console.log(fs.readFileSync(configPath, 'utf8'));
    } else {
      console.log("Config DOES NOT exist at", configPath);
    }
    
    console.log("\n=== CHECKING DB FOLDERS ===");
    try {
      const dbOut = execSync('sudo -u postgres psql -d smartvault_db -c "SELECT id, category, folder, original_name FROM vault_files WHERE folder IS NOT NULL LIMIT 20;"').toString();
      console.log(dbOut);
    } catch(e) {
      console.log("DB query failed", e.message);
    }

  } catch (err) {
    console.error("Error:", err);
  }
}

check();
