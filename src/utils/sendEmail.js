import nodemailer from 'nodemailer';

/**
 * Send an email. When SMTP credentials are not configured (typical in local
 * development) the message is logged to the console instead of being sent,
 * so the rest of the order flow keeps working.
 */
export const sendEmail = async ({ to, subject, html, text, attachments }) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('\n📧 [email skipped — SMTP not fully configured]');
    console.log(`   To:      ${to}`);
    console.log(`   Subject: ${subject}`);
    if (attachments?.length) {
      console.log(`   Attach:  ${attachments.map((a) => a.filename).join(', ')}`);
    }
    console.log(`   Body:    ${text || html?.replace(/<[^>]+>/g, ' ').trim()}\n`);
    return { skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter.sendMail({
    from: EMAIL_FROM || 'Bliszware <no-reply@bliszware.lk>',
    to,
    subject,
    text,
    html,
    attachments,
  });
};

/** Build the HTML body for the customer's order confirmation email. */
export const orderConfirmationTemplate = (order) => {
  const rows = order.items
    .map(
      (i) => `
        <tr>
          <td style="padding:8px 0;color:#334155">${i.name} ${i.size ? `(Size ${i.size})` : ''} × ${i.quantity}</td>
          <td style="padding:8px 0;text-align:right;color:#0f172a">Rs ${(i.price * i.quantity).toLocaleString()}</td>
        </tr>`
    )
    .join('');

  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#0f172a">Thanks for your order! 👟</h2>
    <p style="color:#475569">Hi ${order.shippingAddress?.fullName || 'there'}, we've received your order.</p>
    <p style="color:#475569">Order ID: <strong>${order.orderNumber}</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}
      <tr><td style="padding-top:12px;border-top:1px solid #e2e8f0;color:#0f172a"><strong>Total</strong></td>
      <td style="padding-top:12px;border-top:1px solid #e2e8f0;text-align:right;color:#0f172a"><strong>Rs ${order.totalPrice.toLocaleString()}</strong></td></tr>
    </table>
    <p style="color:#475569">Track your order any time with your Order ID on our tracking page.</p>
    <p style="color:#94a3b8;font-size:13px">Bliszware · Colombo, Sri Lanka</p>
  </div>`;
};

/** Build the HTML body for the shop owner's "new order" alert. */
export const adminNewOrderTemplate = (order) => {
  const rows = order.items
    .map(
      (i) => `
        <tr>
          <td style="padding:6px 0;color:#334155">${i.name} ${i.size ? `(Size ${i.size})` : ''} × ${i.quantity}</td>
          <td style="padding:6px 0;text-align:right;color:#0f172a">Rs ${(i.price * i.quantity).toLocaleString()}</td>
        </tr>`
    )
    .join('');
  const a = order.shippingAddress || {};

  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#0f172a">🛎️ New order received</h2>
    <p style="color:#475569">Order <strong>${order.orderNumber}</strong> · ${order.paymentMethod} · ${order.isPaid ? 'PAID' : 'UNPAID'}</p>
    <table style="width:100%;border-collapse:collapse;margin:14px 0">${rows}
      <tr><td style="padding-top:10px;border-top:1px solid #e2e8f0;color:#0f172a"><strong>Total</strong></td>
      <td style="padding-top:10px;border-top:1px solid #e2e8f0;text-align:right;color:#0f172a"><strong>Rs ${order.totalPrice.toLocaleString()}</strong></td></tr>
    </table>
    <p style="color:#475569;font-size:14px">
      <strong>Deliver to:</strong><br/>
      ${a.fullName || ''} · ${a.phone || ''}<br/>
      ${a.line1 || ''}${a.line2 ? `, ${a.line2}` : ''}, ${a.city || ''} ${a.district || ''}<br/>
      Method: ${order.deliveryMethod}
    </p>
    <p style="color:#94a3b8;font-size:13px">Open the admin panel to process this order.</p>
  </div>`;
};

