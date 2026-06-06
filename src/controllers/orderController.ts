import { Response } from 'express';
import Order from '../models/Order';
import Product from '../models/Product';
import Coupon from '../models/Coupon';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { getStripe } from '../config/stripe';

const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

const calculateDiscount = (coupon: InstanceType<typeof Coupon>, subtotal: number): number => {
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

export const createOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const { items, shippingAddress, paymentMethod, couponCode, notes } = req.body;

  const orderItems = [];
  let subtotal = 0;

  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product || !product.isActive) throw new AppError(`Product not found: ${item.product}`, 404);

    const sizeVariant = product.sizes.find((s) => s.size === item.size);
    if (!sizeVariant) throw new AppError(`Size ${item.size} not available for ${product.name}`, 400);
    if (sizeVariant.stock < item.quantity) {
      throw new AppError(`Insufficient stock for ${product.name} (${item.size})`, 400);
    }

    orderItems.push({
      product: product._id,
      name: product.name,
      image: product.images[0] || '',
      price: product.price,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
    });

    subtotal += product.price * item.quantity;
  }

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
    if (!coupon) throw new AppError('Invalid coupon code', 400);
    if (coupon.expiresAt < new Date()) throw new AppError('Coupon has expired', 400);
    if (coupon.usedCount >= coupon.usageLimit) throw new AppError('Coupon usage limit reached', 400);
    discount = calculateDiscount(coupon, subtotal);
  }

  const shippingCost = subtotal >= 100 ? 0 : 9.99;
  const total = Math.max(0, subtotal - discount + shippingCost);

  const order = await Order.create({
    user: req.user!._id,
    orderNumber: generateOrderNumber(),
    items: orderItems,
    shippingAddress,
    paymentMethod,
    subtotal,
    discount,
    shippingCost,
    total,
    coupon: coupon?._id,
    notes,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
    orderStatus: 'pending',
  });

  if (paymentMethod === 'stripe') {
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'usd',
      metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber },
    });

    order.stripePaymentIntentId = paymentIntent.id;
    await order.save();

    return res.status(201).json({
      success: true,
      order,
      clientSecret: paymentIntent.client_secret,
    });
  }

  for (const item of items) {
    await Product.updateOne(
      { _id: item.product, 'sizes.size': item.size },
      { $inc: { 'sizes.$.stock': -item.quantity } }
    );
  }

  if (coupon) {
    coupon.usedCount += 1;
    await coupon.save();
  }

  order.orderStatus = 'confirmed';
  await order.save();

  res.status(201).json({ success: true, order });
});

export const getMyOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const orders = await Order.find({ user: req.user!._id })
    .sort({ createdAt: -1 })
    .populate('coupon', 'code');
  res.json({ success: true, orders });
});

export const getOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id).populate('coupon', 'code discountType discountValue');
  if (!order) throw new AppError('Order not found', 404);

  if (order.user.toString() !== req.user!._id.toString() && req.user!.role !== 'admin') {
    throw new AppError('Not authorized', 403);
  }

  res.json({ success: true, order });
});

export const getAllOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const { status, paymentStatus, page = '1', limit = '20' } = req.query;
  const filter: Record<string, unknown> = {};
  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Order.countDocuments(filter),
  ]);

  res.json({ success: true, orders, pagination: { page: pageNum, limit: limitNum, total } });
});

export const updateOrderStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderStatus, paymentStatus } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError('Order not found', 404);

  if (orderStatus) order.orderStatus = orderStatus;
  if (paymentStatus) order.paymentStatus = paymentStatus;
  await order.save();

  res.json({ success: true, order });
});

export const confirmStripePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError('Order not found', 404);
  if (order.user.toString() !== req.user!._id.toString()) throw new AppError('Not authorized', 403);

  if (!order.stripePaymentIntentId) throw new AppError('No payment intent found', 400);

  const paymentIntent = await getStripe().paymentIntents.retrieve(order.stripePaymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    throw new AppError('Payment not completed', 400);
  }

  for (const item of order.items) {
    await Product.updateOne(
      { _id: item.product, 'sizes.size': item.size },
      { $inc: { 'sizes.$.stock': -item.quantity } }
    );
  }

  if (order.coupon) {
    await Coupon.updateOne({ _id: order.coupon }, { $inc: { usedCount: 1 } });
  }

  order.paymentStatus = 'paid';
  order.orderStatus = 'confirmed';
  await order.save();

  res.json({ success: true, order });
});
