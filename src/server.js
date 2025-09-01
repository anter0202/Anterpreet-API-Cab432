const path = require('path');
const fs = require('fs');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
const { router: authRouter } = require('./routes/auth');
const { router: imagesRouter } = require('./routes/images');
const { router: jobsRouter } = require('./routes/jobs');
const { router: adminRouter } = require('./routes/admin');
const errorHandler = require('./middleware/error');
const { ensureDataDirs } = require('./services/imageStore');
const { initDb } = require('./db/init');

dotenv.config();

const PORT = process.env.PORT || 8080;
const app = express();

app.use(morgan(process.env.LOG_LEVEL || 'dev'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the tiny web client
app.use('/', express.static(path.join(__dirname, '..', 'client')));

// Health
app.get('/api/v1/healthz', (req, res) => res.json({ ok: true }));

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/images', imagesRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/admin', adminRouter);

// Errors
app.use(errorHandler);

(async () => {
  await ensureDataDirs();
  await initDb();
  app.listen(PORT, () => console.log(`PixelSmith API listening on :${PORT}`));
})();
