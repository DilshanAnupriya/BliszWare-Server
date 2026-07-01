import { Router } from 'express';
import { uploadImages, uploadSlip, removeImage } from '../controllers/uploadController.js';
import { protect, admin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.post('/', protect, admin, upload.array('images', 6), uploadImages);
// Customers upload a bank-deposit slip for their order.
router.post('/slip', protect, upload.single('file'), uploadSlip);
router.delete('/:publicId', protect, admin, removeImage);

export default router;
