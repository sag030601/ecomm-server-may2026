import { Order, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { asOrderItemList, asProductSizeList } from '../types/json';

const isWriteConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const finalizePaidOrder = async (order: Order) => {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({ where: { id: order.id } });
        if (!current) {
          throw new AppError('Order not found', 404);
        }
        if (current.paymentStatus === 'paid') {
          return;
        }

        for (const item of asOrderItemList(current.items)) {
          const product = await tx.product.findUnique({ where: { id: item.product } });
          if (!product) {
            throw new AppError(`Product not found for order item: ${item.name}`, 400);
          }

          const sizes = asProductSizeList(product.sizes);
          const sizeIndex = sizes.findIndex((s) => s.size === item.size);
          if (sizeIndex === -1 || sizes[sizeIndex].stock < item.quantity) {
            throw new AppError(`Insufficient stock for ${item.name} (${item.size})`, 400);
          }

          const updatedSizes = sizes.map((s, i) =>
            i === sizeIndex ? { ...s, stock: s.stock - item.quantity } : s
          );

          await tx.product.update({
            where: { id: product.id },
            data: { sizes: updatedSizes },
          });
        }

        if (current.couponId) {
          const coupon = await tx.coupon.findUnique({ where: { id: current.couponId } });
          if (!coupon || coupon.usedCount >= coupon.usageLimit) {
            throw new AppError('Coupon usage limit reached', 400);
          }
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
          });
        }

        await tx.order.update({
          where: { id: current.id },
          data: { paymentStatus: 'paid', orderStatus: 'confirmed' },
        });
      });
      return;
    } catch (error) {
      const alreadyPaid = await prisma.order.findFirst({
        where: { id: order.id, paymentStatus: 'paid' },
        select: { id: true },
      });
      if (alreadyPaid) {
        return;
      }

      if (isWriteConflict(error) && attempt < maxRetries - 1) {
        await sleep(100 * (attempt + 1));
        continue;
      }

      throw error;
    }
  }
};
