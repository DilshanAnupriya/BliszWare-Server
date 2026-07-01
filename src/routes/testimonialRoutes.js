import { Router } from 'express';
import { getTestimonials, submitTestimonial } from '../controllers/testimonialController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Public storefront testimonials.
router.get('/', getTestimonials);

// Logged-in users submit a testimonial (enters the moderation queue).
router.post('/', protect, submitTestimonial);

export default router;
