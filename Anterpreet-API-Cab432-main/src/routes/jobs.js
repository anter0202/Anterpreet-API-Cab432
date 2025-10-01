const express = require('express');
const { verify } = require('../middleware/auth');
const { createJob, runJob, getJob, queryJobs } = require('../services/jobs');
const { getImage } = require('../services/imageStore');
let dynamo;
try { dynamo = require('../db/dynamo'); } catch (e) { dynamo = null; }
// If DynamoDB not configured, we fall back to local in-memory job store provided by the jobs service.

const router = express.Router();

// Create a job (synchronous processing to keep A1 simple)
router.post('/', verify, async (req, res, next) => {
  try {
    const { imageId, params } = req.body || {};
    if (!imageId) return res.status(400).json({ error: 'missing_imageId' });

  // Authorisation: only owner or admin
  // image must exist (DynamoDB or local fallback)
  const img = await getImage(imageId);
    if (!img) return res.status(404).json({ error: 'image_not_found' });
    if (req.user.role !== 'admin' && img.owner_username !== req.user.username) return res.status(403).json({ error: 'forbidden' });

  const jobId = await createJob(imageId, params || {}, req.user.username);
    // Run synchronously in this request (for A1). For later, you would queue this.
    await runJob(jobId, img.original_path);

  const job = await getJob(jobId);
  return res.status(201).json(job);
  } catch (e) { next(e); }
});

// List jobs
router.get('/', verify, async (req, res, next) => {
  try {
    const { status, limit='20', page='1' } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit)));
    const pg = Math.max(1, parseInt(page));
    const off = (pg-1)*lim;

    // If DynamoDB jobs table is configured, use it.
    // Use service-layer query which handles DynamoDB or local fallback
    const owner = req.user.role === 'admin' ? null : req.user.username;
    const { items, nextToken } = await queryJobs({ owner, status, limit: lim, nextToken: req.query.nextToken });
    if (nextToken) res.set('X-Next-Token', nextToken);
    return res.json(items);

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
    // Use service-layer get which handles DynamoDB or local fallback
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (req.user.role !== 'admin') {
      if (!job.owner_username || job.owner_username !== req.user.username) return res.status(403).json({ error: 'forbidden' });
    }
    res.json(job);
  } catch (e) { next(e); }
});

module.exports = { router };
