import crypto from 'crypto';

/** MD5 helper, upper-cased — PayHere expects upper-case hex digests. */
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex').toUpperCase();

/**
 * Generate the `hash` value PayHere requires on the checkout form.
 * hash = md5( merchant_id + order_id + amount + currency + md5(secret) )
 * Amount must be formatted to exactly two decimals.
 */
export const generateCheckoutHash = ({ merchantId, orderId, amount, currency, secret }) => {
  const formattedAmount = Number(amount).toFixed(2);
  const hashedSecret = md5(secret);
  return md5(`${merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`);
};

/**
 * Verify the server-to-server notification PayHere posts after a payment.
 * Returns true when the local signature matches `md5sig` from PayHere.
 */
export const verifyNotification = ({
  merchantId,
  orderId,
  amount,
  currency,
  statusCode,
  md5sig,
  secret,
}) => {
  const hashedSecret = md5(secret);
  const local = md5(
    `${merchantId}${orderId}${amount}${currency}${statusCode}${hashedSecret}`
  );
  return local === String(md5sig).toUpperCase();
};

/** Map PayHere numeric status codes to a human-readable payment status. */
export const payhereStatus = (statusCode) => {
  switch (String(statusCode)) {
    case '2':
      return 'paid';
    case '0':
      return 'pending';
    case '-1':
      return 'cancelled';
    case '-2':
      return 'failed';
    case '-3':
      return 'chargedback';
    default:
      return 'unknown';
  }
};
