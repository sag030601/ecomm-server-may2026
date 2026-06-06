import { Response } from 'express';
import Product from '../models/Product';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

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

  const filter: Record<string, unknown> = { isActive: true };

  if (category) filter.category = category;
  if (subcategory) filter.subcategory = subcategory;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) (filter.price as Record<string, number>).$gte = Number(minPrice);
    if (maxPrice) (filter.price as Record<string, number>).$lte = Number(maxPrice);
  }
  if (size) filter['sizes.size'] = size;
  if (color) filter.colors = color;
  if (search) filter.$text = { $search: search as string };
  if (featured === 'true') filter.isFeatured = true;
  if (bestSeller === 'true') filter.isBestSeller = true;
  if (specialCombo === 'true') filter.isSpecialCombo = true;
  if (crazyDeal === 'true') filter.isCrazyDeal = true;

  const sortOptions: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1 },
    name: { name: 1 },
  };

  const pageNum = Math.max(1, parseInt(page as string, 10));
  const limitNum = Math.min(50, parseInt(limit as string, 10));
  const skip = (pageNum - 1) * limitNum;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .sort(sortOptions[sort as string] || sortOptions.newest)
      .skip(skip)
      .limit(limitNum),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    products,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export const getProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await Product.findById(req.params.id)
    .populate('category', 'name slug')
    .populate('subcategory', 'name slug');

  if (!product || (!product.isActive && req.user?.role !== 'admin')) {
    throw new AppError('Product not found', 404);
  }

  res.json({ success: true, product });
});

export const getRelatedProducts = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError('Product not found', 404);

  const related = await Product.find({
    _id: { $ne: product._id },
    category: product.category,
    isActive: true,
  })
    .limit(4)
    .populate('category', 'name slug');

  res.json({ success: true, products: related });
});

export const createProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const slug = slugify(req.body.name);
  const product = await Product.create({ ...req.body, slug });
  res.status(201).json({ success: true, product });
});

export const updateProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const updates = { ...req.body };
  if (updates.name) updates.slug = slugify(updates.name);

  const product = await Product.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!product) throw new AppError('Product not found', 404);
  res.json({ success: true, product });
});

export const deleteProduct = catchAsync(async (req: AuthRequest, res: Response) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new AppError('Product not found', 404);
  res.json({ success: true, message: 'Product deleted' });
});

export const getInventory = catchAsync(async (_req: AuthRequest, res: Response) => {
  const products = await Product.find({ isActive: true })
    .select('name slug images sizes category')
    .populate('category', 'name');

  const inventory = products.map((p) => ({
    _id: p._id,
    name: p.name,
    slug: p.slug,
    image: p.images[0],
    category: p.category,
    sizes: p.sizes,
    totalStock: p.sizes.reduce((sum, s) => sum + s.stock, 0),
  }));

  res.json({ success: true, inventory });
});

export const updateInventory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { sizes } = req.body;
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError('Product not found', 404);

  product.sizes = sizes;
  await product.save();
  res.json({ success: true, product });
});

export const getAllProductsAdmin = catchAsync(async (_req: AuthRequest, res: Response) => {
  const products = await Product.find()
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .sort({ createdAt: -1 });
  res.json({ success: true, products });
});
