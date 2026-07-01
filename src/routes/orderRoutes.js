import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  getInvoice,
  trackOrder,
  validateCoupon,
} from '../controllers/orderController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Public
router.post('/validate-coupon', validateCoupon);
router.get('/track/:orderNumber', trackOrder);

// Orders require a logged-in account.
router.post('/', protect, createOrder);

// Private
router.get('/my', protect, getMyOrders);
router.get('/:id/invoice', protect, getInvoice);
router.get('/:id', protect, getOrderById);

export default router;
