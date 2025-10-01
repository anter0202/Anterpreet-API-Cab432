const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { verify } = require('../middleware/auth');
let dynamo;
try { dynamo = require('../db/dynamo'); } catch (e) { dynamo = null; }
// Use the shared imageStore service which has its own in-memory fallback when DynamoDB is not configured.
const imageStore = require('../services/imageStore');
const { saveUpload, recordImported, queryImages, getImage } = imageStore;
const { importRandomImage } = require('../services/external');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Upload
router.post('/', verify, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const saved = await imageStore.saveUpload(req.user.username, req.file.buffer);
    res.status(201).json({ id: saved.id, meta: saved.meta, size: saved.size, format: saved.format });
  } catch (e) { next(e); }
});

// Import 
router.post('/import', verify, async (req, res, next) => {
  try {
    const buf = await importRandomImage();
    const saved = await imageStore.saveUpload(req.user.username, buf);
    res.status(201).json({
      id: saved.id, width: saved.meta.width, height: saved.meta.height,
      format: saved.format, size_bytes: saved.size
    });
  } catch (e) { next(e); }
});

// List with pagination/filter/sort
router.get('/', verify, async (req, res, next) => {
  try {
    const { owner, format, sort='created_at', order='desc', limit='20', page='1' } = req.query;
    // Debug: log inbound list requests (helpful for client refresh troubleshooting)
    try { console.debug('[images] list request owner=%s from=%s auth=%s', owner, req.ip || req.connection.remoteAddress, (req.headers.authorization || '').slice(0,40)); } catch(e){}
    const lim = Math.min(100, Math.max(1, parseInt(limit)));
    const pg = Math.max(1, parseInt(page));
    const off = (pg-1)*lim;
    // owner param 'me' maps to username
    const ownerFilter = owner === 'me' ? req.user.username : owner;
    if (dynamo && process.env.DYNAMODB_TABLE_IMAGES) {
      const { items, nextToken } = await dynamo.queryImages({ owner: ownerFilter, format, limit: lim, nextToken: req.query.nextToken });
      if (nextToken) res.set('X-Next-Token', nextToken);
      return res.json(items);
    }
    // Fallback: use imageStore.queryImages which will consult the in-memory store when DynamoDB not configured
    const { items } = await imageStore.queryImages({ owner: ownerFilter, format, limit: lim, nextToken: req.query.nextToken });
    return res.json(items);
  } catch (e) { next(e); }
});

// Get metadata
router.get('/:id', verify, async (req, res, next) => {
  try {
    if (dynamo && process.env.DYNAMODB_TABLE_IMAGES) {
      const item = await dynamo.getImage(req.params.id);
      if (!item) return res.status(404).json({ error: 'not_found' });
      if (req.user.role !== 'admin' && item.owner_username !== req.user.username) return res.status(403).json({ error: 'forbidden' });
      return res.json(item);
    }
    // in-memory fallback (use imageStore.getImage)
    const it = await imageStore.getImage(req.params.id);
    if (!it) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin' && it.owner_username !== req.user.username) return res.status(403).json({ error: 'forbidden' });
    res.json(it);
  } catch (e) { next(e); }
});

// Download
router.get('/:id/download', verify, async (req, res, next) => {
  try {
    if (dynamo && process.env.DYNAMODB_TABLE_IMAGES) {
      const item = await dynamo.getImage(req.params.id);
      if (!item) return res.status(404).json({ error: 'not_found' });
      if (req.user.role !== 'admin' && item.owner_username !== req.user.username) return res.status(403).json({ error: 'forbidden' });
      const key = item.original_path;
      if (BUCKET) {
        const head = await s3.headObject({ Bucket: BUCKET, Key: key }).promise();
        if (req.headers['if-none-match'] === head.ETag) return res.status(304).end();
        res.set('ETag', head.ETag);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        if (head.ContentType) res.type(head.ContentType);

        s3.getObject({ Bucket: BUCKET, Key: key }).createReadStream()
          .on('error', next)
          .pipe(res);
      } else {
        // Local file path stored in DB
        const localPath = key;
        if (!localPath) return res.status(404).json({ error: 'not_found' });
        res.set('Cache-Control', 'no-cache');
        res.type(path.extname(localPath).slice(1) || 'octet-stream');
        fs.createReadStream(localPath).on('error', next).pipe(res);
      }
      return;
    }

  // in-memory fallback (use imageStore.getImage)
  const rec = await imageStore.getImage(req.params.id);
  if (!rec) return res.status(404).json({ error: 'not_found' });
  if (req.user.role !== 'admin' && rec.owner_username !== req.user.username) return res.status(403).json({ error: 'forbidden' });
  const key = rec.original_path;

    if (BUCKET) {
      const head = await s3.headObject({ Bucket: BUCKET, Key: key }).promise();
      if (req.headers['if-none-match'] === head.ETag) return res.status(304).end();
      res.set('ETag', head.ETag);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (head.ContentType) res.type(head.ContentType);

      s3.getObject({ Bucket: BUCKET, Key: key }).createReadStream()
        .on('error', next)
        .pipe(res);
    } else {
      // Local file path stored in DB
      const localPath = key;
      if (!localPath) return res.status(404).json({ error: 'not_found' });
      res.set('Cache-Control', 'no-cache');
      res.type(path.extname(localPath).slice(1) || 'octet-stream');
      fs.createReadStream(localPath).on('error', next).pipe(res);
    }
  } catch (e) { next(e); }
});


module.exports = { router };
