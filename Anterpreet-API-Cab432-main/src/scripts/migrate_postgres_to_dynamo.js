const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const { putImage, putJob } = require('../db/dynamo');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pixelsmith';
const pool = new Pool({ connectionString });

async function migrateImages() {
  console.log('Reading images from Postgres...');
  const { rows } = await pool.query('SELECT * FROM images');
  console.log(`Found ${rows.length} images`);
  let ok = 0, fail = 0;
  for (const r of rows) {
    try {
      const item = {
        id: r.id,
        owner_username: r.owner_username,
        original_path: r.original_path,
        width: r.width === null ? null : Number(r.width),
        height: r.height === null ? null : Number(r.height),
        format: r.format || 'jpg',
        size_bytes: r.size_bytes === null ? null : Number(r.size_bytes),
        created_at: (r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString())
      };
      await putImage(item);
      ok++;
    } catch (e) { console.error('image migrate error', r.id, e && e.message || e); fail++; }
  }
  console.log(`Images migrated: ok=${ok} fail=${fail}`);
}

async function migrateJobs() {
  console.log('Reading jobs from Postgres...');
  const { rows } = await pool.query('SELECT * FROM jobs');
  console.log(`Found ${rows.length} jobs`);

  // Build image->owner map to set owner_username on jobs
  const { rows: imgs } = await pool.query('SELECT id, owner_username FROM images');
  const ownerMap = Object.fromEntries(imgs.map(x => [x.id, x.owner_username]));

  let ok = 0, fail = 0;
  for (const r of rows) {
    try {
      const item = {
        id: r.id,
        image_id: r.image_id,
        status: r.status,
        params: r.params || {},
        cpu_ms: r.cpu_ms === null ? undefined : Number(r.cpu_ms),
        result_path: r.result_path || null,
        created_at: (r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()),
        updated_at: (r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()),
        owner_username: ownerMap[r.image_id] || null
      };
      await putJob(item);
      ok++;
    } catch (e) { console.error('job migrate error', r.id, e && e.message || e); fail++; }
  }
  console.log(`Jobs migrated: ok=${ok} fail=${fail}`);
}

async function main() {
  try {
    if (!process.env.DYNAMODB_TABLE_IMAGES || !process.env.DYNAMODB_TABLE_JOBS) {
      console.error('Please set DYNAMODB_TABLE_IMAGES and DYNAMODB_TABLE_JOBS environment variables');
      process.exit(2);
    }
    await migrateImages();
    await migrateJobs();
    console.log('Migration complete');
    process.exit(0);
  } catch (e) { console.error(e); process.exit(1); }
}

if (require.main === module) main();
