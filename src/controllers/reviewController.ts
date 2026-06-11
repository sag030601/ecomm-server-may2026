import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { toApiResponse } from '../utils/serialize';

const updateProductRating = async (productId: string) => {
  const reviews = await prisma.review.findMany({
    where: { productId, status: 'approved' },
    select: { rating: true },
  });
  const count = reviews.length;
  const avg = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  await prisma.product.update({
    where: { id: productId },
    data: { rating: Math.round(avg * 10) / 10, reviewCount: count },
  });
};

export const getProductReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const reviews = await prisma.review.findMany({
    where: { productId: String(req.params.productId), status: 'approved' },
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, reviews: toApiResponse(reviews) });
});

export const createReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.review.findUnique({
    where: {
      productId_userId: {
        productId: req.body.product,
        userId: req.user!.id,
      },
    },
  });
  if (existing) throw new AppError('You have already reviewed this product', 400);

  const review = await prisma.review.create({
    data: {
      productId: req.body.product,
      userId: req.user!.id,
      rating: req.body.rating,
      title: req.body.title,
      comment: req.body.comment,
    },
  });
  res.status(201).json({ success: true, review: toApiResponse(review) });
});

export const getAllReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const reviews = await prisma.review.findMany({
    where: status ? { status: status as 'pending' | 'approved' | 'rejected' } : undefined,
    include: {
      user: { select: { id: true, name: true, email: true } },
      product: { select: { id: true, name: true, images: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, reviews: toApiResponse(reviews) });
});

export const updateReviewStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { status } = req.body;
  try {
    const review = await prisma.review.update({
      where: { id: String(req.params.id) },
      data: { status },
    });
    await updateProductRating(review.productId);
    res.json({ success: true, review: toApiResponse(review) });
  } catch {
    throw new AppError('Review not found', 404);
  }
});

export const deleteReview = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    const review = await prisma.review.delete({ where: { id: String(req.params.id) } });
    await updateProductRating(review.productId);
    res.json({ success: true, message: 'Review deleted' });
  } catch {
    throw new AppError('Review not found', 404);
  }
});
