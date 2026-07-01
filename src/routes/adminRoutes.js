import { Router } from 'express';
import {
  getDashboard,
  adminGetProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  adminGetOrders,
  updateOrderStatus,
  confirmOrderPayment,
  getCouriers,
  shipOrder,
  getShippingLabel,
  adminGetCustomers,
  adminGetUsers,
  adminCreateUser,
  adminUpdateUserRole,
  adminDeleteUser,
  adminGetPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  getReports,
} from '../controllers/adminController.js';
import {
  adminGetTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
} from '../controllers/testimonialController.js';
import { exportCsv, importTemplate, importProducts } from '../controllers/csvController.js';
import { protect, admin, superAdmin } from '../middleware/auth.js';
import { uploadCsv } from '../middleware/upload.js';

const router = Router();

// Every admin route is gated behind auth + admin role.
router.use(protect, admin);

router.get('/dashboard', getDashboard);
router.get('/reports', getReports);

// CSV export + bulk import
router.get('/export/:type', exportCsv);
router.get('/products/import-template', importTemplate);
router.post('/products/import', uploadCsv.single('file'), importProducts);

// Products
router.get('/products', adminGetProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);
router.put('/products/:id/stock', updateStock);

// Orders
router.get('/orders', adminGetOrders);
router.put('/orders/:id/status', updateOrderStatus);
router.post('/orders/:id/confirm', confirmOrderPayment);

// Courier / fulfilment
router.get('/couriers', getCouriers);
router.post('/orders/:id/ship', shipOrder);
router.get('/orders/:id/label', getShippingLabel);

// Customers
router.get('/customers', adminGetCustomers);

// Users / account management (listing is admin; mutations are super-admin only)
router.get('/users', adminGetUsers);
router.post('/users', superAdmin, adminCreateUser);
router.put('/users/:id/role', superAdmin, adminUpdateUserRole);
router.delete('/users/:id', superAdmin, adminDeleteUser);

// Testimonials
router.get('/testimonials', adminGetTestimonials);
router.post('/testimonials', createTestimonial);
router.put('/testimonials/:id', updateTestimonial);
router.delete('/testimonials/:id', deleteTestimonial);

// Promotions
router.get('/promotions', adminGetPromotions);
router.post('/promotions', createPromotion);
router.put('/promotions/:id', updatePromotion);
router.delete('/promotions/:id', deletePromotion);

export default router;
