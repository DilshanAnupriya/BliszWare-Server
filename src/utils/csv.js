/** Minimal, dependency-free CSV helpers (RFC-4180-ish: quotes + escapes). */

/** Quote a single field if it contains a comma, quote or newline. */
const escapeField = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/**
 * Serialise an array of objects to CSV text.
 * @param {object[]} rows
 * @param {string[]} columns  ordered list of keys to emit
 */
export const toCsv = (rows, columns) => {
  const header = columns.map(escapeField).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeField(row[c])).join(','))
    .join('\n');
  return `${header}\n${body}`;
};

/**
 * Parse CSV text into an array of row objects keyed by the header row.
 * Handles quoted fields, escaped quotes ("") and CRLF/LF line endings.
 */
export const parseCsv = (text) => {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n') {
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // flush last field/record
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== '')) // skip blank lines
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h] = (r[idx] ?? '').trim();
      });
      return obj;
    });
};
