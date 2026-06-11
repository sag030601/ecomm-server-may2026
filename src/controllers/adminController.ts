import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { toApiResponse } from '../utils/serialize';

type AggregateResult<T> = { cursor: { firstBatch: T[] } };

const runAggregate = async <T>(pipeline: object[]): Promise<T[]> => {
  const result = (await prisma.$runCommandRaw({
    aggregate: 'orders',
    pipeline,
    cursor: {},
  })) as AggregateResult<T>;
  return result.cursor?.firstBatch ?? [];
};

export const getDashboardStats = catchAsync(async (_req: AuthRequest, res: Response) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalOrders,
    revenueAgg,
    totalCustomers,
    totalProducts,
    pendingOrders,
    pendingReviews,
    recentOrders,
    monthlySales,
  ] = await Promise.all([
    prisma.order.count(),
    runAggregate<{ total: number }>([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    prisma.user.count({ where: { role: 'customer' } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count({ where: { orderStatus: 'pending' } }),
    prisma.review.count({ where: { status: 'pending' } }),
    prisma.order.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    runAggregate<{ _id: string; revenue: number; orders: number }>([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          paymentStatus: { $in: ['paid', 'pending'] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({
    success: true,
    stats: {
      totalOrders,
      totalRevenue: revenueAgg[0]?.total || 0,
      totalCustomers,
      totalProducts,
      pendingOrders,
      pendingReviews,
    },
    recentOrders: toApiResponse(recentOrders),
    monthlySales,
  });
});

export const getAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const { period = '30' } = req.query;
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - parseInt(period as string, 10));

  const dateMatch = { createdAt: { $gte: daysAgo } };

  const [salesByDay, topProducts, ordersByStatus, revenueByCategory] = await Promise.all([
    runAggregate<{ _id: string; revenue: number; orders: number }>([
      { $match: dateMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    runAggregate<{ _id: string; name: string; totalSold: number; revenue: number }>([
      { $match: dateMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          totalSold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]),
    runAggregate<{ _id: string; count: number }>([
      { $match: dateMatch },
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]),
    runAggregate<{ _id: string; revenue: number }>([
      { $match: dateMatch },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$category.name',
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
  ]);

  res.json({
    success: true,
    salesByDay,
    topProducts,
    ordersByStatus,
    revenueByCategory,
  });
});

export const getAllUsers = catchAsync(async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { role: 'customer' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      avatar: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      addresses: true,
      oauthAccounts: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, users: toApiResponse(users), count: users.length });
});

export const getUserById = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: String(req.params.id) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      avatar: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      addresses: true,
      oauthAccounts: true,
    },
  });
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, user: toApiResponse(user) });
});
