import mongoose from 'mongoose';

/**
 * A discount coupon. Supports percentage or fixed-amount discounts, an
 * optional minimum spend, a usage cap, and a validity window.
 */
const promotionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: { type: String },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    value: { type: Number, required: true, min: 0 }, // 10 = 10% or Rs 10
    minSpend: { type: Number, default: 0 },
    maxDiscount: { type: Number }, // cap for percentage coupons
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/** Whether the coupon can currently be applied to an order of `subtotal`. */
promotionSchema.methods.isValidFor = function isValidFor(subtotal) {
  const now = new Date();
  if (!this.isActive) return { ok: false, reason: 'Coupon is not active' };
  if (this.startsAt && now < this.startsAt) return { ok: false, reason: 'Coupon not yet valid' };
  if (this.expiresAt && now > this.expiresAt) return { ok: false, reason: 'Coupon has expired' };
  if (this.usageLimit && this.usedCount >= this.usageLimit)
    return { ok: false, reason: 'Coupon usage limit reached' };
  if (subtotal < this.minSpend)
    return { ok: false, reason: `Minimum spend is Rs ${this.minSpend.toLocaleString()}` };
  return { ok: true };
};

/** Compute the discount amount this coupon yields for a given subtotal. */
promotionSchema.methods.computeDiscount = function computeDiscount(subtotal) {
  let discount = this.type === 'percentage' ? (subtotal * this.value) / 100 : this.value;
  if (this.type === 'percentage' && this.maxDiscount) {
    discount = Math.min(discount, this.maxDiscount);
  }
  return Math.min(Math.round(discount), subtotal);
};

const Promotion = mongoose.model('Promotion', promotionSchema);
export default Promotion;
