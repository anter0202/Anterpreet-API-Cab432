const express = require('express');
const os = require('os');
const { verify, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/metrics', verify, requireAdmin, async (req, res) => {
  const [l1, l5, l15] = os.loadavg();
  res.json({
    hostname: os.hostname(),
    loadavg: { l1, l5, l15 },
    cpus: os.cpus().length,
    memory: { total: os.totalmem(), free: os.freemem() }
  });
});

module.exports = { router };
