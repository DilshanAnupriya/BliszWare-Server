/**
 * Courier integration layer.
 *
 * Each Sri Lankan courier (Koombiyo, Domex, Pronto) exposes its own API. To
 * keep the app usable without credentials, every provider falls back to a
 * "demo" shipment (a generated tracking number) when its API key isn't set —
 * the same graceful-degradation pattern used for PayHere. Wire the real API
 * calls inside each adapter's `create()` when you have an account.
 */

const code = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const demoShipment = (order, courier, prefix) => ({
  courier,
  trackingNumber: code(prefix),
  status: 'Picked up',
  assignedAt: new Date(),
  estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // +3 days
  demo: true,
});

export const COURIERS = {
  Koombiyo: {
    label: 'Koombiyo Delivery',
    envKey: 'KOOMBIYO_API_KEY',
    prefix: 'KMB',
    async create(order) {
      // TODO: POST to https://application.koombiyodelivery.lk/api/Addorders/users
      // with process.env.KOOMBIYO_API_KEY when configured.
      return demoShipment(order, 'Koombiyo', this.prefix);
    },
  },
  Domex: {
    label: 'Domex',
    envKey: 'DOMEX_API_KEY',
    prefix: 'DMX',
    async create(order) {
      return demoShipment(order, 'Domex', this.prefix);
    },
  },
  Pronto: {
    label: 'Pronto Lanka',
    envKey: 'PRONTO_API_KEY',
    prefix: 'PRN',
    async create(order) {
      return demoShipment(order, 'Pronto', this.prefix);
    },
  },
  Manual: {
    label: 'Manual / In-house',
    envKey: null,
    prefix: 'SM',
    async create(order) {
      return demoShipment(order, 'Manual', this.prefix);
    },
  },
};

/** List couriers for the admin UI, flagging which are live (API key present). */
export const listCouriers = () =>
  Object.entries(COURIERS).map(([key, c]) => ({
    key,
    label: c.label,
    live: c.envKey ? Boolean(process.env[c.envKey]) : true,
  }));

/** Create a shipment with the chosen courier (falls back to demo if no key). */
export const createShipment = async (order, courierKey = 'Manual') => {
  const provider = COURIERS[courierKey] || COURIERS.Manual;
  return provider.create(order);
};
