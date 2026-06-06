import { Router } from 'express';
import { register, login, getMe, updateProfile, addAddress, updateAddress, deleteAddress } from '../controllers/authController';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema, updateProfileSchema, addressSchema } from '../validators/schemas';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.get('/me', protect, getMe);
router.patch('/profile', protect, validate(updateProfileSchema), updateProfile);
router.post('/addresses', protect, validate(addressSchema), addAddress);
router.patch('/addresses/:addressId', protect, validate(addressSchema), updateAddress);
router.delete('/addresses/:addressId', protect, deleteAddress);

export default router;
