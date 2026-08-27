'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');

const encryptRouter = require('./routes/encrypt');
const decryptRouter = require('./routes/decrypt');
const historyRouter = require('./routes/history');

const app = express();

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');

// Frontend + vendored animation libs (copied into public/vendor by the
// postinstall script — plain static files, deployable anywhere).
app.use(express.static(PUBLIC_DIR));

// API
app.use('/api/encrypt', encryptRouter);
app.use('/api/decrypt', decryptRouter);
app.use('/api/history', historyRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Unknown API endpoint' });
});

// Central error handler — always JSON, correct status codes, no stack leaks.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      const limit = req.baseUrl === '/api/decrypt' ? '50 MB' : '4 MB';
      message = `File too large (maximum ${limit})`;
    } else {
      status = 400;
      message = `Upload error: ${err.message}`;
    }
  }
  if (status >= 500) {
    console.error(err);
    message = 'Internal server error';
  }
  res.status(status).json({ error: message });
});

// On Vercel the app is imported as a serverless handler; only bind a port
// for local development.
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => console.log(`Local dev server on http://localhost:${port}`));
}

module.exports = app;
