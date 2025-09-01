const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ORIGINALS } = require('./imageStore');

/**
 * Import a random image from Lorem Picsum (no API key required).
 * @returns {Promise<string>} path to saved file
 */
async function importRandomImage() {
  const base = process.env.PICSUM_BASE || 'https://picsum.photos';
  const seed = uuidv4().replace(/-/g, '');
  const w = 1600, h = 1200;
  const url = `${base}/seed/${seed}/${w}/${h}`;

  const outPath = path.join(ORIGINALS, `${seed}.jpg`);
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  await fs.promises.writeFile(outPath, response.data);
  return outPath;
}

module.exports = { importRandomImage };
