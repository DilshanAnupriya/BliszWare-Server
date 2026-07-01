import fs from 'fs';
import path from 'path';
import asyncHandler from 'express-async-handler';
import { uploadBuffer, deleteImage, isCloudinaryConfigured } from '../config/cloudinary.js';

// @desc   Upload one or more product images to Cloudinary
// @route  POST /api/upload
// @access Admin
export const uploadImages = asyncHandler(async (req, res) => {
  if (!isCloudinaryConfigured()) {
    res.status(503);
    throw new Error('Cloudinary is not configured. Add your credentials to .env');
  }
  if (!req.files?.length) {
    res.status(400);
    throw new Error('No files uploaded');
  }

  const results = await Promise.all(
    req.files.map((f) => uploadBuffer(f.buffer, 'shoe-shop/products'))
  );

  res.status(201).json({
    images: results.map((r) => ({ url: r.secure_url, publicId: r.public_id })),
  });
});

// @desc   Upload a bank-deposit slip for an order (customer-facing)
// @route  POST /api/upload/slip
// @access Private (any logged-in user)
// Uses Cloudinary when configured, otherwise falls back to local disk so the
// flow works out of the box in development / on a single host.
export const uploadSlip = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  if (isCloudinaryConfigured()) {
    const result = await uploadBuffer(req.file.buffer, 'shoe-shop/slips');
    return res.status(201).json({ url: result.secure_url });
  }

  const dir = path.join(process.cwd(), 'uploads', 'slips');
  fs.mkdirSync(dir, { recursive: true });
  const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
  const filename = `slip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);

  const origin = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
  res.status(201).json({ url: `${origin}/uploads/slips/${filename}` });
});

// @desc   Delete an image from Cloudinary
// @route  DELETE /api/upload/:publicId
// @access Admin
export const removeImage = asyncHandler(async (req, res) => {
  // publicId may contain slashes, so it is passed url-encoded.
  const publicId = decodeURIComponent(req.params.publicId);
  await deleteImage(publicId);
  res.json({ message: 'Image deleted' });
});
