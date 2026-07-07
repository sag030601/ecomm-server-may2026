import { Coupon, Prisma } from '@prisma/client';
import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { getStripe, isStripeEnabled, isStripeApiConfigured } from '../config/stripe';
import { isDevelopment } from '../config/env';
import { finalizePaidOrder } from '../services/orderPaymentService';
import { mergeOrderLineItems } from '../utils/orderItems';
import {
  toDollars,
  toStripeCents,
  assertReasonableOrderTotal,
  logPaymentCalculation,
  assertStripeAmountMatches,
} from '../utils/pricing';
import { createStripeCheckoutSession } from '../utils/stripeCheckoutSession';
import { logger } from '../utils/logger';
import { toApiResponse } from '../utils/serialize';
import { asOrderItemList, asProductSizeList, OrderItemJson } from '../types/json';

const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

const calculateDiscount = (coupon: Coupon, subtotal: number): number => {
  if (subtotal < coupon.minOrderAmount) return 0;

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = (subtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.discountValue;
  }
  return Math.min(discount, subtotal);
};

const decrementStock = async (productId: string, size: string, quantity: number) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(`Product not found: ${productId}`, 404);

  const sizes = asProductSizeList(product.sizes);
  const sizeIndex = sizes.findIndex((s) => s.size === size);
  if (sizeIndex === -1 || sizes[sizeIndex].stock < quantity) {
    throw new AppError(`Insufficient stock for ${product.name} (${size})`, 400);
  }

  const updatedSizes = sizes.map((s, i) =>
    i === sizeIndex ? { ...s, stock: s.stock - quantity } : s
  );

  await prisma.product.update({
    where: { id: productId },
    data: { sizes: updatedSizes },
  });
};

export const createOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const { shippingAddress, paymentMethod, couponCode, notes } = req.body;

  if (paymentMethod !== 'stripe') {
    throw new AppError('Only card payment via Stripe is supported', 400);
  }
  const mergedItems = mergeOrderLineItems(req.body.items);

  const orderItems: OrderItemJson[] = [];
  let subtotal = 0;

  for (const item of mergedItems) {
    const product = await prisma.product.findUnique({ where: { id: item.product } });
    if (!product || !product.isActive) throw new AppError(`Product not found: ${item.product}`, 404);

    const sizeVariant = asProductSizeList(product.sizes).find((s) => s.size === item.size);
    if (!sizeVariant) throw new AppError(`Size ${item.size} not available for ${product.name}`, 400);
    if (sizeVariant.stock < item.quantity) {
      throw new AppError(`Insufficient stock for ${product.name} (${item.size})`, 400);
    }

    const unitPrice = toDollars(product.price);

    orderItems.push({
      product: product.id,
      name: product.name,
      image: product.images[0] || '',
      price: unitPrice,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
    });

    subtotal += unitPrice * item.quantity;
  }

  subtotal = toDollars(subtotal);

  let discount = 0;
  let coupon: Coupon | null = null;
  if (couponCode) {
    coupon = await prisma.coupon.findFirst({
      where: { code: couponCode.toUpperCase(), isActive: true },
    });
    if (!coupon) throw new AppError('Invalid coupon code', 400);
    if (coupon.expiresAt < new Date()) throw new AppError('Coupon has expired', 400);
    if (coupon.usedCount >= coupon.usageLimit) throw new AppError('Coupon usage limit reached', 400);
    discount = calculateDiscount(coupon, subtotal);
  }

  const shippingCost = subtotal >= 100 ? 0 : 9.99;
  const total = toDollars(Math.max(0, subtotal - discount + shippingCost));
  assertReasonableOrderTotal(total);

  const order = await prisma.order.create({
    data: {
      userId: req.user!.id,
      orderNumber: generateOrderNumber(),
      items: orderItems,
      shippingAddress,
      paymentMethod,
      subtotal,
      discount,
      shippingCost,
      total,
      couponId: coupon?.id,
      notes,
      paymentStatus: 'pending',
      orderStatus: 'pending',
    },
    include: { coupon: { select: { code: true } } },
  });

  if (paymentMethod === 'stripe') {
    if (!isStripeEnabled()) {
      return res.status(201).json({
        success: true,
        order: toApiResponse(order),
        demoMode: true,
      });
    }

    if (isStripeApiConfigured()) {
      const stripeCents = toStripeCents(total);

      logPaymentCalculation({
        orderNumber: order.orderNumber,
        itemCount: orderItems.length,
        subtotal,
        discount,
        shippingCost,
        totalDollars: total,
        stripeCents,
      });

      const itemSummary = orderItems
        .map((line) => `${line.name} (${line.size}) x${line.quantity}`)
        .join('; ');

      const session = await createStripeCheckoutSession(getStripe(), {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: req.user!.email,
        stripeCents,
        itemSummary,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          subtotal: String(subtotal),
          discount: String(discount),
          shipping: String(shippingCost),
          total: String(total),
          stripeCents: String(stripeCents),
        },
      });

      if (session.amount_total != null && session.amount_total !== stripeCents) {
        logger.warn('stripe-amount-mismatch', {
          orderNumber: order.orderNumber,
          expectedCents: stripeCents,
          sessionAmountTotal: session.amount_total,
        });
      }

      assertStripeAmountMatches(total, stripeCents);

      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: { stripeCheckoutSessionId: session.id },
      });

      return res.status(201).json({
        success: true,
        order: toApiResponse(updatedOrder),
        checkoutUrl: session.url,
      });
    }

    throw new AppError('Stripe is not configured. Add STRIPE_SECRET_KEY to your .env file.', 503);
  }

  throw new AppError('Only card payment via Stripe is supported', 400);
});

