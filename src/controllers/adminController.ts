import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { toApiResponse } from '../utils/serialize';
import { asOrderItemList } from '../types/json';

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const groupSalesByDay = (orders: { createdAt: Date; total: number }[]) => {
  const map = new Map<string, { revenue: number; orders: number }>();
  for (const order of orders) {
    const key = dateKey(order.createdAt);
    const current = map.get(key) ?? { revenue: 0, orders: 0 };
    current.revenue += order.total;
    current.orders += 1;
    map.set(key, current);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_id, stats]) => ({ _id, ...stats }));
};

export const getDashboardStats = catchAsync(async (_req: AuthRequest, res: Response) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalOrders,
    revenueResult,
    totalCustomers,
    totalProducts,
    pendingOrders,
    pendingReviews,
    recentOrders,
    paidOrdersLast30,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { paymentStatus: 'paid' },
    }),
    prisma.user.count({ where: { role: 'customer' } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count({ where: { orderStatus: 'pending' } }),
    prisma.review.count({ where: { status: 'pending' } }),
    prisma.order.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.order.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        paymentStatus: 'paid',
      },
      select: { createdAt: true, total: true },
    }),
  ]);

  res.json({
    success: true,
    stats: {
      totalOrders,
      totalRevenue: revenueResult._sum.total ?? 0,
      totalCustomers,
      totalProducts,
      pendingOrders,
      pendingReviews,
    },
    recentOrders: toApiResponse(recentOrders),
    monthlySales: groupSalesByDay(paidOrdersLast30),
  });
});

export const getAnalytics = catchAsync(async (req: AuthRequest, res: Response) => {
  const { period = '30' } = req.query;
  const days = parseInt(period as string, 10) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since } },
    select: {
      createdAt: true,
      total: true,
      paymentStatus: true,
      orderStatus: true,
      items: true,
    },
  });

  const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');

  const salesByDay = groupSalesByDay(
    paidOrders.map((o) => ({ createdAt: o.createdAt, total: o.total }))
  );

  const productStats = new Map<string, { name: string; totalSold: number; revenue: number }>();
  for (const order of paidOrders) {
    for (const item of asOrderItemList(order.items)) {
      const current = productStats.get(item.product) ?? {
        name: item.name,
        totalSold: 0,
        revenue: 0,
      };
      current.totalSold += item.quantity;
      current.revenue += item.price * item.quantity;
      productStats.set(item.product, current);
    }
  }

  const topProducts = [...productStats.entries()]
    .map(([_id, stats]) => ({ _id, ...stats }))
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, 10);

  const statusCounts = new Map<string, number>();
  for (const order of orders) {
    statusCounts.set(order.orderStatus, (statusCounts.get(order.orderStatus) ?? 0) + 1);
  }
  const ordersByStatus = [...statusCounts.entries()].map(([_id, count]) => ({ _id, count }));

  const productIds = [...new Set(paidOrders.flatMap((o) => asOrderItemList(o.items).map((i) => i.product)))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { category: { select: { name: true } } },
      })
    : [];

  const categoryByProduct = new Map(products.map((p) => [p.id, p.category.name]));
  const categoryRevenue = new Map<string, number>();
  for (const order of paidOrders) {
    for (const item of asOrderItemList(order.items)) {
      const category = categoryByProduct.get(item.product) ?? 'Uncategorized';
      categoryRevenue.set(
        category,
        (categoryRevenue.get(category) ?? 0) + item.price * item.quantity
      );
    }
  }

  const revenueByCategory = [...categoryRevenue.entries()]
    .map(([_id, revenue]) => ({ _id, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

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
