const express = require('express');
const { verify } = require('../middleware/auth');
const { pool } = require('../db/pool');
const { createJob, runJob } = require('../services/jobs');

const router = express.Router();

// Create a job (synchronous processing to keep A1 simple)
router.post('/', verify, async (req, res, next) => {
  try {
    const { imageId, params } = req.body || {};
    if (!imageId) return res.status(400).json({ error: 'missing_imageId' });

    // Authorisation: only owner or admin
    const { rows: imgs } = await pool.query(`SELECT id, owner_username, original_path FROM images WHERE id=$1`, [imageId]);
    if (!imgs.length) return res.status(404).json({ error: 'image_not_found' });
    const img = imgs[0];
    if (req.user.role !== 'admin' && img.owner_username !== req.user.username) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const jobId = await createJob(imageId, params || {});
    // Run synchronously in this request (for A1). For later, you would queue this.
    const result = await runJob(jobId, img.original_path);
    const { rows: jobRows } = await pool.query(`SELECT * FROM jobs WHERE id=$1`, [jobId]);
    res.status(201).json(jobRows[0]);
  } catch (e) { next(e); }
});

// List jobs
router.get('/', verify, async (req, res, next) => {
  try {
    const { status, limit='20', page='1' } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit)));
    const pg = Math.max(1, parseInt(page));
    const off = (pg-1)*lim;
    const where = [];
    const params = [];

    if (status) { params.push(status); where.push(`status=$${params.length}`); }

    // Only jobs for images owned by the user (unless admin)
    if (req.user.role !== 'admin') {
      params.push(req.user.username);
      where.push(`image_id IN (SELECT id FROM images WHERE owner_username=$${params.length})`);
    }

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const countSql = `SELECT COUNT(*) AS c FROM jobs ${whereSql}`;
    const { rows: cr } = await pool.query(countSql, params);
    const total = parseInt(cr[0].c, 10);

    const dataSql = `SELECT * FROM jobs ${whereSql} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
    const { rows } = await pool.query(dataSql, params);

    res.set('X-Total-Count', String(total));
    const baseUrl = req.protocol + '://' + req.get('host') + req.baseUrl;
    const q = new URLSearchParams(req.query);
    const links = [];
    if (off + lim < total) { q.set('page', String(pg+1)); links.push(`<${baseUrl}?${q.toString()}>; rel="next"`); }
    if (pg > 1) { q.set('page', String(pg-1)); links.push(`<${baseUrl}?${q.toString()}>; rel="prev"`); }
    if (links.length) res.set('Link', links.join(', '));

    res.json(rows);
  } catch (e) { next(e); }
});

// Get job
router.get('/:id', verify, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT j.* FROM jobs j
      JOIN images i ON j.image_id = i.id
      WHERE j.id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const job = rows[0];
    if (req.user.role !== 'admin') {
      const { rows: r2 } = await pool.query(`SELECT owner_username FROM images WHERE id=$1`, [job.image_id]);
      if (!r2.length || r2[0].owner_username !== req.user.username) return res.status(403).json({ error: 'forbidden' });
    }
    res.json(job);
  } catch (e) { next(e); }
});

module.exports = { router };
