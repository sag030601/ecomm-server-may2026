import { Response } from 'express';
import Banner from '../models/Banner';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';

export const getBanners = catchAsync(async (_req: AuthRequest, res: Response) => {
  const banners = await Banner.find({ isActive: true }).sort({ position: 1 });
  res.json({ success: true, banners });
});

export const getAllBanners = catchAsync(async (_req: AuthRequest, res: Response) => {
  const banners = await Banner.find().sort({ position: 1 });
  res.json({ success: true, banners });
});

export const createBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const banner = await Banner.create(req.body);
  res.status(201).json({ success: true, banner });
});

export const updateBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!banner) throw new AppError('Banner not found', 404);
  res.json({ success: true, banner });
});

export const deleteBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) throw new AppError('Banner not found', 404);
  res.json({ success: true, message: 'Banner deleted' });
});
