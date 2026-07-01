import asyncHandler from 'express-async-handler';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { toCsv, parseCsv } from '../utils/csv.js';

// Columns used for product export AND import — keeps the round-trip lossless.
const PRODUCT_COLUMNS = [
  'name',
  'brand',
  'category',
  'price',
  'compareAtPrice',
  'description',
  'colors', // pipe-separated: Black|White
  'variants', // pipe-separated size:stock: 40:10|41:5
  'featured', // true/false
  'images', // pipe-separated URLs
];

const productToRow = (p) => ({
  name: p.name,
  brand: p.brand,
  category: p.category,
  price: p.price,
  compareAtPrice: p.compareAtPrice || '',
  description: p.description,
  colors: (p.colors || []).join('|'),
  variants: (p.variants || []).map((v) => `${v.size}:${v.stock}`).join('|'),
  featured: p.featured ? 'true' : 'false',
  images: (p.images || []).map((i) => i.url).join('|'),
});

// @desc   Export a dataset as CSV
// @route  GET /api/admin/export/:type   (type: products|orders|customers)
// @access Admin
export const exportCsv = asyncHandler(async (req, res) => {
  const { type } = req.params;
  let columns;
  let rows;

  if (type === 'products') {
    columns = PRODUCT_COLUMNS;
    const products = await Product.find({}).sort({ createdAt: -1 });
    rows = products.map(productToRow);
  } else if (type === 'orders') {
    columns = [
      'orderNumber', 'date', 'customer', 'email', 'phone', 'city', 'items',
      'paymentMethod', 'status', 'isPaid', 'itemsPrice', 'discount', 'shipping',
      'total', 'courier', 'trackingNumber',
    ];
    const orders = await Order.find({}).sort({ createdAt: -1 }).populate('user', 'email');
    rows = orders.map((o) => ({
      orderNumber: o.orderNumber,
      date: new Date(o.createdAt).toISOString().slice(0, 10),
      customer: o.shippingAddress?.fullName,
      email: o.user?.email || o.guestEmail || '',
      phone: o.shippingAddress?.phone || '',
      city: o.shippingAddress?.city || '',
      items: o.items.map((i) => `${i.name} (${i.size}) x${i.quantity}`).join('; '),
      paymentMethod: o.paymentMethod,
      status: o.status,
      isPaid: o.isPaid ? 'yes' : 'no',
      itemsPrice: o.itemsPrice,
      discount: o.discount,
      shipping: o.shippingPrice,
      total: o.totalPrice,
      courier: o.shipment?.courier || '',
      trackingNumber: o.shipment?.trackingNumber || '',
    }));
  } else if (type === 'customers') {
    columns = ['name', 'email', 'phone', 'orders', 'spent', 'joined'];
    const customers = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
    rows = await Promise.all(
      customers.map(async (c) => {
        const agg = await Order.aggregate([
          { $match: { user: c._id, isPaid: true } },
          { $group: { _id: null, spent: { $sum: '$totalPrice' }, orders: { $sum: 1 } } },
        ]);
        return {
          name: c.name,
          email: c.email,
          phone: c.phone || '',
          orders: agg[0]?.orders || 0,
          spent: agg[0]?.spent || 0,
          joined: new Date(c.createdAt).toISOString().slice(0, 10),
        };
      })
    );
  } else {
    res.status(400);
    throw new Error('Unknown export type. Use products, orders or customers.');
  }

  const csv = toCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-${Date.now()}.csv"`);
  res.send(csv);
});

// @desc   Download a blank product import template
// @route  GET /api/admin/products/import-template
// @access Admin
export const importTemplate = asyncHandler(async (req, res) => {
  const sample = [
    {
      name: 'Example Runner',
      brand: 'Nike',
      category: 'Men',
      price: 24990,
      compareAtPrice: 28990,
      description: 'Lightweight everyday running shoe.',
      colors: 'Black|White',
      variants: '40:10|41:8|42:12',
      featured: 'false',
      images: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
    },
  ];
  const csv = toCsv(sample, PRODUCT_COLUMNS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.csv"');
  res.send(csv);
});

const parseVariants = (str) =>
  (str || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [size, stock] = pair.split(':');
      return { size: Number(size), stock: Number(stock || 0) };
    })
    .filter((v) => !Number.isNaN(v.size));

const parseList = (str) =>
  (str || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

// @desc   Bulk import/upsert products from a CSV file (field name: "file")
// @route  POST /api/admin/products/import
// @access Admin
export const importProducts = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Upload a CSV file (field name "file")');
  }

  const records = parseCsv(req.file.buffer.toString('utf-8'));
  if (!records.length) {
    res.status(400);
    throw new Error('The CSV has no data rows');
  }

  let created = 0;
  let updated = 0;
  const errors = [];

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    const line = i + 2; // +1 header, +1 for 1-based
    try {
      if (!r.name || !r.brand || !r.price) {
        throw new Error('name, brand and price are required');
      }
      const doc = {
        name: r.name,
        brand: r.brand,
        category: r.category || 'Unisex',
        price: Number(r.price),
        compareAtPrice: r.compareAtPrice ? Number(r.compareAtPrice) : undefined,
        description: r.description || `${r.brand} ${r.name}`,
        colors: parseList(r.colors),
        variants: parseVariants(r.variants),
        featured: String(r.featured).toLowerCase() === 'true',
        images: parseList(r.images).map((url) => ({ url })),
      };

      // Upsert by name + brand so re-imports update rather than duplicate.
      const existing = await Product.findOne({ name: doc.name, brand: doc.brand });
      if (existing) {
        Object.assign(existing, doc);
        await existing.save();
        updated += 1;
      } else {
        await Product.create(doc);
        created += 1;
      }
    } catch (err) {
      errors.push({ line, name: r.name || '(no name)', error: err.message });
    }
  }

  res.json({
    summary: { total: records.length, created, updated, failed: errors.length },
    errors,
  });
});
