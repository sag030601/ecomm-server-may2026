import { Response } from 'express';
import Category from '../models/Category';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

export const getCategories = catchAsync(async (_req: AuthRequest, res: Response) => {
  const categories = await Category.find({ isActive: true, parent: null }).sort({ name: 1 });
  const subcategories = await Category.find({ isActive: true, parent: { $ne: null } }).sort({ name: 1 });

  res.json({ success: true, categories, subcategories });
});

export const getAllCategories = catchAsync(async (_req: AuthRequest, res: Response) => {
  const categories = await Category.find().populate('parent', 'name slug').sort({ name: 1 });
  res.json({ success: true, categories });
});

export const createCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const slug = slugify(req.body.name);
  const category = await Category.create({ ...req.body, slug });
  res.status(201).json({ success: true, category });
});

export const updateCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const updates = { ...req.body };
  if (updates.name) updates.slug = slugify(updates.name);

  const category = await Category.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!category) throw new AppError('Category not found', 404);
  res.json({ success: true, category });
});

export const deleteCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw new AppError('Category not found', 404);
  res.json({ success: true, message: 'Category deleted' });
});
