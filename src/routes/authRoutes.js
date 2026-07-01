import { Router } from 'express';
import { body } from 'express-validator';
import {
  register,
  login,
  adminLogin,
  googleLogin,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
  addAddress,
  updateAddress,
  deleteAddress,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post(
  '/register',
  validate([
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be 6+ characters'),
  ]),
  register
);

router.post(
  '/login',
  validate([
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  login
);

router.post(
  '/admin/login',
  validate([
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  adminLogin
);
router.post('/google', googleLogin);
router.post('/logout', logout);

router.post(
  '/forgot-password',
  validate([body('email').isEmail().withMessage('Valid email required')]),
  forgotPassword
);
router.post(
  '/reset-password/:token',
  validate([body('password').isLength({ min: 6 }).withMessage('Password must be 6+ characters')]),
  resetPassword
);

router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);

router.post('/addresses', protect, addAddress);
router.put('/addresses/:addressId', protect, updateAddress);
router.delete('/addresses/:addressId', protect, deleteAddress);

export default router;
