import { Order } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';

export const finalizePaidOrder = async (order: Order) => {
  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const product = await tx.product.findUnique({ where: { id: item.product } });
      if (!product) {
        throw new AppError(`Product not found for order item: ${item.name}`, 400);
      }

      const sizeIndex = product.sizes.findIndex((s) => s.size === item.size);
      if (sizeIndex === -1 || product.sizes[sizeIndex].stock < item.quantity) {
        throw new AppError(`Insufficient stock for ${item.name} (${item.size})`, 400);
      }

      const updatedSizes = product.sizes.map((s, i) =>
        i === sizeIndex ? { ...s, stock: s.stock - item.quantity } : s
      );

      await tx.product.update({
        where: { id: product.id },
        data: { sizes: updatedSizes },
      });
    }

    if (order.couponId) {
      const coupon = await tx.coupon.findUnique({ where: { id: order.couponId } });
      if (!coupon || coupon.usedCount >= coupon.usageLimit) {
        throw new AppError('Coupon usage limit reached', 400);
      }
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'paid', orderStatus: 'confirmed' },
    });
  });
};
