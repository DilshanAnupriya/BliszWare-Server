import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import {
  generateCheckoutHash,
  verifyNotification,
  payhereStatus,
} from '../utils/payhere.js';
import { decrementStockAndAlert } from '../utils/stock.js';

const PAYHERE_CHECKOUT_URL = {
  sandbox: 'https://sandbox.payhere.lk/pay/checkout',
  live: 'https://www.payhere.lk/pay/checkout',
};

// @desc   Build the PayHere checkout payload for an order
// @route  POST /api/payments/payhere/initiate
// @access Public (order owner)
export const initiatePayHere = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (order.isPaid) {
    res.status(400);
    throw new Error('Order is already paid');
  }

  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  if (!merchantId || !merchantSecret) {
    res.status(503);
    throw new Error('PayHere is not configured on the server');
  }

  const currency = 'LKR';
  const hash = generateCheckoutHash({
    merchantId,
    orderId: order.orderNumber,
    amount: order.totalPrice,
    currency,
    secret: merchantSecret,
  });

  const addr = order.shippingAddress;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  // The frontend posts these fields to `checkoutUrl` to redirect to PayHere.
  res.json({
    checkoutUrl: PAYHERE_CHECKOUT_URL[process.env.PAYHERE_MODE] || PAYHERE_CHECKOUT_URL.sandbox,
    fields: {
      merchant_id: merchantId,
      return_url: `${clientUrl}/order-confirmation/${order._id}`,
      cancel_url: `${clientUrl}/payment?order=${order._id}&cancelled=1`,
      notify_url: process.env.PAYHERE_NOTIFY_URL,
      order_id: order.orderNumber,
      items: order.items.map((i) => i.name).join(', ').slice(0, 100),
      currency,
      amount: Number(order.totalPrice).toFixed(2),
      first_name: addr.fullName?.split(' ')[0] || 'Customer',
      last_name: addr.fullName?.split(' ').slice(1).join(' ') || '',
      email: order.guestEmail || 'customer@bliszware.lk',
      phone: addr.phone,
      address: addr.line1,
      city: addr.city,
      country: 'Sri Lanka',
      hash,
    },
  });
});

// @desc   PayHere server-to-server payment notification (webhook)
// @route  POST /api/payments/payhere/notify
// @access Public (verified via md5sig)
export const payhereNotify = asyncHandler(async (req, res) => {
  const {
    merchant_id,
    order_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
    payment_id,
  } = req.body;

  const valid = verifyNotification({
    merchantId: merchant_id,
    orderId: order_id,
    amount: payhere_amount,
    currency: payhere_currency,
    statusCode: status_code,
    md5sig,
    secret: process.env.PAYHERE_MERCHANT_SECRET,
  });

  if (!valid) {
    console.warn('⚠ PayHere notification failed signature check', order_id);
    return res.status(400).send('invalid signature');
  }

  const order = await Order.findOne({ orderNumber: order_id });
  if (!order) return res.status(404).send('order not found');

  const status = payhereStatus(status_code);
  order.paymentResult = {
    id: payment_id,
    status,
    method: 'PayHere',
    raw: req.body,
  };

  if (status === 'paid' && !order.isPaid) {
    order.isPaid = true;
    order.paidAt = new Date();
    if (order.status === 'Pending') {
      order.status = 'Processing';
      order.tracking.push({ status: 'Processing', note: 'Payment received' });
    }
    // Reserve stock now that payment is confirmed (and alert on low stock).
    await decrementStockAndAlert(order.items);
  }

  await order.save();
  res.status(200).send('OK'); // PayHere expects a 200
});

// @desc   Mark an order paid for wallet/bank gateways (Genie, iPay) — demo flow.
//         Also accepts PayHere as a fallback when gateway creds aren't set,
//         so the storefront demo can complete an order end-to-end.
// @route  POST /api/payments/confirm
// @access Public (order owner)
// In production these would each have their own verified callback like PayHere.
export const confirmAlternativePayment = asyncHandler(async (req, res) => {
  // SECURITY: this endpoint marks an order paid WITHOUT a verified gateway
  // callback, so it must never be reachable in production unless explicitly
  // enabled. In production, wire each gateway's real verified webhook instead.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_PAYMENTS !== 'true') {
    res.status(403);
    throw new Error('Demo payment confirmation is disabled in production');
  }

  const { orderId, method, reference } = req.body;
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (!['Genie', 'iPay', 'PayHere'].includes(method)) {
    res.status(400);
    throw new Error('Unsupported payment method for this endpoint');
  }

  if (!order.isPaid) {
    order.isPaid = true;
    order.paidAt = new Date();
    order.paymentResult = { id: reference || `ref_${Date.now()}`, status: 'paid', method };
    order.status = 'Processing';
    order.tracking.push({ status: 'Processing', note: `${method} payment received` });
    await decrementStockAndAlert(order.items);
    await order.save();
  }

  res.json({ order });
});
