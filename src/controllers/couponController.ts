import { Response } from 'express';
import Coupon from '../models/Coupon';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';

export const getCoupons = catchAsync(async (_req: AuthRequest, res: Response) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  res.json({ success: true, coupons });
});

export const createCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const coupon = await Coupon.create({
    ...req.body,
    code: req.body.code.toUpperCase(),
    expiresAt: new Date(req.body.expiresAt),
  });
  res.status(201).json({ success: true, coupon });
});

export const updateCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const updates = { ...req.body };
  if (updates.code) updates.code = updates.code.toUpperCase();
  if (updates.expiresAt) updates.expiresAt = new Date(updates.expiresAt);

  const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!coupon) throw new AppError('Coupon not found', 404);
  res.json({ success: true, coupon });
});

export const deleteCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw new AppError('Coupon not found', 404);
  res.json({ success: true, message: 'Coupon deleted' });
});

export const validateCoupon = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code, subtotal } = req.body;
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

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

  res.json({ success: true, coupon, discount: Math.min(discount, subtotal) });
});
