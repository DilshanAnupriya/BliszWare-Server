import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    image: { type: String },
    brand: { type: String },
    price: { type: Number, required: true },
    size: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    district: { type: String },
    postalCode: { type: String },
  },
  { _id: false }
);

/** A single entry in the order's status timeline (powers the tracking page). */
const trackingEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const ORDER_STATUSES = [
  'Verifying Payment', // bank-deposit slip uploaded, awaiting admin approval
  'Awaiting WhatsApp', // customer chose to arrange payment over WhatsApp
  'Pending', // legacy / online gateway awaiting payment
  'Confirmed', // payment approved — order accepted
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
];

// The linear fulfilment timeline shown to customers (excludes pre-payment states).
export const FULFILLMENT_STAGES = ['Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];

export const PAYMENT_METHODS = ['PayHere', 'Genie', 'iPay', 'CashOnDelivery', 'BankDeposit', 'WhatsApp'];

// How the order was placed / will be settled.
export const PAYMENT_CHANNELS = ['bank', 'cod', 'whatsapp', 'gateway'];

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional: guest checkout allowed
    guestEmail: { type: String },
    items: { type: [orderItemSchema], required: true },
    shippingAddress: { type: shippingAddressSchema, required: true },

    deliveryMethod: {
      type: String,
      enum: ['Standard', 'Express'],
      default: 'Standard',
    },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentChannel: { type: String, enum: PAYMENT_CHANNELS, default: 'gateway' },
    paymentSlip: { type: String }, // URL of the uploaded bank-deposit slip

    itemsPrice: { type: Number, required: true, default: 0 },
    shippingPrice: { type: Number, required: true, default: 0 },
    discount: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true, default: 0 },

    couponCode: { type: String },

    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date },
    paymentResult: {
      id: String,
      status: String,
      method: String,
      raw: Object,
    },

    status: { type: String, enum: ORDER_STATUSES, default: 'Pending', index: true },
    tracking: { type: [trackingEventSchema], default: [] },

    // Courier shipment — entered manually by the admin when handing the
    // parcel to a third-party courier company.
    shipment: {
      courier: { type: String }, // courier company name, e.g. "Koombiyo"
      trackingNumber: { type: String },
      trackingUrl: { type: String }, // courier's own tracking page (optional)
      status: { type: String },
      assignedAt: { type: Date },
      estimatedDelivery: { type: Date },
    },

    // True while this order holds reserved stock (set on confirm/COD,
    // cleared when a cancellation returns the items to inventory).
    stockReserved: { type: Boolean, default: false },

    deliveredAt: { type: Date },
  },
  { timestamps: true }
);

// Generate a friendly order number like SHOE-7F3K9A on first save.
orderSchema.pre('save', function setOrderNumber(next) {
  if (!this.orderNumber) {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.orderNumber = `SHOE-${rand}`;
  }
  if (this.tracking.length === 0) {
    this.tracking.push({ status: this.status, note: 'Order placed' });
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);
export default Order;
