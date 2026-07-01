import asyncHandler from 'express-async-handler';
import Order, { FULFILLMENT_STAGES, PAYMENT_METHODS } from '../models/Order.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import Promotion from '../models/Promotion.js';
import {
  sendEmail,
  orderConfirmationTemplate,
  adminNewOrderTemplate,
} from '../utils/sendEmail.js';
import { decrementStockAndAlert } from '../utils/stock.js';
import { generateInvoicePdf } from '../utils/invoice.js';

const SHIPPING = { Standard: 350, Express: 750 };
const FREE_SHIPPING_THRESHOLD = 20000;

// @desc   Validate a coupon against a subtotal
// @route  POST /api/orders/validate-coupon
// @access Public
export const validateCoupon = asyncHandler(async (req, res) => {
  const { code, subtotal = 0 } = req.body;
  const promo = await Promotion.findOne({ code: String(code).toUpperCase() });
  if (!promo) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  const check = promo.isValidFor(Number(subtotal));
  if (!check.ok) {
    res.status(400);
    throw new Error(check.reason);
  }

  const discount = promo.computeDiscount(Number(subtotal));
  res.json({ code: promo.code, discount, description: promo.description });
});

// @desc   Create a new order
// @route  POST /api/orders
// @access Public (guest checkout allowed; user attached when logged in)
export const createOrder = asyncHandler(async (req, res) => {
  const {
    items,
    shippingAddress,
    deliveryMethod = 'Standard',
    paymentMethod,
    paymentSlip,
    couponCode,
  } = req.body;

  if (!items?.length) {
    res.status(400);
    throw new Error('Your cart is empty');
  }

  // Basic input validation (the route already requires a logged-in user).
  const required = ['fullName', 'phone', 'line1', 'city'];
  if (!shippingAddress || required.some((k) => !String(shippingAddress[k] || '').trim())) {
    res.status(400);
    throw new Error('A complete delivery address is required');
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    res.status(400);
    throw new Error('Invalid payment method');
  }

  // Re-price every line against the database — never trust client prices.
  const priced = [];
  for (const line of items) {
    const product = await Product.findById(line.product || line.productId);
    if (!product || !product.isActive) {
      res.status(400);
      throw new Error(`A product in your cart is no longer available`);
    }
    const variant = product.variants.find((v) => v.size === Number(line.size));
    if (!variant || variant.stock < line.quantity) {
      res.status(400);
      throw new Error(`${product.name} (size ${line.size}) is out of stock`);
    }
    priced.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0]?.url,
      brand: product.brand,
      price: product.price,
      size: Number(line.size),
      quantity: Number(line.quantity),
    });
  }

  const itemsPrice = priced.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Discount
  let discount = 0;
  let appliedCode;
  if (couponCode) {
    const promo = await Promotion.findOne({ code: String(couponCode).toUpperCase() });
    if (promo && promo.isValidFor(itemsPrice).ok) {
      discount = promo.computeDiscount(itemsPrice);
      appliedCode = promo.code;
      promo.usedCount += 1;
      await promo.save();
    }
  }

  // Shipping (free over threshold)
  const shippingPrice =
    itemsPrice >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING[deliveryMethod] ?? SHIPPING.Standard;

  const totalPrice = Math.max(0, itemsPrice - discount) + shippingPrice;

  // Decide the initial status from the chosen payment method:
  //  • Bank Deposit     → customer uploads a slip → we verify it (Verifying Payment).
  //  • Cash on Delivery → accepted immediately, paid on delivery (Confirmed).
  //  • WhatsApp         → arranged over WhatsApp (Awaiting WhatsApp).
  // Stock is reserved now for COD; for the others it's reserved when an admin confirms.
  let status = 'Pending';
  let channel = 'gateway';
  let slip;
  let reserveStockNow = false;
  if (paymentMethod === 'BankDeposit') {
    channel = 'bank';
    if (!paymentSlip) {
      res.status(400);
      throw new Error('Please upload your bank deposit slip');
    }
    slip = paymentSlip;
    status = 'Verifying Payment';
  } else if (paymentMethod === 'WhatsApp') {
    channel = 'whatsapp';
    status = 'Awaiting WhatsApp';
  } else if (paymentMethod === 'CashOnDelivery') {
    channel = 'cod';
    status = 'Confirmed';
    reserveStockNow = true;
  }

  const order = await Order.create({
    user: req.user._id,
    items: priced,
    shippingAddress,
    deliveryMethod,
    paymentMethod,
    paymentChannel: channel,
    paymentSlip: slip,
    itemsPrice,
    shippingPrice,
    discount,
    couponCode: appliedCode,
    totalPrice,
    status,
  });

  // Cash on Delivery is a committed order — reserve stock immediately.
  if (reserveStockNow) {
    await decrementStockAndAlert(priced);
  }

  // Clear the server-side cart.
  await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });

  // Fire-and-forget emails: confirmation (with PDF invoice) to the customer,
  // alert to the owner. PDF generation is wrapped so a failure can't block the
  // order response.
  const customerEmail = req.user.email;
  if (customerEmail) {
    generateInvoicePdf(order)
      .then((pdf) =>
        sendEmail({
          to: customerEmail,
          subject: `Order ${order.orderNumber} confirmed — Bliszware`,
          html: orderConfirmationTemplate(order),
          attachments: [
            { filename: `invoice-${order.orderNumber}.pdf`, content: pdf, contentType: 'application/pdf' },
          ],
        })
      )
      .catch((e) => console.error('Customer email error:', e.message));
  }
  if (process.env.ADMIN_EMAIL) {
    sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `🛎️ New order ${order.orderNumber} — Rs ${order.totalPrice.toLocaleString()}`,
      html: adminNewOrderTemplate(order),
    }).catch((e) => console.error('Owner email error:', e.message));
  }

  res.status(201).json({ order });
});

