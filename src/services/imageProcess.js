const sharp = require('sharp');

/**
 * CPU-intensive pipeline. Increase repeats and add steps to keep CPU hot.
 * @param {string} inPath
 * @param {string} outPath
 * @param {{preset?: 'max'|'med', repeats?: number}} params
 * @returns {Promise<{cpuMs:number}>}
 */
async function heavyProcess(inPath, outPath, params = {}) {
  const preset = params.preset || 'max';
  const repeats = Number.isFinite(params.repeats) ? Math.max(1, params.repeats) : (preset === 'max' ? 3 : 1);

  const start = process.hrtime.bigint();
  let img = sharp(inPath, { unlimited: true });

  const meta = await img.metadata();
  const baseWidth = Math.max(1024, Math.floor((meta.width || 2048)));

  for (let i = 0; i < repeats; i++) {
    img = sharp(inPath, { unlimited: true })
      .resize({ width: Math.max(512, Math.floor(baseWidth / (i+1))) })
      .blur(25)               // big gaussian kernel
      .sharpen()              // unsharp mask
      .modulate({ saturation: 1.1, brightness: 1.05 })
      .jpeg({ quality: 95, mozjpeg: true });
    // extra CPU: toBuffer() then reprocess
    const buf = await img.toBuffer();
    img = sharp(buf).rotate(0).median(3).normalise();
  }
  await img.jpeg({ quality: 92, mozjpeg: true }).toFile(outPath);

  const end = process.hrtime.bigint();
  const cpuMs = Number(end - start) / 1e6;
  return { cpuMs };
}

module.exports = { heavyProcess };
