const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

async function runSQL(sql) {
  await pool.query(sql);
}

async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  await runSQL(sql);
  console.log('Database schema ensured.');
}

if (require.main === module) {
  initDb().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { initDb };
