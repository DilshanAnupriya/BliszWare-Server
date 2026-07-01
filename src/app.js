import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import testimonialRoutes from './routes/testimonialRoutes.js';
import { mongoSanitize } from './middleware/sanitize.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();

// Trust the first proxy (needed for secure cookies & rate-limit behind a host).
app.set('trust proxy', 1);

// Security headers + gzip compression.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

// Allow the Next.js frontend to call the API with cookies.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true })); // PayHere webhook posts form-encoded data
app.use(cookieParser());

// Strip Mongo operator/injection keys ($..., dotted) from all input.
app.use(mongoSanitize);

// Serve locally-stored uploads (bank slips) when Cloudinary isn't configured.
app.use('/uploads', express.static('uploads'));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Basic abuse protection on auth endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

// Health check
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', service: 'shoe-shop-api', time: new Date().toISOString() })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/admin', adminRoutes);

// 404 + error handling (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
