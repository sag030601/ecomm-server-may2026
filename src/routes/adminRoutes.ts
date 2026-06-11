import { Router } from 'express';
import { getDashboardStats, getAnalytics, getAllUsers, getUserById } from '../controllers/adminController';
import { protect, restrictTo } from '../middleware/auth';

const router = Router();

router.use(protect, restrictTo('admin'));

router.get('/dashboard', getDashboardStats);
router.get('/analytics', getAnalytics);
router.get('/customers', getAllUsers);
router.get('/customers/:id', getUserById);

export default router;
