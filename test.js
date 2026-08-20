const pool = require('./smartvault-api/src/db/pool');
const { getUsermasterfolderAccess } = require('./smartvault-api/src/services/usermasterfolderAccessService');
getUsermasterfolderAccess(pool, 3).then(console.log).finally(() => process.exit());
