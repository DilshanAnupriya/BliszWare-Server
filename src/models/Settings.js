import mongoose from 'mongoose';

/**
 * Store-wide settings the admin can edit from the dashboard (a single
 * document). Values fall back to env vars on first creation so a fresh
 * deploy still shows something sensible before the admin edits them.
 */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'store', unique: true },
    bank: {
      bankName: { type: String, default: '' },
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      branch: { type: String, default: '' },
    },
    // International format, digits only (e.g. 94771234567).
    whatsappNumber: { type: String, default: '' },
  },
  { timestamps: true }
);

/** Fetch the settings document, creating it from env defaults on first use. */
settingsSchema.statics.get = async function get() {
  let doc = await this.findOne({ key: 'store' });
  if (!doc) {
    doc = await this.create({
      key: 'store',
      bank: {
        bankName: process.env.BANK_NAME || 'Commercial Bank of Ceylon',
        accountName: process.env.BANK_ACCOUNT_NAME || 'Bliszware (Pvt) Ltd',
        accountNumber: process.env.BANK_ACCOUNT_NO || '1000-0000-0000',
        branch: process.env.BANK_BRANCH || 'Colombo',
      },
      whatsappNumber: process.env.WHATSAPP_NUMBER || '94770000000',
    });
  }
  return doc;
};

const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
