const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://vaultadmin:sanyasi@1981@127.0.0.1:5432/smartvault_db' });
client.connect().then(() => {
  client.query("SELECT id, username, allowed_categories FROM users;")
    .then(res => { console.log(res.rows); client.end(); })
    .catch(console.error);
});
