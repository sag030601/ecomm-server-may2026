import { Router } from 'express';
import {
  getCategories,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController';
import { protect, restrictTo } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { categorySchema } from '../validators/schemas';

const router = Router();

router.get('/', getCategories);
router.get('/admin/all', protect, restrictTo('admin'), getAllCategories);
router.post('/', protect, restrictTo('admin'), validate(categorySchema), createCategory);
router.patch('/:id', protect, restrictTo('admin'), updateCategory);
router.delete('/:id', protect, restrictTo('admin'), deleteCategory);

export default router;
