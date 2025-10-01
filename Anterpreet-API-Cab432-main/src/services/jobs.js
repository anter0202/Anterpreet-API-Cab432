const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
let dynamo;
try { dynamo = require('../db/dynamo'); } catch (e) { dynamo = null; }
// In-memory jobs fallback for local dev if DynamoDB not configured
let localJobStore = null;
if (!dynamo || !process.env.DYNAMODB_TABLE_JOBS) {
  console.warn('Warning: DynamoDB jobs table not configured. Using in-memory job store (dev only).');
  localJobStore = new Map();
}
const { processedPathFor } = require('./imageStore');
const imageProcess = require('./imageProcess');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;


async function createJob(imageId, params = {}, ownerUsername = null) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const jobRec = { id, image_id: imageId, status: 'processing', params, created_at: now, updated_at: now, owner_username: ownerUsername };
  if (dynamo && process.env.DYNAMODB_TABLE_JOBS) {
    await dynamo.putJob(jobRec);
  } else if (localJobStore) {
    localJobStore.set(id, jobRec);
  }
  return id;
}

async function getJob(id) {
  if (dynamo && process.env.DYNAMODB_TABLE_JOBS) {
    return await dynamo.getJob(id);
  }
  if (localJobStore) return localJobStore.get(id) || null;
  return null;
}

async function queryJobs({ owner = null, status = null, limit = 20, nextToken = null } = {}) {
  if (dynamo && process.env.DYNAMODB_TABLE_JOBS) {
    return await dynamo.queryJobs({ owner, status, limit, nextToken });
  }
  const all = Array.from(localJobStore ? localJobStore.values() : []);
  let filtered = all;
  if (status) filtered = filtered.filter(j => j.status === status);
  if (owner) filtered = filtered.filter(j => j.owner_username === owner);
  // sort by created_at desc
  filtered.sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
  const items = filtered.slice(0, Math.min(limit, filtered.length));
  return { items, nextToken: null };
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

    let params = {};
    if (dynamo && process.env.DYNAMODB_TABLE_JOBS) {
      const job = await dynamo.getJob(jobId);
      params = job?.params || {};
    } else if (localJobStore) {
      const job = localJobStore.get(jobId);
      params = job?.params || {};
    }
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

    if (dynamo && process.env.DYNAMODB_TABLE_JOBS) {
      await dynamo.updateJobStatus(jobId, { status: 'done', cpu_ms: Math.round(result.cpuMs), result_path: outKey, updated_at: new Date().toISOString() });
    } else if (localJobStore) {
      const job = localJobStore.get(jobId) || {};
      job.status = 'done'; job.cpu_ms = Math.round(result.cpuMs); job.result_path = outKey; job.updated_at = new Date().toISOString();
      localJobStore.set(jobId, job);
    }
  } catch (e) {
    try {
      if (dynamo && process.env.DYNAMODB_TABLE_JOBS) {
        await dynamo.updateJobStatus(jobId, { status: 'error', updated_at: new Date().toISOString() });
      } else if (localJobStore) {
        const job = localJobStore.get(jobId) || {};
        job.status = 'error'; job.updated_at = new Date().toISOString();
        localJobStore.set(jobId, job);
      }
    } catch (e2) { /* ignore */ }
    throw e;
  } finally {
    fs.promises.unlink(tempIn).catch(()=>{});
    fs.promises.unlink(tempOut).catch(()=>{});
  }
}

module.exports = { createJob, runJob, getJob, queryJobs };

async function getJob(id) {
  if (dynamo && process.env.DYNAMODB_TABLE_JOBS) {
    return await dynamo.getJob(id);
  }
  if (localJobStore) return localJobStore.get(id) || null;
  return null;
}

async function queryJobs({ owner=null, status=null, limit=20, nextToken=null } = {}) {
  if (dynamo && process.env.DYNAMODB_TABLE_JOBS) {
    return await dynamo.queryJobs({ owner, status, limit, nextToken });
  }
  const all = Array.from(localJobStore ? localJobStore.values() : []);
  let filtered = all;
  if (status) filtered = filtered.filter(j => j.status === status);
  if (owner) filtered = filtered.filter(j => j.owner_username === owner);
  // sort by created_at desc
  filtered.sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
  const items = filtered.slice(0, limit);
  return { items, nextToken: null };
}

module.exports = { createJob, runJob, getJob, queryJobs };

