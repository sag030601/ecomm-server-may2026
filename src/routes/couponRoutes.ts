import { Router } from 'express';
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} from '../controllers/couponController';
import { protect, restrictTo } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { couponSchema, validateCouponSchema } from '../validators/schemas';

const router = Router();

router.post('/validate', protect, validate(validateCouponSchema), validateCoupon);
router.get('/', protect, restrictTo('admin'), getCoupons);
router.post('/', protect, restrictTo('admin'), validate(couponSchema), createCoupon);
router.patch('/:id', protect, restrictTo('admin'), updateCoupon);
router.delete('/:id', protect, restrictTo('admin'), deleteCoupon);

export default router;
