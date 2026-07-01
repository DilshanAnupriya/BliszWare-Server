import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import connectDB from './config/db.js';

const PORT = process.env.PORT || 5000;

// Fail fast if critical secrets are missing (especially in production).
const REQUIRED_ENV = ['JWT_SECRET', 'MONGO_URI'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`✗ Missing required environment variable(s): ${missing.join(', ')}`);
  console.error('  Set them in backend/.env (see .env.example) before starting.');
  process.exit(1);
}

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`✓ Bliszware API running on http://localhost:${PORT} (${process.env.NODE_ENV})`);
  });
};

start();

// Surface unhandled rejections instead of crashing silently.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
