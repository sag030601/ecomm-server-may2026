import { Router } from 'express';
import {
  getProducts,
  getProduct,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getInventory,
  updateInventory,
  getAllProductsAdmin,
} from '../controllers/productController';
import { protect, restrictTo } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { productSchema } from '../validators/schemas';

const router = Router();

router.get('/', getProducts);
router.get('/admin/all', protect, restrictTo('admin'), getAllProductsAdmin);
router.get('/inventory', protect, restrictTo('admin'), getInventory);
router.patch('/:id/inventory', protect, restrictTo('admin'), updateInventory);
router.get('/:id/related', getRelatedProducts);
router.get('/:id', getProduct);
router.post('/', protect, restrictTo('admin'), validate(productSchema), createProduct);
router.patch('/:id', protect, restrictTo('admin'), updateProduct);
router.delete('/:id', protect, restrictTo('admin'), deleteProduct);

export default router;
