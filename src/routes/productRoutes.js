import { Router } from 'express';
import {
  getProducts,
  getFilters,
  getFeatured,
  getProduct,
  addReview,
} from '../controllers/productController.js';
import { protect, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', getProducts);
router.get('/filters', getFilters);
router.get('/featured', getFeatured);
router.get('/:idOrSlug', optionalAuth, getProduct);
router.post('/:id/reviews', protect, addReview);

export default router;
