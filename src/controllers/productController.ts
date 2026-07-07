import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { toDollars } from '../utils/pricing';
import { toApiResponse } from '../utils/serialize';
import { asProductSizeList } from '../types/json';
import { findProductIdsBySize } from '../utils/jsonQuery';

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

const categorySelect = { select: { id: true, name: true, slug: true } };

const mapProductBody = (body: Record<string, unknown>) => {
  const { category, subcategory, ...rest } = body;
  return {
    ...rest,
    ...(category !== undefined ? { categoryId: category as string } : {}),
    ...(subcategory !== undefined ? { subcategoryId: (subcategory as string) || null } : {}),
  };
};

export const getProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    category,
    subcategory,
    minPrice,
    maxPrice,
    size,
    color,
    search,
    sort = 'newest',
    page = '1',
    limit = '12',
    featured,
    bestSeller,
    specialCombo,
    crazyDeal,
  } = req.query;

  const where: Prisma.ProductWhereInput = { isActive: true };

  if (category) where.categoryId = category as string;
  if (subcategory) where.subcategoryId = subcategory as string;
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = Number(minPrice);
    if (maxPrice) where.price.lte = Number(maxPrice);
  }
  if (size) {
    const productIds = await findProductIdsBySize(size as string);
    where.id = { in: productIds };
  }
  if (color) where.colors = { has: color as string };
  if (search) {
    where.OR = [
      { name: { contains: search as string, mode: 'insensitive' } },
      { description: { contains: search as string, mode: 'insensitive' } },
    ];
  }
  if (featured === 'true') where.isFeatured = true;
  if (bestSeller === 'true') where.isBestSeller = true;
  if (specialCombo === 'true') where.isSpecialCombo = true;
  if (crazyDeal === 'true') where.isCrazyDeal = true;

  const sortMap: Record<string, Prisma.ProductOrderByWithRelationInput> = {
    newest: { createdAt: 'desc' },
    price_asc: { price: 'asc' },
    price_desc: { price: 'desc' },
    rating: { rating: 'desc' },
    name: { name: 'asc' },
  };

  const pageNum = Math.max(1, parseInt(page as string, 10));
  const limitNum = Math.min(50, parseInt(limit as string, 10));
  const skip = (pageNum - 1) * limitNum;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: categorySelect, subcategory: categorySelect },
      orderBy: sortMap[sort as string] || sortMap.newest,
      skip,
      take: limitNum,
    }),
    prisma.product.count({ where }),
  ]);

  res.json({
    success: true,
    products: toApiResponse(products),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export const getProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await prisma.product.findUnique({
    where: { id: String(req.params.id) },
    include: { category: categorySelect, subcategory: categorySelect },
  });

  if (!product || (!product.isActive && req.user?.role !== 'admin')) {
    throw new AppError('Product not found', 404);
  }

  res.json({ success: true, product: toApiResponse(product) });
});

export const getRelatedProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await prisma.product.findUnique({ where: { id: String(req.params.id) } });
  if (!product) throw new AppError('Product not found', 404);

  const related = await prisma.product.findMany({
    where: {
      id: { not: product.id },
      categoryId: product.categoryId,
      isActive: true,
    },
    take: 4,
    include: { category: categorySelect },
  });

  res.json({ success: true, products: toApiResponse(related) });
});

export const createProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await prisma.product.create({
    data: {
      ...mapProductBody(req.body),
      slug: slugify(req.body.name),
    } as Prisma.ProductCreateInput,
    include: { category: categorySelect, subcategory: categorySelect },
  });
  res.status(201).json({ success: true, product: toApiResponse(product) });
});

export const updateProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = mapProductBody(req.body) as Prisma.ProductUpdateInput;
  if (req.body.name) data.slug = slugify(req.body.name);

  try {
    const product = await prisma.product.update({
      where: { id: String(req.params.id) },
      data,
      include: { category: categorySelect, subcategory: categorySelect },
    });
    res.json({ success: true, product: toApiResponse(product) });
  } catch {
    throw new AppError('Product not found', 404);
  }
});

export const deleteProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    await prisma.product.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Product deleted' });
  } catch {
    throw new AppError('Product not found', 404);
  }
});

export const getInventory = catchAsync(async (_req: AuthRequest, res: Response) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      images: true,
      sizes: true,
      category: categorySelect,
    },
    orderBy: { name: 'asc' },
  });

  const inventory = products.map((p) => {
    const sizes = asProductSizeList(p.sizes);
    return {
      ...p,
      image: p.images[0],
      sizes,
      totalStock: sizes.reduce((sum, s) => sum + s.stock, 0),
    };
  });

  res.json({ success: true, inventory: toApiResponse(inventory) });
});

export const updateInventory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { sizes } = req.body;

  try {
    const product = await prisma.product.update({
      where: { id: String(req.params.id) },
      data: { sizes },
      include: { category: categorySelect },
    });
    res.json({ success: true, product: toApiResponse(product) });
  } catch {
    throw new AppError('Product not found', 404);
  }
});

export const validateCartItems = catchAsync(async (req: AuthRequest, res: Response) => {
  const { items } = req.body as {
    items: Array<{ productId: string; size: string; color?: string; quantity: number }>;
  };

  if (!Array.isArray(items)) {
    throw new AppError('Items array is required', 400);
  }

  const validated: Array<{
    productId: string;
    name: string;
    image: string;
    price: number;
    size: string;
    color?: string;
    quantity: number;
    maxStock: number;
  }> = [];
  const removed: Array<{ productId: string; size: string; color?: string; reason: string }> = [];
  const updated: string[] = [];

  const merged = new Map<string, (typeof items)[0]>();
  for (const item of items) {
    const key = `${item.productId}-${item.size}-${item.color?.trim() || ''}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(key, {
        ...item,
        color: item.color?.trim() || undefined,
        quantity: item.quantity,
      });
    }
  }

  for (const item of merged.values()) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product || !product.isActive) {
      removed.push({
        productId: item.productId,
        size: item.size,
        color: item.color,
        reason: 'Product not found or unavailable',
      });
      continue;
    }

    const sizeVariant = asProductSizeList(product.sizes).find((s) => s.size === item.size);
    if (!sizeVariant) {
      removed.push({
        productId: item.productId,
        size: item.size,
        color: item.color,
        reason: `Size ${item.size} is not available`,
      });
      continue;
    }

    if (product.colors.length > 0 && item.color && !product.colors.includes(item.color)) {
      removed.push({
        productId: item.productId,
        size: item.size,
        color: item.color,
        reason: `Color ${item.color} is not available`,
      });
      continue;
    }

    if (sizeVariant.stock <= 0) {
      removed.push({
        productId: item.productId,
        size: item.size,
        color: item.color,
        reason: 'Out of stock',
      });
      continue;
    }

    const quantity = Math.min(item.quantity, sizeVariant.stock);
    const cartItem = {
      productId: product.id,
      name: product.name,
      image: product.images[0] || '',
      price: toDollars(product.price),
      size: item.size,
      color: item.color,
      quantity,
      maxStock: sizeVariant.stock,
    };

    if (quantity < item.quantity) {
      updated.push(product.id);
    }

    validated.push(cartItem);
  }

  res.json({ success: true, items: validated, removed, updated });
});

export const getAllProductsAdmin = catchAsync(async (_req: AuthRequest, res: Response) => {
  const products = await prisma.product.findMany({
    include: { category: { select: { id: true, name: true } }, subcategory: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, products: toApiResponse(products) });
});
