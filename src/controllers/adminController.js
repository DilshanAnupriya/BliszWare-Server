import asyncHandler from 'express-async-handler';
import Product from '../models/Product.js';
import Order, { ORDER_STATUSES } from '../models/Order.js';
import User from '../models/User.js';
import Promotion from '../models/Promotion.js';
import { generateLabelPdf } from '../utils/shippingLabel.js';
import { sendEmail, shipmentTemplate, orderConfirmedTemplate } from '../utils/sendEmail.js';
import { decrementStockAndAlert, restockItems } from '../utils/stock.js';

const LOW_STOCK_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────

// @desc   Dashboard summary: today's sales, pending orders, low stock
// @route  GET /api/admin/dashboard
// @access Admin
export const getDashboard = asyncHandler(async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [todaySalesAgg, totalSalesAgg, pendingOrders, totalOrders, customers, products, recentOrders, lowStock, statusBreakdown] =
    await Promise.all([
      Order.aggregate([
        { $match: { isPaid: true, paidAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { isPaid: true } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
      Order.countDocuments({ status: { $in: ['Pending', 'Processing'] } }),
      Order.countDocuments({}),
      User.countDocuments({ role: 'customer' }),
      Product.countDocuments({}),
      Order.find({}).sort({ createdAt: -1 }).limit(8).populate('user', 'name email'),
      Product.find({ isActive: true }).then((all) =>
        all
          .filter((p) => p.totalStock <= LOW_STOCK_THRESHOLD)
          .map((p) => ({ _id: p._id, name: p.name, brand: p.brand, totalStock: p.totalStock }))
      ),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

  // Last 7 days sales for the dashboard chart.
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);
  const salesTrend = await Order.aggregate([
    { $match: { isPaid: true, paidAt: { $gte: weekAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
        total: { $sum: '$totalPrice' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    todaySales: todaySalesAgg[0]?.total || 0,
    todayOrders: todaySalesAgg[0]?.count || 0,
    totalSales: totalSalesAgg[0]?.total || 0,
    pendingOrders,
    totalOrders,
    customers,
    products,
    lowStock,
    recentOrders,
    statusBreakdown,
    salesTrend,
  });
});

// ─────────────────────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────────────────────

// @desc   List all products (incl. inactive) for admin
// @route  GET /api/admin/products
// @access Admin
export const adminGetProducts = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const filter = search ? { $text: { $search: search } } : {};
  const perPage = Number(limit);
  const skip = (Number(page) - 1) * perPage;

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage),
    Product.countDocuments(filter),
  ]);
  res.json({ products, total, pages: Math.ceil(total / perPage), page: Number(page) });
});

// @desc   Create a product
// @route  POST /api/admin/products
// @access Admin
export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json({ product });
});

// @desc   Update a product
// @route  PUT /api/admin/products/:id
// @access Admin
export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  Object.assign(product, req.body);
  await product.save();
  res.json({ product });
});

// @desc   Delete a product
// @route  DELETE /api/admin/products/:id
// @access Admin
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  res.json({ message: 'Product deleted' });
});

// @desc   Update stock for a product's variants (inventory module)
// @route  PUT /api/admin/products/:id/stock
// @access Admin
export const updateStock = asyncHandler(async (req, res) => {
  const { variants } = req.body; // [{ size, stock }]
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  product.variants = variants;
  await product.save();
  res.json({ product });
});

// ─────────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────────

