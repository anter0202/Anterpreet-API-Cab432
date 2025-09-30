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
  try {
    await initDb();
  } catch (e) {
    console.error('Warning: database initialization failed. The server will continue to run but database-backed features will error until a database is available.');
    console.error(e && e.stack ? e.stack : e);
  }
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
