import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Promotion from '../models/Promotion.js';
import Testimonial from '../models/Testimonial.js';
import { products, promotions, testimonials } from './data.js';

const destroy = process.argv.includes('--destroy');

// Super admin — credentials come from the environment (never hard-coded).
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME || 'Bliszware Admin';
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || '').toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';

if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
  console.error('✗ Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in backend/.env before seeding.');
  process.exit(1);
}

const run = async () => {
  await connectDB();

  // Clear everything for a clean slate.
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    Cart.deleteMany({}),
    Promotion.deleteMany({}),
    Testimonial.deleteMany({}),
  ]);

  if (destroy) {
    console.log('✓ All collections cleared.');
    await mongoose.connection.close();
    process.exit(0);
  }

  // The single super admin account (no dummy accounts).
  await User.create({
    name: SUPERADMIN_NAME,
    email: SUPERADMIN_EMAIL,
    password: SUPERADMIN_PASSWORD,
    role: 'superadmin',
  });

  // Catalogue content (use create so slug/pre-save hooks run per document).
  await Product.create(products);
  await Promotion.create(promotions);
  await Testimonial.create(testimonials.map((t) => ({ ...t, status: 'approved' })));

  console.log('✓ Seed complete:');
  console.log(`   Super admin: ${SUPERADMIN_EMAIL} (password from .env)`);
  console.log(`   ${products.length} products, ${promotions.length} coupons, ${testimonials.length} testimonials created.`);
  console.log('   ⚠ Change the super admin password after first login.');

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
