import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Testimonial from '../models/Testimonial.js';
import { testimonials } from './data.js';

/**
 * Non-destructive setup script — safe to run against a live database.
 *
 *   node src/seed/superadmin.js                  create super admin + remove demo accounts
 *   node src/seed/superadmin.js --reset-password reset the super admin's password too
 *   node src/seed/superadmin.js --wipe-users     also delete every other account (clean slate)
 *
 * It does NOT touch products, orders, carts or promotions.
 */

const resetPassword = process.argv.includes('--reset-password');
const wipeUsers = process.argv.includes('--wipe-users');

const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME || 'Bliszware Admin';
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || '').toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';

if (!SUPERADMIN_EMAIL) {
  console.error('✗ Set SUPERADMIN_EMAIL in backend/.env first.');
  process.exit(1);
}

// Demo/sample accounts shipped with earlier seeds.
const DUMMY_EMAILS = ['admin@shoeshop.lk', 'customer@shoeshop.lk'];

const run = async () => {
  await connectDB();

  // 1) Remove dummy accounts.
  if (wipeUsers) {
    const { deletedCount } = await User.deleteMany({ email: { $ne: SUPERADMIN_EMAIL } });
    console.log(`✓ Removed ${deletedCount} account(s) — kept only the super admin.`);
  } else {
    const { deletedCount } = await User.deleteMany({ email: { $in: DUMMY_EMAILS } });
    console.log(`✓ Removed ${deletedCount} demo account(s): ${DUMMY_EMAILS.join(', ')}`);
  }

  // 2) Create / promote the super admin.
  let admin = await User.findOne({ email: SUPERADMIN_EMAIL }).select('+password');
  if (!admin) {
    if (!SUPERADMIN_PASSWORD) {
      console.error('✗ Set SUPERADMIN_PASSWORD in backend/.env to create the super admin.');
      process.exit(1);
    }
    admin = await User.create({
      name: SUPERADMIN_NAME,
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
      role: 'superadmin',
    });
    console.log(`✓ Created super admin: ${SUPERADMIN_EMAIL}`);
    console.log('  ⚠ Sign in with the password from your .env, then change it after first login.');
  } else {
    admin.role = 'superadmin';
    if (resetPassword) {
      if (!SUPERADMIN_PASSWORD) {
        console.error('✗ Set SUPERADMIN_PASSWORD in backend/.env to reset the password.');
        process.exit(1);
      }
      admin.password = SUPERADMIN_PASSWORD;
    }
    await admin.save();
    console.log(
      `✓ Existing account ${SUPERADMIN_EMAIL} promoted to super admin` +
        (resetPassword ? ' (password reset from .env)' : '')
    );
  }

  // 3) Migrate any pre-moderation testimonials (no status field) to 'approved'.
  const migrated = await Testimonial.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'approved' } }
  );
  if (migrated.modifiedCount) {
    console.log(`✓ Marked ${migrated.modifiedCount} existing testimonial(s) as approved.`);
  }

  // 4) Seed testimonials only if none exist yet (so the homepage isn't empty).
  const count = await Testimonial.countDocuments({});
  if (count === 0) {
    await Testimonial.create(testimonials.map((t) => ({ ...t, status: 'approved' })));
    console.log(`✓ Seeded ${testimonials.length} starter testimonials.`);
  } else {
    console.log(`• ${count} testimonial(s) already present — left untouched.`);
  }

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
