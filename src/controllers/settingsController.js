import asyncHandler from 'express-async-handler';
import Settings from '../models/Settings.js';

// @desc   Public store settings (bank details for checkout, WhatsApp contact)
// @route  GET /api/settings
// @access Public
export const getSettings = asyncHandler(async (req, res) => {
  const s = await Settings.get();
  res.json({ settings: { bank: s.bank, whatsappNumber: s.whatsappNumber } });
});

// @desc   Update store settings
// @route  PUT /api/admin/settings
// @access Admin
export const updateSettings = asyncHandler(async (req, res) => {
  const { bank, whatsappNumber } = req.body;
  const s = await Settings.get();

  if (bank && typeof bank === 'object') {
    for (const k of ['bankName', 'accountName', 'accountNumber', 'branch']) {
      if (bank[k] !== undefined) s.bank[k] = String(bank[k]).trim();
    }
  }
  if (whatsappNumber !== undefined) {
    const digits = String(whatsappNumber).replace(/\D/g, '');
    if (digits && (digits.length < 10 || digits.length > 15)) {
      res.status(400);
      throw new Error('WhatsApp number must be 10–15 digits in international format (e.g. 94771234567)');
    }
    s.whatsappNumber = digits;
  }

  await s.save();
  res.json({ settings: { bank: s.bank, whatsappNumber: s.whatsappNumber } });
});
