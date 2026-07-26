const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://vaultadmin:sanyasi@1981@127.0.0.1:5432/smartvault_db' });
client.connect().then(() => {
  client.query("SELECT company_id, name, fy_id FROM company_categories;")
    .then(res => { console.log(res.rows); client.end(); })
    .catch(console.error);
});
