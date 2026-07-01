import PDFDocument from 'pdfkit';

const INK = '#0A0A0B';
const ACCENT = '#FF4D2E';
const MUTED = '#64748B';

/** A faux 1D barcode drawn from the tracking string (visual only). */
const drawBarcode = (doc, text, x, y, w, h) => {
  let cx = x;
  const seed = (text || '').split('').map((c) => c.charCodeAt(0));
  let i = 0;
  while (cx < x + w) {
    const bw = 1 + (seed[i % seed.length] % 4); // 1–4pt bars
    if (i % 2 === 0) doc.rect(cx, y, bw, h).fill(INK);
    cx += bw;
    i += 1;
  }
};

/**
 * Render a compact, printable shipping label (A6-ish on an A4 page) with the
 * courier, tracking number, and to/from addresses.
 */
export const generateLabelPdf = (order) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const M = 40;
      const W = doc.page.width;
      const labelW = W - 2 * M;
      const top = 40;
      const labelH = 360;
      const ship = order.shipment || {};
      const a = order.shippingAddress || {};

      // Card border
      doc.roundedRect(M, top, labelW, labelH, 10).lineWidth(1.5).strokeColor(INK).stroke();

      // Header strip
      doc.rect(M, top, labelW, 50).fill(INK);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('Bliz', M + 16, top + 16, { continued: true }).fillColor(ACCENT).text('Ware');
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text((ship.courier || 'Courier').toUpperCase(), M, top + 18, { width: labelW - 16, align: 'right' });

      // From
      let y = top + 66;
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('FROM', M + 16, y);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text('Bliszware Fulfilment', M + 16, y + 11);
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('24 Galle Road, Colombo 03 · +94 11 234 5678', M + 16, y + 24);

      // Divider
      y += 46;
      doc.moveTo(M + 16, y).lineTo(M + labelW - 16, y).strokeColor('#E5E7EB').lineWidth(1).stroke();

      // To
      y += 12;
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8).text('DELIVER TO', M + 16, y);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(a.fullName || '—', M + 16, y + 12);
      doc.fillColor('#334155').font('Helvetica').fontSize(11);
      const lines = [
        a.phone,
        [a.line1, a.line2].filter(Boolean).join(', '),
        [a.city, a.district, a.postalCode].filter(Boolean).join(', '),
      ].filter(Boolean);
      lines.forEach((l, i) => doc.text(l, M + 16, y + 32 + i * 15, { width: labelW - 32 }));

      // Order + payment chips
      y += 96;
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text(`Order: ${order.orderNumber}`, M + 16, y, { continued: true })
        .text(`     Method: ${order.deliveryMethod}`, { continued: true })
        .text(`     ${order.paymentMethod}${order.isPaid ? ' (PAID)' : order.paymentMethod === 'CashOnDelivery' ? ` — COLLECT Rs ${order.totalPrice.toLocaleString()}` : ' (UNPAID)'}`);

      // Barcode + tracking
      const by = top + labelH - 70;
      drawBarcode(doc, ship.trackingNumber || order.orderNumber, M + 16, by, labelW - 32, 36);
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(ship.trackingNumber || order.orderNumber, M, by + 42, { width: labelW, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
