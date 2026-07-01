import { Router } from 'express';
import {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  mergeCart,
} from '../controllers/cartController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// All cart routes require a logged-in user. Guests use a localStorage cart
// on the client, which is merged in via /merge on login.
router.use(protect);

router.get('/', getCart);
router.delete('/', clearCart);
router.post('/items', addItem);
router.put('/items/:itemId', updateItem);
router.delete('/items/:itemId', removeItem);
router.post('/merge', mergeCart);

export default router;
