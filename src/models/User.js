import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/** A saved delivery address belonging to a user. */
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Home' }, // e.g. Home, Office
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    district: { type: String },
    postalCode: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
    },
    password: {
      type: String,
      // Required only for password accounts — Google sign-ins have no password.
      required: [
        function requirePassword() {
          return !this.googleId;
        },
        'Password is required',
      ],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // never returned by default
    },
    googleId: { type: String }, // set for accounts created/linked via Google
    avatar: { type: String },
    phone: { type: String },
    role: { type: String, enum: ['customer', 'admin', 'superadmin'], default: 'customer' },
    addresses: [addressSchema],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    // Password reset (stored hashed; never expose the raw token).
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
  },
  { timestamps: true }
);

// Hash the password whenever it is set or changed.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function matchPassword(entered) {
  if (!this.password) return false; // Google-only accounts can't password-login
  return bcrypt.compare(entered, this.password);
};

/**
 * Generate a password-reset token: returns the raw token (emailed to the user)
 * and stores only its SHA-256 hash + a 1-hour expiry on the document.
 */
userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
  return rawToken;
};

const User = mongoose.model('User', userSchema);
export default User;
