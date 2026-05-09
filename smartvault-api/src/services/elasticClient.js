const { Client } = require('@elastic/elasticsearch');

const enabled = process.env.USE_ELASTICSEARCH === 'true';
const node = process.env.ELASTICSEARCH_URL || 'http://127.0.0.1:9200';
const index = process.env.ELASTICSEARCH_INDEX || 'smartvault_files';

let client = null;
if (enabled) {
  client = new Client({ node });
}

async function pingElastic() {
  if (!client) return false;
  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  enabled,
  client,
  index,
  pingElastic,
};
