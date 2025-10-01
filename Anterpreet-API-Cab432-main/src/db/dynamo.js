const AWS = require('aws-sdk');
const Table = process.env.DYNAMODB_TABLE_IMAGES;
const region = process.env.AWS_REGION || 'us-east-1';

const opts = { region };
// Allow overriding endpoint for local development (DynamoDB Local)
if (process.env.DYNAMODB_ENDPOINT) opts.endpoint = process.env.DYNAMODB_ENDPOINT;

const client = new AWS.DynamoDB.DocumentClient(opts);

// Helper: encode/decode pagination tokens (ExclusiveStartKey)
function encodeToken(key) {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64');
}
function decodeToken(token) {
  if (!token) return null;
  try { return JSON.parse(Buffer.from(token, 'base64').toString('utf8')); } catch (e) { return null; }
}

async function putImage(item) {
  if (!Table) throw new Error('DYNAMODB_TABLE_IMAGES not configured');
  const params = { TableName: Table, Item: item };
  await client.put(params).promise();
  return item;
}

async function getImage(id) {
  if (!Table) throw new Error('DYNAMODB_TABLE_IMAGES not configured');
  const params = { TableName: Table, Key: { id } };
  const r = await client.get(params).promise();
  return r.Item || null;
}

/**
 * Simple query/scan implementation.
 * - If owner is provided we try a Query on owner_username index (must exist) otherwise fallback to Scan.
 * - Supports format filtering and pagination via nextToken.
 */
async function queryImages({ owner, format, limit = 20, nextToken }) {
  if (!Table) throw new Error('DYNAMODB_TABLE_IMAGES not configured');
  const exclusiveStartKey = decodeToken(nextToken);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));

  // Attempt to use Query on GSI named owner_username-created_at-index (recommended for production)
  if (owner) {
    const qparams = {
      TableName: Table,
      IndexName: 'owner_username-created_at-index',
      KeyConditionExpression: 'owner_username = :o',
      ExpressionAttributeValues: { ':o': owner },
      Limit: lim,
      ExclusiveStartKey: exclusiveStartKey
    };
    if (format) {
      qparams.FilterExpression = '#fmt = :f';
      qparams.ExpressionAttributeNames = { '#fmt': 'format' };
      qparams.ExpressionAttributeValues[':f'] = String(format).toLowerCase();
    }
    const r = await client.query(qparams).promise();
    return { items: r.Items || [], nextToken: encodeToken(r.LastEvaluatedKey) };
  }

  // Fallback to Scan with filters (inefficient for large tables)
  const scanParams = {
    TableName: Table,
    Limit: lim,
    ExclusiveStartKey: exclusiveStartKey
  };
  const filters = [];
  const exprAttr = { ExpressionAttributeNames: {}, ExpressionAttributeValues: {} };
  if (format) {
    filters.push('#fmt = :f');
    exprAttr.ExpressionAttributeNames['#fmt'] = 'format';
    exprAttr.ExpressionAttributeValues[':f'] = String(format).toLowerCase();
  }
  if (filters.length) {
    scanParams.FilterExpression = filters.join(' AND ');
    scanParams.ExpressionAttributeNames = exprAttr.ExpressionAttributeNames;
    scanParams.ExpressionAttributeValues = exprAttr.ExpressionAttributeValues;
  }

  const r = await client.scan(scanParams).promise();
  return { items: r.Items || [], nextToken: encodeToken(r.LastEvaluatedKey) };
}

module.exports = { putImage, getImage, queryImages };
// Jobs table (optional)
const JobsTable = process.env.DYNAMODB_TABLE_JOBS;

async function putJob(item) {
  if (!JobsTable) throw new Error('DYNAMODB_TABLE_JOBS not configured');
  const params = { TableName: JobsTable, Item: item };
  await client.put(params).promise();
  return item;
}

async function getJob(id) {
  if (!JobsTable) throw new Error('DYNAMODB_TABLE_JOBS not configured');
  const params = { TableName: JobsTable, Key: { id } };
  const r = await client.get(params).promise();
  return r.Item || null;
}

async function updateJobStatus(id, updates = {}) {
  if (!JobsTable) throw new Error('DYNAMODB_TABLE_JOBS not configured');
  const expr = [];
  const attrNames = {};
  const attrVals = {};
  let idx = 0;
  for (const k of Object.keys(updates)) {
    idx++;
    const name = `#k${idx}`;
    const val = `:v${idx}`;
    expr.push(`${name} = ${val}`);
    attrNames[name] = k;
    attrVals[val] = updates[k];
  }
  if (!expr.length) return await getJob(id);
  const params = {
    TableName: JobsTable,
    Key: { id },
    UpdateExpression: 'SET ' + expr.join(', '),
    ExpressionAttributeNames: attrNames,
    ExpressionAttributeValues: attrVals,
    ReturnValues: 'ALL_NEW'
  };
  const r = await client.update(params).promise();
  return r.Attributes;
}

async function queryJobs({ owner, status, limit = 20, nextToken }) {
  if (!JobsTable) throw new Error('DYNAMODB_TABLE_JOBS not configured');
  const exclusiveStartKey = decodeToken(nextToken);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));

  if (owner) {
    const qparams = {
      TableName: JobsTable,
      IndexName: 'owner_username-created_at-index',
      KeyConditionExpression: 'owner_username = :o',
      ExpressionAttributeValues: { ':o': owner },
      Limit: lim,
      ExclusiveStartKey: exclusiveStartKey
    };
    if (status) {
      qparams.FilterExpression = '#s = :s';
      qparams.ExpressionAttributeNames = { '#s': 'status' };
      qparams.ExpressionAttributeValues[':s'] = status;
    }
    const r = await client.query(qparams).promise();
    return { items: r.Items || [], nextToken: encodeToken(r.LastEvaluatedKey) };
  }

  // fallback to scan
  const scanParams = { TableName: JobsTable, Limit: lim, ExclusiveStartKey: exclusiveStartKey };
  const filters = [];
  const exprAttr = { ExpressionAttributeNames: {}, ExpressionAttributeValues: {} };
  if (status) {
    filters.push('#s = :s');
    exprAttr.ExpressionAttributeNames['#s'] = 'status';
    exprAttr.ExpressionAttributeValues[':s'] = status;
  }
  if (filters.length) {
    scanParams.FilterExpression = filters.join(' AND ');
    scanParams.ExpressionAttributeNames = exprAttr.ExpressionAttributeNames;
    scanParams.ExpressionAttributeValues = exprAttr.ExpressionAttributeValues;
  }
  const r = await client.scan(scanParams).promise();
  return { items: r.Items || [], nextToken: encodeToken(r.LastEvaluatedKey) };
}

module.exports = { putImage, getImage, queryImages, putJob, getJob, updateJobStatus, queryJobs };
// end