// @desc   Get the logged-in user's orders
// @route  GET /api/orders/my
// @access Private
export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ orders });
});

// @desc   Get a single order (owner or admin)
// @route  GET /api/orders/:id
// @access Private
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  // Only the order's owner or a staff member (admin/super admin) may view it.
  const isOwner = order.user && order.user._id.equals(req.user._id);
  const isStaff = ['admin', 'superadmin'].includes(req.user.role);
  if (!isOwner && !isStaff) {
    res.status(403);
    throw new Error('Not authorised to view this order');
  }
  res.json({ order });
});

// @desc   Download an order's invoice as a PDF
// @route  GET /api/orders/:id/invoice
// @access Private (owner/admin) or public for guest orders — same as getOrderById
export const getInvoice = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  const isOwner = order.user && order.user.equals(req.user._id);
  const isStaff = ['admin', 'superadmin'].includes(req.user.role);
  if (!isOwner && !isStaff) {
    res.status(403);
    throw new Error('Not authorised to view this invoice');
  }

  const pdf = await generateInvoicePdf(order);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.pdf"`);
  res.send(pdf);
});

// @desc   Public order tracking by order number (no login required)
// @route  GET /api/orders/track/:orderNumber
// @access Public
export const trackOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    orderNumber: req.params.orderNumber.toUpperCase(),
  }).select('orderNumber status tracking items totalPrice deliveryMethod shipment createdAt deliveredAt shippingAddress.city shippingAddress.fullName');

  if (!order) {
    res.status(404);
    throw new Error('No order found with that ID');
  }

  res.json({
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      tracking: order.tracking,
      stages: FULFILLMENT_STAGES,
      items: order.items,
      totalPrice: order.totalPrice,
      deliveryMethod: order.deliveryMethod,
      shipment: order.shipment?.trackingNumber
        ? {
            courier: order.shipment.courier,
            trackingNumber: order.shipment.trackingNumber,
            estimatedDelivery: order.shipment.estimatedDelivery,
          }
        : null,
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt,
      customerName: order.shippingAddress?.fullName,
      city: order.shippingAddress?.city,
    },
  });
});