export const getMyOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.id },
    include: { coupon: { select: { code: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, orders: toApiResponse(orders) });
});

export const getOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const order = await prisma.order.findUnique({
    where: { id: String(req.params.id) },
    include: { coupon: { select: { code: true, discountType: true, discountValue: true } } },
  });
  if (!order) throw new AppError('Order not found', 404);

  if (order.userId !== req.user!.id && req.user!.role !== 'admin') {
    throw new AppError('Not authorized', 403);
  }

  res.json({ success: true, order: toApiResponse(order) });
});

export const getAllOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const { status, paymentStatus, page = '1', limit = '20' } = req.query;
  const where: Prisma.OrderWhereInput = {};
  if (status) where.orderStatus = status as Prisma.EnumOrderStatusFilter['equals'];
  if (paymentStatus) where.paymentStatus = paymentStatus as Prisma.EnumPaymentStatusFilter['equals'];

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    success: true,
    orders: toApiResponse(orders),
    pagination: { page: pageNum, limit: limitNum, total },
  });
});

export const updateOrderStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderStatus, paymentStatus } = req.body;
  try {
    const order = await prisma.order.update({
      where: { id: String(req.params.id) },
      data: {
        ...(orderStatus ? { orderStatus } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
      },
    });
    res.json({ success: true, order: toApiResponse(order) });
  } catch {
    throw new AppError('Order not found', 404);
  }
});

export const confirmStripePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
  if (!order) throw new AppError('Order not found', 404);
  if (order.userId !== req.user!.id) throw new AppError('Not authorized', 403);

  if (!order.stripePaymentIntentId) throw new AppError('No payment intent found', 400);

  const paymentIntent = await getStripe().paymentIntents.retrieve(order.stripePaymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    throw new AppError('Payment not completed', 400);
  }

  if (order.paymentStatus === 'paid') {
    return res.json({ success: true, order: toApiResponse(order) });
  }

  await finalizePaidOrder(order);

  const updated = await prisma.order.findUnique({ where: { id: order.id } });
  res.json({ success: true, order: toApiResponse(updated) });
});

export const confirmCheckoutSession = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!isStripeApiConfigured()) {
    throw new AppError('Stripe API is not configured for payment verification', 503);
  }

  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== 'string') {
    throw new AppError('Checkout session ID is required', 400);
  }

  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') {
    throw new AppError('Payment not completed', 400);
  }

  const orderId = session.client_reference_id || session.metadata?.orderId;
  if (!orderId) throw new AppError('Order reference not found in checkout session', 400);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404);
  if (order.userId !== req.user!.id) throw new AppError('Not authorized', 403);

  if (session.amount_total != null) {
    const expectedCents = toStripeCents(order.total);
    if (session.amount_total !== expectedCents) {
      logger.warn('checkout-confirm-amount-mismatch', {
        orderId,
        orderTotal: order.total,
        expectedCents,
        sessionAmountTotal: session.amount_total,
      });
      throw new AppError('Payment amount does not match order total', 400);
    }
  }

  if (order.paymentStatus === 'paid') {
    return res.json({ success: true, order: toApiResponse(order) });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  try {
    await finalizePaidOrder(order);
  } catch (error) {
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    if (updated?.paymentStatus === 'paid') {
      return res.json({ success: true, order: toApiResponse(updated) });
    }
    throw error;
  }

  const updated = await prisma.order.findUnique({ where: { id: order.id } });
  res.json({ success: true, order: toApiResponse(updated) });
});

export const confirmDemoPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!isDevelopment) {
    throw new AppError('Demo payment is disabled in production', 403);
  }
  if (isStripeEnabled()) {
    throw new AppError('Demo payment is only available when Stripe is not configured', 400);
  }

  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
  if (!order) throw new AppError('Order not found', 404);
  if (order.userId !== req.user!.id) throw new AppError('Not authorized', 403);
  if (order.paymentMethod !== 'stripe') throw new AppError('Order is not a card payment', 400);
  if (order.paymentStatus === 'paid') {
    return res.json({ success: true, order: toApiResponse(order) });
  }

  await finalizePaidOrder(order);

  const updated = await prisma.order.findUnique({ where: { id: order.id } });
  res.json({ success: true, order: toApiResponse(updated) });
});
