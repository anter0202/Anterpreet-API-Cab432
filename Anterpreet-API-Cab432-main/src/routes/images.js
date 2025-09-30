const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { verify } = require('../middleware/auth');
const { pool } = require('../db/pool');
const { saveUpload, recordImported } = require('../services/imageStore');
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
    const saved = await saveUpload(req.user.username, req.file.buffer);
    res.status(201).json({ id: saved.id, meta: saved.meta, size: saved.size, format: saved.format });
  } catch (e) { next(e); }
});

// Import 
router.post('/import', verify, async (req, res, next) => {
  try {
    const buf = await importRandomImage();
    const saved = await saveUpload(req.user.username, buf);
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
    const lim = Math.min(100, Math.max(1, parseInt(limit)));
    const pg = Math.max(1, parseInt(page));
    const off = (pg-1)*lim;

    let where = [];
    let params = [];
    if (owner === 'me') {
      params.push(req.user.username);
      where.push(`owner_username = $${params.length}`);
    }
    if (format) {
      params.push(String(format).toLowerCase());
      where.push(`format = $${params.length}`);
    }
    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const sortCol = ['created_at','format','size_bytes','width','height'].includes(sort) ? sort : 'created_at';
    const sortOrd = (String(order).toLowerCase() === 'asc' ? 'asc' : 'desc');

    const countSql = `SELECT COUNT(*) AS c FROM images ${whereSql}`;
    const { rows: cr } = await pool.query(countSql, params);
    const total = parseInt(cr[0].c, 10);

    const dataSql = `SELECT id, owner_username, width, height, format, size_bytes, created_at
                     FROM images ${whereSql}
                     ORDER BY ${sortCol} ${sortOrd}
                     LIMIT ${lim} OFFSET ${off}`;
    const { rows } = await pool.query(dataSql, params);

    // Pagination headers
    res.set('X-Total-Count', String(total));
    const baseUrl = req.protocol + '://' + req.get('host') + req.baseUrl;
    const links = [];
    const q = new URLSearchParams(req.query);
    if (off + lim < total) { q.set('page', String(pg+1)); links.push(`<${baseUrl}?${q.toString()}>; rel="next"`); }
    if (pg > 1) { q.set('page', String(pg-1)); links.push(`<${baseUrl}?${q.toString()}>; rel="prev"`); }
    if (links.length) res.set('Link', links.join(', '));

    res.json(rows);
  } catch (e) { next(e); }
});

// Get metadata
router.get('/:id', verify, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM images WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const row = rows[0];
    if (req.user.role !== 'admin' && row.owner_username !== req.user.username) {
      return res.status(403).json({ error: 'forbidden' });
    }
    res.json(row);
  } catch (e) { next(e); }
});

// Download
router.get('/:id/download', verify, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT original_path, format, owner_username FROM images WHERE id=$1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const rec = rows[0];
    if (req.user.role !== 'admin' && rec.owner_username !== req.user.username)
      return res.status(403).json({ error: 'forbidden' });

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
