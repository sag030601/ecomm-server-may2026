import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getSessions,
  revokeSessionHandler,
  getMe,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  startOAuth,
  oauthCallback,
  exchangeOAuthCode,
  getOAuthProviders,
} from '../controllers/authController';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema, updateProfileSchema, addressSchema } from '../validators/schemas';
import { authRateLimiter, strictAuthRateLimiter } from '../middleware/security';

const router = Router();

router.post('/oauth/exchange', authRateLimiter, exchangeOAuthCode);
router.get('/oauth/:provider', authRateLimiter, startOAuth);
router.get('/oauth/:provider/callback', oauthCallback);

router.post('/register', strictAuthRateLimiter, validate(registerSchema), register);
router.post('/login', strictAuthRateLimiter, validate(loginSchema), login);
router.post('/refresh', authRateLimiter, refresh);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);
router.get('/sessions', protect, getSessions);
router.delete('/sessions/:sessionId', protect, revokeSessionHandler);

router.get('/me', protect, getMe);
router.patch('/profile', protect, validate(updateProfileSchema), updateProfile);
router.post('/addresses', protect, validate(addressSchema), addAddress);
router.patch('/addresses/:addressId', protect, validate(addressSchema), updateAddress);
router.delete('/addresses/:addressId', protect, deleteAddress);

export default router;
