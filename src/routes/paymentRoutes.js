import { Router } from 'express';
import {
  initiatePayHere,
  payhereNotify,
  confirmAlternativePayment,
} from '../controllers/paymentController.js';

const router = Router();

router.post('/payhere/initiate', initiatePayHere);
router.post('/payhere/notify', payhereNotify); // PayHere webhook (server-to-server)
router.post('/confirm', confirmAlternativePayment); // Genie / iPay demo confirmation

export default router;
