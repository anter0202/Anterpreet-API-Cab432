const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pixelsmith';
const pool = new Pool({
  connectionString,
  max: 10
});

module.exports = { pool };
