import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { toApiResponse } from '../utils/serialize';

export const getBanners = catchAsync(async (_req: AuthRequest, res: Response) => {
  const banners = await prisma.banner.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
  });
  res.json({ success: true, banners: toApiResponse(banners) });
});

export const getAllBanners = catchAsync(async (_req: AuthRequest, res: Response) => {
  const banners = await prisma.banner.findMany({ orderBy: { position: 'asc' } });
  res.json({ success: true, banners: toApiResponse(banners) });
});

export const createBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const banner = await prisma.banner.create({ data: req.body });
  res.status(201).json({ success: true, banner: toApiResponse(banner) });
});

export const updateBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    const banner = await prisma.banner.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json({ success: true, banner: toApiResponse(banner) });
  } catch {
    throw new AppError('Banner not found', 404);
  }
});

export const deleteBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    await prisma.banner.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Banner deleted' });
  } catch {
    throw new AppError('Banner not found', 404);
  }
});
