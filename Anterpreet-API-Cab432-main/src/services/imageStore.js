const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');


const ROOT = process.env.DATA_DIR || path.join(process.cwd(), 'data', 'images');
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
  const meta = await sharp(fileBuffer).metadata();
  const ext = (meta.format || 'jpg').toLowerCase();
  const id = uuidv4();
  const key = `originals/${id}.${ext}`;

  // If S3 bucket is configured, upload to S3. Otherwise write to local disk.
  if (BUCKET) {
    await s3.putObject({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: `image/${ext}`,
    }).promise();

    try {
      await pool.query(
        `INSERT INTO images(id, owner_username, original_path, width, height, format, size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, ownerUsername, key, meta.width || 0, meta.height || 0, ext, fileBuffer.length]
      );
    } catch (e) {
      console.error('Warning: failed to write image record to DB:', e && e.message ? e.message : e);
    }

    return { id, meta: { width: meta.width, height: meta.height }, format: ext, size: fileBuffer.length };
  }

  // Local disk fallback
  const localPath = originalPathFor(id, ext);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, fileBuffer);

  try {
    await pool.query(
      `INSERT INTO images(id, owner_username, original_path, width, height, format, size_bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, ownerUsername, localPath, meta.width || 0, meta.height || 0, ext, fileBuffer.length]
    );
  } catch (e) {
    console.error('Warning: failed to write local image record to DB:', e && e.message ? e.message : e);
  }

  return { id, meta: { width: meta.width, height: meta.height }, format: ext, size: fileBuffer.length };
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
