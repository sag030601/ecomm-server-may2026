import { Router } from 'express';
import multer from 'multer';
import { handleWebhook, uploadImage } from '../controllers/uploadController';
import { protect, restrictTo } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/webhook', handleWebhook);
router.post('/upload', protect, restrictTo('admin'), upload.single('image'), uploadImage);

export default router;
