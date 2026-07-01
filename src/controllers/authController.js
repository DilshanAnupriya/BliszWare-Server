import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import { sendEmail, passwordResetTemplate } from '../utils/sendEmail.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

const sanitize = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  addresses: user.addresses,
});

// @desc   Register a new customer
// @route  POST /api/auth/register
// @access Public
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  const exists = await User.findOne({ email });
  if (exists) {
    res.status(409);
    throw new Error('An account with that email already exists');
  }

  const user = await User.create({ name, email, password, phone });
  const token = generateToken(user);

  res.cookie('token', token, cookieOptions);
  res.status(201).json({ user: sanitize(user), token });
});

// @desc   Authenticate a user (customer or admin)
// @route  POST /api/auth/login
// @access Public
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  const token = generateToken(user);
  res.cookie('token', token, cookieOptions);
  res.json({ user: sanitize(user), token });
});

// @desc   Admin-only login (rejects non-admins)
// @route  POST /api/auth/admin/login
// @access Public
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }
  if (!['admin', 'superadmin'].includes(user.role)) {
    res.status(403);
    throw new Error('This account does not have admin access');
  }

  const token = generateToken(user);
  res.cookie('token', token, cookieOptions);
  res.json({ user: sanitize(user), token });
});

// @desc   Sign in / sign up with a Google ID token (credential)
// @route  POST /api/auth/google
// @access Public
export const googleLogin = asyncHandler(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503);
    throw new Error('Google sign-in is not configured on the server');
  }
  const { credential } = req.body;
  if (!credential) {
    res.status(400);
    throw new Error('Missing Google credential');
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    res.status(401);
    throw new Error('Invalid Google credential');
  }

  const { email, name, sub: googleId, picture, email_verified } = payload;
  if (!email || !email_verified) {
    res.status(401);
    throw new Error('Google account email is not verified');
  }

  // Find by email; link googleId if it's an existing password account.
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: name || email.split('@')[0],
      email,
      googleId,
      avatar: picture,
    });
  } else if (!user.googleId) {
    user.googleId = googleId;
    if (picture && !user.avatar) user.avatar = picture;
    await user.save();
  }

  const token = generateToken(user);
  res.cookie('token', token, cookieOptions);
  res.json({ user: sanitize(user), token });
});

// @desc   Log out (clear cookie)
// @route  POST /api/auth/logout
// @access Public
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// @desc   Request a password-reset link
// @route  POST /api/auth/forgot-password
// @access Public
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const user = email ? await User.findOne({ email }) : null;

  // Always send the same response so we never reveal which emails are registered.
  const genericMessage = 'If an account exists for that email, a reset link has been sent.';

  if (user) {
    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const base = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();
    const resetUrl = `${base}/reset-password/${rawToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Bliszware password',
        html: passwordResetTemplate(user.name, resetUrl),
      });
    } catch (err) {
      // If the email truly fails, clear the token so it can't linger unusable.
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      console.error('Password reset email error:', err.message);
    }
  }

  res.json({ message: genericMessage });
});

// @desc   Reset the password using a valid token
// @route  POST /api/auth/reset-password/:token
// @access Public
export const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }

  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpire: { $gt: Date.now() },
  }).select('+resetPasswordToken +resetPasswordExpire');

  if (!user) {
    res.status(400);
    throw new Error('This reset link is invalid or has expired');
  }

  user.password = password; // re-hashed by the pre-save hook
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Sign the user in immediately after a successful reset.
  const token = generateToken(user);
  res.cookie('token', token, cookieOptions);
  res.json({ user: sanitize(user), token, message: 'Your password has been updated' });
});

// @desc   Get the current user's profile
// @route  GET /api/auth/me
// @access Private
export const getMe = asyncHandler(async (req, res) => {
  res.json({ user: sanitize(req.user) });
});

// @desc   Update profile (name, phone, password)
// @route  PUT /api/auth/me
// @access Private
export const updateMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  const { name, phone, password } = req.body;

  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (password) user.password = password;

  await user.save();
  res.json({ user: sanitize(user) });
});

// ── Saved addresses ────────────────────────────────────────

// @desc   Add a delivery address
// @route  POST /api/auth/addresses
// @access Private
export const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = req.body;

  if (address.isDefault) {
    user.addresses.forEach((a) => {
      a.isDefault = false;
    });
  }
  if (user.addresses.length === 0) address.isDefault = true;

  user.addresses.push(address);
  await user.save();
  res.status(201).json({ addresses: user.addresses });
});

// @desc   Update a saved address
// @route  PUT /api/auth/addresses/:addressId
// @access Private
export const updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) {
    res.status(404);
    throw new Error('Address not found');
  }

  if (req.body.isDefault) {
    user.addresses.forEach((a) => {
      a.isDefault = false;
    });
  }
  address.set(req.body);
  await user.save();
  res.json({ addresses: user.addresses });
});

// @desc   Delete a saved address
// @route  DELETE /api/auth/addresses/:addressId
// @access Private
export const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) {
    res.status(404);
    throw new Error('Address not found');
  }
  address.deleteOne();
  await user.save();
  res.json({ addresses: user.addresses });
});
