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
const itemsRouter = require('./routes/items');

const errorHandler = require('./middleware/error');
const { ensureDataDirs } = require('./services/imageStore');
// initDb removed (migrated to DynamoDB). If you need DB init logic, re-add appropriately.

dotenv.config();

const PORT = process.env.PORT || 8080;
const app = express();

app.use(morgan(process.env.LOG_LEVEL || 'dev'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the tiny web client. During local development disable caching so browsers pick up edits immediately.
app.use('/', express.static(path.join(__dirname, '..', 'client'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Health
app.get('/api/v1/healthz', (req, res) => res.json({ ok: true }));

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/images', imagesRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/items', itemsRouter);

// Errors
app.use(errorHandler);

(async () => {
  await ensureDataDirs();
  // Database initialization removed (DynamoDB used). Proceed to start server.
  const server = app.listen(PORT, '0.0.0.0', () => console.log(`PixelSmith API listening on :${PORT}`));
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Error: port ${PORT} is already in use. Another process is listening on this port.`);
      console.error(`On Windows you can run: netstat -ano | findstr :${PORT}  to find the PID, then tasklist /FI "PID eq <pid>" and taskkill /PID <pid> /F to stop it.`);
    } else {
      console.error('Server error:', err && err.stack ? err.stack : err);
    }
    process.exit(1);
  });
})();
