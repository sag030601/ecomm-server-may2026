import { Router } from 'express';
import {
  getBanners,
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../controllers/bannerController';
import { protect, restrictTo } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { bannerSchema } from '../validators/schemas';

const router = Router();

router.get('/', getBanners);
router.get('/admin/all', protect, restrictTo('admin'), getAllBanners);
router.post('/', protect, restrictTo('admin'), validate(bannerSchema), createBanner);
router.patch('/:id', protect, restrictTo('admin'), updateBanner);
router.delete('/:id', protect, restrictTo('admin'), deleteBanner);

export default router;
