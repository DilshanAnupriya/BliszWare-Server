/**
 * Defence-in-depth against NoSQL/operator injection.
 *
 * Recursively strips any object keys that start with `$` (Mongo operators like
 * $ne, $gt, $where) or contain a `.` (dotted-path injection) from req.body,
 * req.query and req.params. Legitimate clients never send such keys.
 */
const FORBIDDEN_KEY = /^\$|\./;

function scrub(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(scrub);
    return;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      delete value[key];
      continue;
    }
    scrub(value[key]);
  }
}

export const mongoSanitize = (req, res, next) => {
  scrub(req.body);
  scrub(req.query);
  scrub(req.params);
  next();
};

export default mongoSanitize;
