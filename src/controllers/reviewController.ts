import { Response } from 'express';
import Review from '../models/Review';
import Product from '../models/Product';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';

const updateProductRating = async (productId: string) => {
  const reviews = await Review.find({ product: productId, status: 'approved' });
  const count = reviews.length;
  const avg = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  await Product.findByIdAndUpdate(productId, { rating: Math.round(avg * 10) / 10, reviewCount: count });
};

export const getProductReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const reviews = await Review.find({ product: req.params.productId, status: 'approved' })
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 });
  res.json({ success: true, reviews });
});

export const createReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const existing = await Review.findOne({ product: req.body.product, user: req.user!._id });
  if (existing) throw new AppError('You have already reviewed this product', 400);

  const review = await Review.create({ ...req.body, user: req.user!._id });
  res.status(201).json({ success: true, review });
});

export const getAllReviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const reviews = await Review.find(filter)
    .populate('user', 'name email')
    .populate('product', 'name images')
    .sort({ createdAt: -1 });

  res.json({ success: true, reviews });
});

export const updateReviewStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { status } = req.body;
  const review = await Review.findById(req.params.id);
  if (!review) throw new AppError('Review not found', 404);

  review.status = status;
  await review.save();
  await updateProductRating(review.product.toString());

  res.json({ success: true, review });
});

export const deleteReview = catchAsync(async (req: AuthRequest, res: Response) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw new AppError('Review not found', 404);
  await updateProductRating(review.product.toString());
  res.json({ success: true, message: 'Review deleted' });
});
