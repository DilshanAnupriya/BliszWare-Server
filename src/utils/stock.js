import Product from '../models/Product.js';
import { sendEmail, lowStockTemplate } from './sendEmail.js';

export const LOW_STOCK_THRESHOLD = 5;

/**
 * Decrement per-size stock for each ordered item, then email the shop owner if
 * any affected product has dropped to/below the low-stock threshold.
 * Centralised so COD, PayHere and the demo-confirm paths all behave the same.
 */
export const decrementStockAndAlert = async (items) => {
  await Promise.all(
    items.map((i) =>
      Product.updateOne(
        { _id: i.product, 'variants.size': i.size },
        { $inc: { 'variants.$.stock': -i.quantity } }
      )
    )
  );

  // Re-read the affected products to evaluate their new total stock.
  const ids = [...new Set(items.map((i) => String(i.product)))];
  const products = await Product.find({ _id: { $in: ids } });
  const low = products.filter((p) => p.totalStock <= LOW_STOCK_THRESHOLD);

  if (low.length && process.env.ADMIN_EMAIL) {
    sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `⚠ Low stock — ${low.length} product(s) need restocking`,
      html: lowStockTemplate(low),
    }).catch((e) => console.error('Low-stock email error:', e.message));
  }
};