/** Build the HTML body for the "your order has shipped" email. */
export const shipmentTemplate = (order) => {
  const s = order.shipment || {};
  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#0f172a">Your order is on its way! 🚚</h2>
    <p style="color:#475569">Hi ${order.shippingAddress?.fullName || 'there'}, order
      <strong>${order.orderNumber}</strong> has been handed to our courier.</p>
    <table style="width:100%;border-collapse:collapse;margin:14px 0">
      <tr><td style="padding:6px 0;color:#64748b">Courier</td>
        <td style="padding:6px 0;text-align:right;color:#0f172a"><strong>${s.courier || '—'}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Tracking number</td>
        <td style="padding:6px 0;text-align:right;color:#0f172a"><strong>${s.trackingNumber || '—'}</strong></td></tr>
      ${
        s.estimatedDelivery
          ? `<tr><td style="padding:6px 0;color:#64748b">Estimated delivery</td>
        <td style="padding:6px 0;text-align:right;color:#0f172a">${new Date(s.estimatedDelivery).toLocaleDateString()}</td></tr>`
          : ''
      }
    </table>
    <p style="color:#475569">Follow your delivery on our tracking page using your order number.</p>
    <p style="color:#94a3b8;font-size:13px">Bliszware · Colombo, Sri Lanka</p>
  </div>`;
};

/** Build the HTML body for the low-stock alert to the shop owner. */
export const lowStockTemplate = (products) => {
  const rows = products
    .map(
      (p) => `
        <tr>
          <td style="padding:6px 0;color:#334155">${p.name} <span style="color:#94a3b8">(${p.brand})</span></td>
          <td style="padding:6px 0;text-align:right;color:#b45309;font-weight:600">${p.totalStock} left</td>
        </tr>`
    )
    .join('');

  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#b45309">⚠️ Low stock alert</h2>
    <p style="color:#475569">The following product(s) have fallen to or below your low-stock threshold:</p>
    <table style="width:100%;border-collapse:collapse;margin:14px 0">${rows}</table>
    <p style="color:#94a3b8;font-size:13px">Restock these soon from the Inventory module.</p>
  </div>`;
};

/** Build the HTML body for the "your order is confirmed" email (after payment approval). */
export const orderConfirmedTemplate = (order) => `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#0f172a">Your order is confirmed! 🎉</h2>
    <p style="color:#475569">Hi ${order.shippingAddress?.fullName || 'there'}, we've verified your
      payment for order <strong>${order.orderNumber}</strong> — thank you!</p>
    <p style="color:#475569">We're now preparing your items for dispatch and you'll get another
      update when they ship.</p>
    <table style="width:100%;border-collapse:collapse;margin:14px 0">
      <tr><td style="padding:6px 0;color:#64748b">Order total</td>
        <td style="padding:6px 0;text-align:right;color:#0f172a"><strong>Rs ${order.totalPrice.toLocaleString()}</strong></td></tr>
    </table>
    <p style="color:#475569">Track your order any time with your Order ID on our tracking page.</p>
    <p style="color:#94a3b8;font-size:13px">Bliszware · Colombo, Sri Lanka</p>
  </div>`;

/** Build the HTML body for a password-reset email. */
export const passwordResetTemplate = (name, resetUrl) => `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#0f172a">Reset your password</h2>
    <p style="color:#475569">Hi ${name || 'there'}, we received a request to reset your Bliszware password.</p>
    <p style="margin:24px 0">
      <a href="${resetUrl}" style="background:#FF4D2E;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9999px;font-weight:600;display:inline-block">Reset password</a>
    </p>
    <p style="color:#475569;font-size:14px">Or paste this link into your browser:<br/>
      <a href="${resetUrl}" style="color:#FF4D2E;word-break:break-all">${resetUrl}</a></p>
    <p style="color:#64748b;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
    <p style="color:#94a3b8;font-size:13px">Bliszware · Colombo, Sri Lanka</p>
  </div>`;

export default sendEmail;