// @desc   List all orders with optional status filter
// @route  GET /api/admin/orders
// @access Admin
export const adminGetOrders = asyncHandler(async (req, res) => {
  const { status, search, from, to, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (search) filter.orderNumber = new RegExp(search, 'i');

  // Date / month / range filter on the order's creation time.
  // `from`/`to` are YYYY-MM-DD strings; `to` is inclusive (end of that day).
  const created = {};
  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59.999`) : null;
  if (fromDate && !Number.isNaN(+fromDate)) created.$gte = fromDate;
  if (toDate && !Number.isNaN(+toDate)) created.$lte = toDate;
  if (Object.keys(created).length) filter.createdAt = created;

  const perPage = Number(limit);
  const skip = (Number(page) - 1) * perPage;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .populate('user', 'name email'),
    Order.countDocuments(filter),
  ]);
  res.json({ orders, total, pages: Math.ceil(total / perPage), page: Number(page), statuses: ORDER_STATUSES });
});

// @desc   Update an order's status (adds a tracking event)
// @route  PUT /api/admin/orders/:id/status
// @access Admin
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!ORDER_STATUSES.includes(status)) {
    res.status(400);
    throw new Error('Invalid status');
  }
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const previous = order.status;
  order.status = status;
  order.tracking.push({ status, note: note || `Status updated to ${status}` });
  if (status === 'Delivered') {
    order.deliveredAt = new Date();
    if (order.paymentMethod === 'CashOnDelivery') {
      order.isPaid = true;
      order.paidAt = new Date();
    }
  }

  // Cancelling returns reserved items to inventory; un-cancelling into an
  // active fulfilment stage takes them back out.
  if (status === 'Cancelled' && order.stockReserved) {
    await restockItems(order.items);
    order.stockReserved = false;
  } else if (previous === 'Cancelled' && !order.stockReserved && FULFILLMENT_ACTIVE.includes(status)) {
    await decrementStockAndAlert(order.items);
    order.stockReserved = true;
  }

  await order.save();
  res.json({ order });
});

// Statuses that mean the order holds stock again if it's revived from Cancelled.
const FULFILLMENT_ACTIVE = ['Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];

// @desc   Confirm an order's payment (bank-deposit verified or WhatsApp settled)
// @route  POST /api/admin/orders/:id/confirm
// @access Admin
export const confirmOrderPayment = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const confirmable = ['Verifying Payment', 'Awaiting WhatsApp', 'Pending'];
  if (!confirmable.includes(order.status)) {
    res.status(400);
    throw new Error(`This order is already ${order.status}`);
  }

  if (!order.isPaid) {
    order.isPaid = true;
    order.paidAt = new Date();
    order.paymentResult = {
      id: req.body?.reference || `manual_${Date.now()}`,
      status: 'paid',
      method: order.paymentChannel === 'whatsapp' ? 'WhatsApp' : 'BankDeposit',
    };
  }
  order.status = 'Confirmed';
  order.tracking.push({ status: 'Confirmed', note: 'Payment confirmed by admin' });
  order.stockReserved = true;
  await order.save();

  // Reserve stock now that payment is confirmed (and alert on low stock).
  await decrementStockAndAlert(order.items);

  // Tell the customer their order is confirmed.
  const to = order.user?.email || order.guestEmail;
  if (to) {
    sendEmail({
      to,
      subject: `Your order ${order.orderNumber} is confirmed — Bliszware`,
      html: orderConfirmedTemplate(order),
    }).catch((e) => console.error('Order confirmed email error:', e.message));
  }

  res.json({ order });
});

// ─────────────────────────────────────────────────────────────
// Courier / fulfilment
// ─────────────────────────────────────────────────────────────

// @desc   Save courier details entered by the admin (third-party handover
//         is done manually — this just records who has the parcel)
// @route  PUT /api/admin/orders/:id/courier
// @access Admin
export const setOrderCourier = asyncHandler(async (req, res) => {
  const { courier, trackingNumber, trackingUrl } = req.body;
  if (!String(courier || '').trim() || !String(trackingNumber || '').trim()) {
    res.status(400);
    throw new Error('Courier company and tracking number are required');
  }
  if (trackingUrl && !/^https?:\/\//i.test(String(trackingUrl).trim())) {
    res.status(400);
    throw new Error('Tracking URL must start with http:// or https://');
  }

  const order = await Order.findById(req.params.id).populate('user', 'email name');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const isNew = !order.shipment?.trackingNumber;
  order.shipment = {
    ...order.shipment,
    courier: String(courier).trim(),
    trackingNumber: String(trackingNumber).trim(),
    trackingUrl: String(trackingUrl || '').trim() || undefined,
    assignedAt: order.shipment?.assignedAt || new Date(),
  };
  order.tracking.push({
    status: order.status,
    note: `${isNew ? 'Handed to courier' : 'Courier details updated'}: ${order.shipment.courier} · Tracking ${order.shipment.trackingNumber}`,
  });
  await order.save();

  // Tell the customer their parcel is with the courier (first time only).
  const to = order.user?.email || order.guestEmail;
  if (to && isNew) {
    sendEmail({
      to,
      subject: `Your order ${order.orderNumber} has shipped — Bliszware`,
      html: shipmentTemplate(order),
    }).catch((e) => console.error('Shipment email error:', e.message));
  }

  res.json({ order });
});

// @desc   Download a printable shipping label (PDF)
// @route  GET /api/admin/orders/:id/label
// @access Admin
export const getShippingLabel = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (!order.shipment?.trackingNumber) {
    res.status(400);
    throw new Error('Assign a courier before printing a label');
  }
  const pdf = await generateLabelPdf(order);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="label-${order.orderNumber}.pdf"`);
  res.send(pdf);
});

