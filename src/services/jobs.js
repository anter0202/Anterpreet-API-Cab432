const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { pool } = require('../db/pool');
const { processedPathFor } = require('./imageStore');
const { heavyProcess } = require('./imageProcess');

async function createJob(imageId, params = {}) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO jobs(id, image_id, status, params, created_at, updated_at)
     VALUES($1,$2,'processing',$3,NOW(),NOW())`,
    [id, imageId, params]
  );
  return id;
}

async function runJob(jobId, originalPath) {
  // derive output path from jobId (one processed output per job)
  const outPath = processedPathFor(jobId, 'jpg');
  try {
    const { rows } = await pool.query(`SELECT params FROM jobs WHERE id=$1`, [jobId]);
    const params = rows?.[0]?.params || {};
    const result = await heavyProcess(originalPath, outPath, params);
    await pool.query(
      `UPDATE jobs SET status='done', cpu_ms=$2, result_path=$3, updated_at=NOW() WHERE id=$1`,
      [jobId, Math.round(result.cpuMs), outPath]
    );
    return { ok: true, outPath, cpuMs: Math.round(result.cpuMs) };
  } catch (e) {
    await pool.query(
      `UPDATE jobs SET status='error', updated_at=NOW() WHERE id=$1`,
      [jobId]
    );
    throw e;
  }
}

module.exports = { createJob, runJob };
