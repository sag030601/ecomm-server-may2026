/**
 * Adds sample orders and reviews without wiping existing data.
 * Skips if paid orders already exist.
 */
import dotenv from 'dotenv';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReviewStatus,
} from '@prisma/client';
import { prisma } from './lib/prisma';
import { asProductSizeList } from './types/json';

dotenv.config();

const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(9 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
  return date;
};

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const sampleAddress = () => ({
  street: `${100 + Math.floor(Math.random() * 900)} Main St`,
  city: pick(['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix']),
  state: pick(['NY', 'CA', 'IL', 'TX', 'AZ']),
  zipCode: String(10000 + Math.floor(Math.random() * 89999)),
  country: 'US',
});

const seedDemoData = async () => {
  await prisma.$connect();

  const paidCount = await prisma.order.count({ where: { paymentStatus: 'paid' } });
  if (paidCount > 0) {
    console.log(`Skipping demo orders — ${paidCount} paid order(s) already exist.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true } }),
    prisma.user.findMany({ where: { role: 'customer' } }),
  ]);

  if (!products.length || !customers.length) {
    console.error('Need at least one product and customer. Run npm run seed first.');
    process.exit(1);
  }

  const profiles: { paymentStatus: PaymentStatus; orderStatus: OrderStatus }[] = [
    { paymentStatus: 'paid', orderStatus: 'delivered' },
    { paymentStatus: 'paid', orderStatus: 'shipped' },
    { paymentStatus: 'paid', orderStatus: 'processing' },
    { paymentStatus: 'paid', orderStatus: 'confirmed' },
    { paymentStatus: 'pending', orderStatus: 'pending' },
    { paymentStatus: 'failed', orderStatus: 'cancelled' },
  ];

  for (let i = 0; i < 20; i++) {
    const customer = customers[i % customers.length];
    const profile = pick(profiles);
    const product = pick(products);
    const sizeVariant = pick(asProductSizeList(product.sizes));
    const quantity = 1 + Math.floor(Math.random() * 2);
    const subtotal = Math.round(product.price * quantity * 100) / 100;
    const shippingCost = subtotal >= 100 ? 0 : 9.99;
    const total = Math.round((subtotal + shippingCost) * 100) / 100;

    await prisma.order.create({
      data: {
        userId: customer.id,
        orderNumber: generateOrderNumber(),
        items: [
          {
            product: product.id,
            name: product.name,
            image: product.images[0] || '',
            price: product.price,
            size: sizeVariant.size,
            color: product.colors[0],
            quantity,
          },
        ],
        shippingAddress: sampleAddress(),
        paymentMethod: 'stripe' as PaymentMethod,
        paymentStatus: profile.paymentStatus,
        orderStatus: profile.orderStatus,
        subtotal,
        shippingCost,
        total,
        createdAt: daysAgo(Math.floor(Math.random() * 60)),
      },
    });
  }

  const reviewCount = await prisma.review.count();
  if (reviewCount === 0) {
    const statuses: ReviewStatus[] = ['approved', 'approved', 'pending', 'rejected'];
    for (let i = 0; i < 6; i++) {
      await prisma.review.create({
        data: {
          productId: products[i % products.length].id,
          userId: customers[i % customers.length].id,
          rating: 3 + (i % 3),
          title: 'Sample review',
          comment: 'Demo review for admin moderation testing.',
          status: statuses[i % statuses.length],
          createdAt: daysAgo(2 + i * 3),
        },
      });
    }
    console.log('Created 6 sample reviews.');
  }

  const newPaidCount = await prisma.order.count({ where: { paymentStatus: 'paid' } });
  console.log(`Demo data added: 20 orders (${newPaidCount} paid).`);
  await prisma.$disconnect();
  process.exit(0);
};

seedDemoData().catch((err) => {
  console.error(err);
  process.exit(1);
});
