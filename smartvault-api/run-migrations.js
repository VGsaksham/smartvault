const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env.local') });

const connectionString = process.env.DATABASE_URL || 'postgres://vaultadmin:sanyasi@1981@127.0.0.1:5432/smartvault_db';
const client = new Client({ connectionString });

async function runMigrations() {
  try {
    await client.connect();
    console.log('Connected to database to run migrations.');

    const files = fs.readdirSync(__dirname)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`Running migration: ${file}...`);
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
      await client.query(sql);
      console.log(`Successfully executed ${file}`);
    }

    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
