const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db/pool');
const { processedPathFor } = require('./imageStore');
const imageProcess = require('./imageProcess');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;


async function createJob(imageId, params = {}) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO jobs(id, image_id, status, params, created_at, updated_at)
     VALUES($1,$2,'processing',$3,NOW(),NOW())`,
    [id, imageId, params]
  );
  return id;
}

async function runJob(jobId, originalKey) {
  const ext = path.extname(originalKey) || '.jpg';
  const tempIn = path.join(process.platform === 'win32' ? process.env.TEMP : '/tmp', `${jobId}-in${ext}`);
  const tempOut = path.join(process.platform === 'win32' ? process.env.TEMP : '/tmp', `${jobId}-out.jpg`);

  try {
    // download original (S3 if configured, otherwise copy local file)
    if (BUCKET) {
      await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(tempIn);
        s3.getObject({ Bucket: BUCKET, Key: originalKey })
          .createReadStream().on('error', reject).pipe(ws).on('error', reject).on('close', resolve);
      });
    } else {
      // originalKey is a local path
      await fs.promises.copyFile(originalKey, tempIn);
    }

    const { rows } = await pool.query(`SELECT params FROM jobs WHERE id=$1`, [jobId]);
    const params = rows[0]?.params || {};
    const result = await imageProcess.heavyProcess(tempIn, tempOut, params);

    // upload processed result (S3 if configured, otherwise write to disk)
    const outBuf = await fs.promises.readFile(tempOut);
    let outKey;
    if (BUCKET) {
      outKey = `processed/${jobId}.jpg`;
      await s3.putObject({
        Bucket: BUCKET,
        Key: outKey,
        Body: outBuf,
        ContentType: 'image/jpeg'
      }).promise();
    } else {
      const outPath = processedPathFor(jobId, 'jpg');
      await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
      await fs.promises.writeFile(outPath, outBuf);
      outKey = outPath;
    }

    await pool.query(
      `UPDATE jobs SET status='done', cpu_ms=$2, result_path=$3, updated_at=NOW() WHERE id=$1`,
      [jobId, Math.round(result.cpuMs), outKey]
    );
  } catch (e) {
    try { await pool.query(`UPDATE jobs SET status='error', updated_at=NOW() WHERE id=$1`, [jobId]); } catch (e2) { /* ignore */ }
    throw e;
  } finally {
    fs.promises.unlink(tempIn).catch(()=>{});
    fs.promises.unlink(tempOut).catch(()=>{});
  }
}

module.exports = { createJob, runJob };
