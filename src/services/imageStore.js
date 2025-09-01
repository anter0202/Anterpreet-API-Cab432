const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { pool } = require('../db/pool');

const ROOT = '/data/images';
const ORIGINALS = path.join(ROOT, 'originals');
const PROCESSED = path.join(ROOT, 'processed');

async function ensureDataDirs() {
  for (const p of [ROOT, ORIGINALS, PROCESSED]) {
    await fs.promises.mkdir(p, { recursive: true });
  }
}

function originalPathFor(id, ext='jpg') {
  return path.join(ORIGINALS, `${id}.${ext}`);
}
function processedPathFor(id, ext='jpg') {
  return path.join(PROCESSED, `${id}.${ext}`);
}

async function saveUpload(ownerUsername, fileBuffer) {
  const id = uuidv4();
  // Probe metadata to determine format
  const meta = await sharp(fileBuffer).metadata();
  const ext = (meta.format || 'jpg').toLowerCase();
  const outPath = originalPathFor(id, ext);
  await fs.promises.writeFile(outPath, fileBuffer);
  const stat = await fs.promises.stat(outPath);
  await pool.query(
    `INSERT INTO images(id, owner_username, original_path, width, height, format, size_bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, ownerUsername, outPath, meta.width || null, meta.height || null, ext, stat.size]
  );
  return { id, path: outPath, meta, size: stat.size, format: ext };
}

async function recordImported(ownerUsername, filePath) {
  const id = uuidv4();
  const meta = await sharp(filePath).metadata();
  const stat = await fs.promises.stat(filePath);
  await pool.query(
    `INSERT INTO images(id, owner_username, original_path, width, height, format, size_bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, ownerUsername, filePath, meta.width || null, meta.height || null, (meta.format||'jpg'), stat.size]
  );
  return { id, path: filePath, meta, size: stat.size, format: (meta.format||'jpg') };
}

module.exports = {
  ensureDataDirs,
  originalPathFor,
  processedPathFor,
  saveUpload,
  recordImported,
  ROOT, ORIGINALS, PROCESSED
};
