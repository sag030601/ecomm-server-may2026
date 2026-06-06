import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
  confirmStripePayment,
} from '../controllers/orderController';
import { protect, restrictTo } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { orderSchema } from '../validators/schemas';

const router = Router();

router.post('/', protect, validate(orderSchema), createOrder);
router.get('/my', protect, getMyOrders);
router.get('/admin/all', protect, restrictTo('admin'), getAllOrders);
router.get('/:id', protect, getOrder);
router.patch('/:id/status', protect, restrictTo('admin'), updateOrderStatus);
router.post('/:id/confirm-payment', protect, confirmStripePayment);

export default router;
