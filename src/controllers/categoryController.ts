import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { toApiResponse } from '../utils/serialize';

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

export const getCategories = catchAsync(async (_req: AuthRequest, res: Response) => {
  const [categories, subcategories] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { name: 'asc' },
    }),
    prisma.category.findMany({
      where: { isActive: true, parentId: { not: null } },
      orderBy: { name: 'asc' },
    }),
  ]);

  res.json({ success: true, categories: toApiResponse(categories), subcategories: toApiResponse(subcategories) });
});

export const getAllCategories = catchAsync(async (_req: AuthRequest, res: Response) => {
  const categories = await prisma.category.findMany({
    include: { parent: { select: { id: true, name: true, slug: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, categories: toApiResponse(categories) });
});

export const createCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { parent, ...rest } = req.body;
  const category = await prisma.category.create({
    data: {
      ...rest,
      slug: slugify(req.body.name),
      parentId: parent || null,
    },
  });
  res.status(201).json({ success: true, category: toApiResponse(category) });
});

export const updateCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { parent, ...rest } = req.body;
  const data: Record<string, unknown> = { ...rest };
  if (rest.name) data.slug = slugify(rest.name);
  if (parent !== undefined) data.parentId = parent || null;

  try {
    const category = await prisma.category.update({
      where: { id: String(req.params.id) },
      data,
    });
    res.json({ success: true, category: toApiResponse(category) });
  } catch {
    throw new AppError('Category not found', 404);
  }
});

export const deleteCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    await prisma.category.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Category deleted' });
  } catch {
    throw new AppError('Category not found', 404);
  }
});
