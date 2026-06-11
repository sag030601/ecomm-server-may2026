import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { toApiResponse } from '../utils/serialize';

export const getCoupons = catchAsync(async (_req: AuthRequest, res: Response) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ success: true, coupons: toApiResponse(coupons) });
});

export const createCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const coupon = await prisma.coupon.create({
    data: {
      ...req.body,
      code: req.body.code.toUpperCase(),
      expiresAt: new Date(req.body.expiresAt),
    },
  });
  res.status(201).json({ success: true, coupon: toApiResponse(coupon) });
});

export const updateCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = { ...req.body };
  if (data.code) data.code = data.code.toUpperCase();
  if (data.expiresAt) data.expiresAt = new Date(data.expiresAt);

  try {
    const coupon = await prisma.coupon.update({
      where: { id: String(req.params.id) },
      data,
    });
    res.json({ success: true, coupon: toApiResponse(coupon) });
  } catch {
    throw new AppError('Coupon not found', 404);
  }
});

export const deleteCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    await prisma.coupon.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Coupon deleted' });
  } catch {
    throw new AppError('Coupon not found', 404);
  }
});

export const validateCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code, subtotal } = req.body;
  const coupon = await prisma.coupon.findFirst({
    where: { code: code.toUpperCase(), isActive: true },
  });

  if (!coupon) throw new AppError('Invalid coupon code', 400);
  if (coupon.expiresAt < new Date()) throw new AppError('Coupon has expired', 400);
  if (coupon.usedCount >= coupon.usageLimit) throw new AppError('Coupon usage limit reached', 400);
  if (subtotal < coupon.minOrderAmount) {
    throw new AppError(`Minimum order amount is $${coupon.minOrderAmount}`, 400);
  }

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = (subtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.discountValue;
  }

  res.json({ success: true, coupon: toApiResponse(coupon), discount: Math.min(discount, subtotal) });
});
