require('dotenv').config();
const fs = require('fs');
const pool = require('./src/db/pool');

async function deploy() {
    try {
        const sql = fs.readFileSync('../scripts/deploy-base-schema.sql', 'utf8');
        await pool.query(sql);
        console.log('Schema deployed successfully.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
deploy();
