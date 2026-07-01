import PDFDocument from 'pdfkit';

// Brand palette (matches the storefront).
const INK = '#0A0A0B';
const ACCENT = '#FF4D2E';
const MUTED = '#64748B';
const SLATE = '#475569';
const LIGHT = '#F4F4F5';
const LINE = '#E5E7EB';
const GREEN = '#16A34A';

const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-LK')}`;
const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * Render a polished, colourful e-invoice for an order and resolve with a PDF
 * Buffer. Used both for the email attachment and the download endpoint.
 */
export const generateInvoicePdf = (order) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width; // ~595
      const H = doc.page.height; // ~842
      const M = 50;
      const right = W - M;

      /* ── Header band ───────────────────────────────────────── */
      doc.rect(0, 0, W, 140).fill(INK);
      // accent stripe
      doc.rect(0, 140, W, 5).fill(ACCENT);

      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(28)
        .text('Bliz', M, 44, { continued: true })
        .fillColor(ACCENT)
        .text('Ware');
      doc
        .fillColor('#9CA3AF')
        .font('Helvetica')
        .fontSize(9)
        .text('Premium sneakers & shoes · Colombo, Sri Lanka', M, 80)
        .text('hello@bliszware.lk · +94 11 234 5678', M, 94);

      // Invoice meta (right aligned)
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(22)
        .text('INVOICE', right - 220, 44, { width: 220, align: 'right' });
      doc
        .fillColor('#9CA3AF')
        .font('Helvetica')
        .fontSize(10)
        .text(`No. ${order.orderNumber}`, right - 220, 76, { width: 220, align: 'right' })
        .text(fmtDate(order.createdAt), right - 220, 91, { width: 220, align: 'right' });

      // Paid / unpaid pill
      const paid = order.isPaid;
      const pillText = paid ? 'PAID' : order.paymentMethod === 'CashOnDelivery' ? 'COD' : 'UNPAID';
      const pillColor = paid ? GREEN : ACCENT;
      const pillW = 60;
      doc.roundedRect(right - pillW, 108, pillW, 18, 9).fill(pillColor);
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(pillText, right - pillW, 113, { width: pillW, align: 'center' });

      /* ── Bill to / Payment ─────────────────────────────────── */
      const a = order.shippingAddress || {};
      let y = 175;
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('BILLED & SHIPPED TO', M, y);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(a.fullName || '—', M, y + 15);
      doc.fillColor(SLATE).font('Helvetica').fontSize(10);
      const addrLines = [
        a.phone,
        [a.line1, a.line2].filter(Boolean).join(', '),
        [a.city, a.district, a.postalCode].filter(Boolean).join(', '),
        order.guestEmail,
      ].filter(Boolean);
      addrLines.forEach((line, i) => doc.text(line, M, y + 33 + i * 14, { width: 240 }));

      // Right column: payment + delivery
      const rx = right - 200;
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('PAYMENT', rx, y, { width: 200, align: 'right' });
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(order.paymentMethod, rx, y + 15, { width: 200, align: 'right' });
      doc
        .fillColor(SLATE)
        .font('Helvetica')
        .fontSize(10)
        .text(`Delivery: ${order.deliveryMethod}`, rx, y + 33, { width: 200, align: 'right' })
        .text(`Status: ${order.status}`, rx, y + 47, { width: 200, align: 'right' });

      /* ── Items table ───────────────────────────────────────── */
      // Column geometry (right edge of the table is `right - 14`).
      y = 290;
      const cols = {
        item: M + 14, // left
        size: { x: 280, w: 40 }, // centred
        qty: { x: 330, w: 40 }, // centred
        price: { x: 385, w: 65 }, // right-aligned, ends at 450
        amount: { x: 455, w: right - 14 - 455 }, // right-aligned, ends at table edge
      };
      doc.rect(M, y, W - 2 * M, 30).fill(INK);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
      doc.text('ITEM', cols.item, y + 11);
      doc.text('SIZE', cols.size.x, y + 11, { width: cols.size.w, align: 'center' });
      doc.text('QTY', cols.qty.x, y + 11, { width: cols.qty.w, align: 'center' });
      doc.text('PRICE', cols.price.x, y + 11, { width: cols.price.w, align: 'right' });
      doc.text('AMOUNT', cols.amount.x, y + 11, { width: cols.amount.w, align: 'right' });

      y += 30;
      order.items.forEach((it, i) => {
        const rowH = 30;
        if (i % 2 === 1) doc.rect(M, y, W - 2 * M, rowH).fill(LIGHT);
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(it.name, cols.item, y + 7, { width: 200 });
        if (it.brand) doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(it.brand, cols.item, y + 19, { width: 200 });
        doc.fillColor(SLATE).font('Helvetica').fontSize(10);
        doc.text(String(it.size), cols.size.x, y + 10, { width: cols.size.w, align: 'center' });
        doc.text(String(it.quantity), cols.qty.x, y + 10, { width: cols.qty.w, align: 'center' });
        doc.text(rs(it.price), cols.price.x, y + 10, { width: cols.price.w, align: 'right' });
        doc
          .fillColor(INK)
          .font('Helvetica-Bold')
          .text(rs(it.price * it.quantity), cols.amount.x, y + 10, { width: cols.amount.w, align: 'right' });
        y += rowH;
      });
      doc.moveTo(M, y).lineTo(right, y).strokeColor(LINE).lineWidth(1).stroke();

      /* ── Totals box ────────────────────────────────────────── */
      const boxW = 240;
      const boxX = right - boxW;
      let ty = y + 20;
      const totalRow = (label, value, color = SLATE, bold = false) => {
        doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
        doc.text(label, boxX, ty, { width: 120 });
        doc.text(value, boxX + 120, ty, { width: boxW - 120, align: 'right' });
        ty += 18;
      };
      totalRow('Subtotal', rs(order.itemsPrice));
      if (order.discount > 0) totalRow(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `- ${rs(order.discount)}`, GREEN);
      totalRow('Shipping', order.shippingPrice === 0 ? 'Free' : rs(order.shippingPrice));

      ty += 4;
      doc.roundedRect(boxX, ty, boxW, 34, 8).fill(ACCENT);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text('TOTAL', boxX + 14, ty + 11);
      doc.fontSize(13).text(rs(order.totalPrice), boxX + 120, ty + 10, { width: boxW - 134, align: 'right' });

      /* ── Footer ────────────────────────────────────────────── */
      doc.rect(0, H - 70, W, 70).fill(INK);
      doc.rect(0, H - 70, W, 4).fill(ACCENT);
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Thank you for shopping with Bliszware!', M, H - 52);
      doc
        .fillColor('#9CA3AF')
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          'Track your order any time at bliszware.lk/track using your order number. Returns accepted within 7 days.',
          M,
          H - 34,
          { width: W - 2 * M }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
