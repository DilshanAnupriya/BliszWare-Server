import asyncHandler from 'express-async-handler';
import Testimonial from '../models/Testimonial.js';

// ─────────────────────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────────────────────

// @desc   Approved, visible testimonials for the storefront
// @route  GET /api/testimonials
// @access Public
export const getTestimonials = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 50);
  // status $ne 'pending' so legacy testimonials (created before moderation) still show.
  const testimonials = await Testimonial.find({ isActive: true, status: { $ne: 'pending' } })
    .sort({ order: 1, createdAt: -1 })
    .limit(limit)
    .select('name location text rating avatar')
    .lean();
  res.json({ testimonials });
});

// @desc   Submit a testimonial (goes to the moderation queue)
// @route  POST /api/testimonials
// @access Private (logged-in users)
export const submitTestimonial = asyncHandler(async (req, res) => {
  const { text, rating, location } = req.body;
  if (!text || !String(text).trim()) {
    res.status(400);
    throw new Error('Please write your testimonial');
  }

  // One pending submission per user at a time keeps the queue tidy.
  const existingPending = await Testimonial.findOne({ user: req.user._id, status: 'pending' });
  if (existingPending) {
    res.status(409);
    throw new Error('You already have a testimonial awaiting review. Thank you!');
  }

  await Testimonial.create({
    name: req.user.name,
    user: req.user._id,
    location: location || '',
    text: String(text).trim(),
    rating: Math.min(Math.max(Number(rating) || 5, 1), 5),
    status: 'pending',
    isActive: true,
  });

  res.status(201).json({ message: 'Thanks! Your testimonial will appear once an admin approves it.' });
});

// ─────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────

// @desc   List all testimonials (incl. hidden)
// @route  GET /api/admin/testimonials
// @access Admin
export const adminGetTestimonials = asyncHandler(async (req, res) => {
  // Pending submissions surface first so they're easy to moderate.
  const testimonials = await Testimonial.find({})
    .sort({ status: -1, order: 1, createdAt: -1 })
    .populate('user', 'name email');
  res.json({ testimonials });
});

// @desc   Create a testimonial
// @route  POST /api/admin/testimonials
// @access Admin
export const createTestimonial = asyncHandler(async (req, res) => {
  const { name, location, text, rating, avatar, isActive, order, status } = req.body;
  // Admin-authored testimonials are published immediately by default.
  const testimonial = await Testimonial.create({
    name,
    location,
    text,
    rating,
    avatar,
    isActive,
    order,
    status: status || 'approved',
  });
  res.status(201).json({ testimonial });
});

// @desc   Update a testimonial
// @route  PUT /api/admin/testimonials/:id
// @access Admin
export const updateTestimonial = asyncHandler(async (req, res) => {
  const testimonial = await Testimonial.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!testimonial) {
    res.status(404);
    throw new Error('Testimonial not found');
  }
  res.json({ testimonial });
});

// @desc   Delete a testimonial
// @route  DELETE /api/admin/testimonials/:id
// @access Admin
export const deleteTestimonial = asyncHandler(async (req, res) => {
  const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
  if (!testimonial) {
    res.status(404);
    throw new Error('Testimonial not found');
  }
  res.json({ message: 'Testimonial deleted' });
});