// ─────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────

// @desc   List customers with order counts
// @route  GET /api/admin/customers
// @access Admin
export const adminGetCustomers = asyncHandler(async (req, res) => {
  const customers = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
  const withStats = await Promise.all(
    customers.map(async (c) => {
      const agg = await Order.aggregate([
        { $match: { user: c._id, isPaid: true } },
        { $group: { _id: null, spent: { $sum: '$totalPrice' }, orders: { $sum: 1 } } },
      ]);
      return {
        _id: c._id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        createdAt: c.createdAt,
        orders: agg[0]?.orders || 0,
        spent: agg[0]?.spent || 0,
      };
    })
  );
  res.json({ customers: withStats });
});

// ─────────────────────────────────────────────────────────────
// Users (account management — super admin)
// ─────────────────────────────────────────────────────────────

const ROLES = ['customer', 'admin', 'superadmin'];

// @desc   List every account (customers, admins, super admins)
// @route  GET /api/admin/users
// @access Admin
export const adminGetUsers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = search
    ? { $or: [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }] }
    : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).lean();
  res.json({
    users: users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      provider: u.googleId ? 'google' : 'password',
      createdAt: u.createdAt,
    })),
    roles: ROLES,
  });
});

// @desc   Create a new staff account (admin or super admin)
// @route  POST /api/admin/users
// @access Super admin
export const adminCreateUser = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body;
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Name, email and password are required');
  }
  if (String(password).length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }
  if (!ROLES.includes(role)) {
    res.status(400);
    throw new Error('Invalid role');
  }

  const normalisedEmail = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalisedEmail });
  if (exists) {
    res.status(409);
    throw new Error('An account with that email already exists');
  }

  const user = await User.create({ name, email: normalisedEmail, password, role });
  res.status(201).json({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      provider: 'password',
      createdAt: user.createdAt,
    },
  });
});

// @desc   Change a user's role
// @route  PUT /api/admin/users/:id/role
// @access Super admin
export const adminUpdateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!ROLES.includes(role)) {
    res.status(400);
    throw new Error('Invalid role');
  }
  if (String(req.params.id) === String(req.user._id)) {
    res.status(400);
    throw new Error('You cannot change your own role');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Never leave the store without a super admin.
  if (user.role === 'superadmin' && role !== 'superadmin') {
    const superCount = await User.countDocuments({ role: 'superadmin' });
    if (superCount <= 1) {
      res.status(400);
      throw new Error('Cannot demote the only super admin');
    }
  }

  user.role = role;
  await user.save();
  res.json({ user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
});

// @desc   Delete a user account
// @route  DELETE /api/admin/users/:id
// @access Super admin
export const adminDeleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    res.status(400);
    throw new Error('You cannot delete your own account');
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.role === 'superadmin') {
    res.status(400);
    throw new Error('Super admin accounts cannot be deleted');
  }
  await user.deleteOne();
  res.json({ message: 'User deleted' });
});

// ─────────────────────────────────────────────────────────────
// Promotions
// ─────────────────────────────────────────────────────────────

export const adminGetPromotions = asyncHandler(async (req, res) => {
  const promotions = await Promotion.find({}).sort({ createdAt: -1 });
  res.json({ promotions });
});

export const createPromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.create(req.body);
  res.status(201).json({ promotion });
});

export const updatePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!promotion) {
    res.status(404);
    throw new Error('Promotion not found');
  }
  res.json({ promotion });
});

export const deletePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findByIdAndDelete(req.params.id);
  if (!promotion) {
    res.status(404);
    throw new Error('Promotion not found');
  }
  res.json({ message: 'Promotion deleted' });
});

// ─────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────

// @desc   Sales reports: top products & revenue by brand
// @route  GET /api/admin/reports
// @access Admin
export const getReports = asyncHandler(async (req, res) => {
  const [topProducts, revenueByBrand, monthly] = await Promise.all([
    Order.aggregate([
      { $match: { isPaid: true } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.name',
          unitsSold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([
      { $match: { isPaid: true } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.brand',
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([
      { $match: { isPaid: true } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } },
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({ topProducts, revenueByBrand, monthly });
});
