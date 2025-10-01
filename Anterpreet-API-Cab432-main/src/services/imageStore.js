const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
let dynamo;
try { dynamo = require('../db/dynamo'); } catch (e) { dynamo = null; }
// If DynamoDB not configured, we'll fall back to an in-memory map (for local dev)
let localImageStore = null;
if (!dynamo || !process.env.DYNAMODB_TABLE_IMAGES) {
  console.warn('Warning: DynamoDB images table not configured. Using in-memory fallback (dev only).');
  localImageStore = new Map();
}


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

    // Write metadata to DynamoDB
    if (dynamo && process.env.DYNAMODB_TABLE_IMAGES) {
      try {
        await dynamo.putImage({
          id, owner_username: ownerUsername, original_path: key,
          width: meta.width || null, height: meta.height || null, format: ext, size_bytes: fileBuffer.length,
          created_at: new Date().toISOString()
        });
      } catch (e) { console.error('Failed to write image record to DynamoDB:', e && e.message ? e.message : e); throw e; }
    } else if (localImageStore) {
      localImageStore.set(id, { id, owner_username: ownerUsername, original_path: key, width: meta.width || null, height: meta.height || null, format: ext, size_bytes: fileBuffer.length, created_at: new Date().toISOString() });
    }

    return { id, meta: { width: meta.width, height: meta.height }, format: ext, size: fileBuffer.length };
  }

  // Local disk fallback
  const localPath = originalPathFor(id, ext);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, fileBuffer);

  if (dynamo && process.env.DYNAMODB_TABLE_IMAGES) {
    try {
      await dynamo.putImage({
        id, owner_username: ownerUsername, original_path: localPath,
        width: meta.width || null, height: meta.height || null, format: ext, size_bytes: fileBuffer.length,
        created_at: new Date().toISOString()
      });
    } catch (e) { console.error('Failed to write image record to DynamoDB:', e && e.message ? e.message : e); throw e; }
  } else if (localImageStore) {
    localImageStore.set(id, { id, owner_username: ownerUsername, original_path: localPath, width: meta.width || null, height: meta.height || null, format: ext, size_bytes: fileBuffer.length, created_at: new Date().toISOString() });
  }

  return { id, meta: { width: meta.width, height: meta.height }, format: ext, size: fileBuffer.length };
}

async function recordImported(ownerUsername, filePath) {
  const id = uuidv4();
  const meta = await sharp(filePath).metadata();
  const stat = await fs.promises.stat(filePath);
  if (dynamo && process.env.DYNAMODB_TABLE_IMAGES) {
    await dynamo.putImage({ id, owner_username: ownerUsername, original_path: filePath, width: meta.width || null, height: meta.height || null, format: (meta.format||'jpg'), size_bytes: stat.size, created_at: new Date().toISOString() });
  } else if (localImageStore) {
    localImageStore.set(id, { id, owner_username: ownerUsername, original_path: filePath, width: meta.width || null, height: meta.height || null, format: (meta.format||'jpg'), size_bytes: stat.size, created_at: new Date().toISOString() });
  }
  return { id, path: filePath, meta, size: stat.size, format: (meta.format||'jpg') };
}

module.exports = {
  ensureDataDirs,
  originalPathFor,
  processedPathFor,
  saveUpload,
  recordImported,
  ROOT, ORIGINALS, PROCESSED,
  // helper: get image by id (reads from DynamoDB when configured, otherwise from local in-memory store)
  getImage: async function(id) {
    if (dynamo && process.env.DYNAMODB_TABLE_IMAGES) {
      return await dynamo.getImage(id);
    }
    if (localImageStore) return localImageStore.get(id) || null;
    return null;
  },
  // helper: query images (DynamoDB when configured, otherwise simple in-memory pagination/filter)
  queryImages: async function({ owner=null, format=null, limit=20, nextToken=null } = {}) {
    if (dynamo && process.env.DYNAMODB_TABLE_IMAGES) {
      return await dynamo.queryImages({ owner, format, limit, nextToken });
    }
    const all = Array.from(localImageStore ? localImageStore.values() : []);
    let filtered = all.filter(it => !format || it.format === String(format).toLowerCase());
    if (owner) filtered = filtered.filter(it => it.owner_username === owner);
    // sort by created_at desc if present
    filtered.sort((a,b) => (b.created_at||'') .localeCompare(a.created_at||''));
    const items = filtered.slice(0, limit);
    return { items, nextToken: null };
  }
};

