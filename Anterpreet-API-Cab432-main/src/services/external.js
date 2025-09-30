const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function importRandomImage() {
  const base = process.env.PICSUM_BASE || 'https://picsum.photos';
  const seed = uuidv4().replace(/-/g, '');
  const w = 1600, h = 1200;
  const url = `${base}/seed/${seed}/${w}/${h}`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(res.data);
}
module.exports = { importRandomImage };
