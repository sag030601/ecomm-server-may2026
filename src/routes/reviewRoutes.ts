import { Router } from 'express';
import {
  getProductReviews,
  createReview,
  getAllReviews,
  updateReviewStatus,
  deleteReview,
} from '../controllers/reviewController';
import { protect, restrictTo } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { reviewSchema } from '../validators/schemas';

const router = Router();

router.get('/product/:productId', getProductReviews);
router.post('/', protect, validate(reviewSchema), createReview);
router.get('/admin/all', protect, restrictTo('admin'), getAllReviews);
router.patch('/:id/status', protect, restrictTo('admin'), updateReviewStatus);
router.delete('/:id', protect, restrictTo('admin'), deleteReview);

export default router;
