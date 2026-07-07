import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReviewStatus,
} from '@prisma/client';
import { prisma } from './lib/prisma';
import { uploadFromUrl } from './utils/cloudinaryUpload';
import { asProductSizeList } from './types/json';

dotenv.config();

const seedImage = async (url: string) => uploadFromUrl(url, 'ecommerce/seed');

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

const seed = async () => {
  await prisma.$connect();
  console.log('Connected to database (Prisma)');

  await prisma.order.deleteMany();
  await prisma.review.deleteMany();
  await prisma.session.deleteMany();
  await prisma.oAuthExchange.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.oAuthState.deleteMany();

  const adminPassword = await bcrypt.hash('admin123', 12);
  const customerPassword = await bcrypt.hash('customer123', 12);

  await prisma.user.createMany({
    data: [
      { name: 'Admin User', email: 'admin@store.com', password: adminPassword, role: 'admin', emailVerified: true },
      { name: 'John Doe', email: 'john@example.com', password: customerPassword, role: 'customer', emailVerified: true },
      { name: 'Sarah Miller', email: 'sarah@example.com', password: customerPassword, role: 'customer', emailVerified: true, phone: '+1 555-0102' },
      { name: 'Mike Chen', email: 'mike@example.com', password: customerPassword, role: 'customer', emailVerified: true, phone: '+1 555-0103' },
      { name: 'Emma Wilson', email: 'emma@example.com', password: customerPassword, role: 'customer', emailVerified: true, phone: '+1 555-0104' },
      { name: 'Alex Rivera', email: 'alex@example.com', password: customerPassword, role: 'customer', emailVerified: false },
    ],
  });

  const categoryImages = {
    men: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
    women: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
    accessories: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
    footwear: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80',
  };

  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Men',
        slug: 'men',
        description: "Men's fashion",
        image: categoryImages.men,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Women',
        slug: 'women',
        description: "Women's fashion",
        image: categoryImages.women,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Accessories',
        slug: 'accessories',
        description: 'Fashion accessories',
        image: categoryImages.accessories,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Footwear',
        slug: 'footwear',
        description: 'Shoes and sneakers',
        image: categoryImages.footwear,
      },
    }),
  ]);

  const subcategories = await Promise.all([
    prisma.category.create({ data: { name: 'T-Shirts', slug: 't-shirts', parentId: categories[0].id } }),
    prisma.category.create({ data: { name: 'Jeans', slug: 'jeans', parentId: categories[0].id } }),
    prisma.category.create({ data: { name: 'Dresses', slug: 'dresses', parentId: categories[1].id } }),
    prisma.category.create({ data: { name: 'Handbags', slug: 'handbags', parentId: categories[2].id } }),
  ]);

  await prisma.product.createMany({
    data: [
      {
        name: 'Classic Cotton Tee',
        slug: 'classic-cotton-tee',
        description: 'Premium 100% cotton t-shirt with a relaxed fit. Perfect for everyday wear.',
        price: 29.99,
        compareAtPrice: 39.99,
        categoryId: categories[0].id,
        subcategoryId: subcategories[0].id,
        images: [await seedImage('https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80')],
        colors: ['White', 'Black', 'Navy'],
        sizes: [{ size: 'S', stock: 50 }, { size: 'M', stock: 75 }, { size: 'L', stock: 60 }, { size: 'XL', stock: 40 }],
        isBestSeller: true,
        isFeatured: true,
        rating: 4.5,
        reviewCount: 128,
      },
      {
        name: 'Slim Fit Denim Jeans',
        slug: 'slim-fit-denim-jeans',
        description: 'Modern slim fit jeans with stretch comfort. Dark wash finish.',
        price: 79.99,
        compareAtPrice: 99.99,
        categoryId: categories[0].id,
        subcategoryId: subcategories[1].id,
        images: [await seedImage('https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=800&q=80')],
        colors: ['Dark Blue', 'Light Blue'],
        sizes: [{ size: '30', stock: 30 }, { size: '32', stock: 45 }, { size: '34', stock: 35 }, { size: '36', stock: 25 }],
        isBestSeller: true,
        rating: 4.3,
        reviewCount: 89,
      },
      {
        name: 'Floral Summer Dress',
        slug: 'floral-summer-dress',
        description: 'Elegant floral print dress perfect for summer occasions.',
        price: 89.99,
        categoryId: categories[1].id,
        subcategoryId: subcategories[2].id,
        images: [await seedImage('https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80')],
        colors: ['Floral Pink', 'Floral Blue'],
        sizes: [{ size: 'XS', stock: 20 }, { size: 'S', stock: 35 }, { size: 'M', stock: 40 }, { size: 'L', stock: 25 }],
        isFeatured: true,
        isSpecialCombo: true,
        rating: 4.7,
        reviewCount: 56,
      },
      {
        name: 'Leather Crossbody Bag',
        slug: 'leather-crossbody-bag',
        description: 'Genuine leather crossbody bag with adjustable strap.',
        price: 129.99,
        compareAtPrice: 159.99,
        categoryId: categories[2].id,
        subcategoryId: subcategories[3].id,
        images: [await seedImage('https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=80')],
        colors: ['Brown', 'Black', 'Tan'],
        sizes: [{ size: 'One Size', stock: 45 }],
        isCrazyDeal: true,
        rating: 4.8,
        reviewCount: 203,
      },
      {
        name: 'Running Sneakers Pro',
        slug: 'running-sneakers-pro',
        description: 'Lightweight running shoes with advanced cushioning technology.',
        price: 119.99,
        compareAtPrice: 149.99,
        categoryId: categories[3].id,
        images: [await seedImage('https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80')],
        colors: ['Red', 'Black', 'White'],
        sizes: [{ size: '8', stock: 30 }, { size: '9', stock: 40 }, { size: '10', stock: 35 }, { size: '11', stock: 25 }],
        isBestSeller: true,
        isCrazyDeal: true,
        rating: 4.6,
        reviewCount: 167,
      },
      {
        name: 'Premium Hoodie',
        slug: 'premium-hoodie',
        description: 'Ultra-soft fleece hoodie with kangaroo pocket.',
        price: 59.99,
        categoryId: categories[0].id,
        subcategoryId: subcategories[0].id,
        images: [await seedImage('https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=800&q=80')],
        colors: ['Gray', 'Black', 'Navy'],
        sizes: [{ size: 'S', stock: 40 }, { size: 'M', stock: 55 }, { size: 'L', stock: 50 }, { size: 'XL', stock: 30 }],
        isSpecialCombo: true,
        rating: 4.4,
        reviewCount: 94,
      },
    ],
  });

  const heroImages = [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1920&q=80',
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=1920&q=80',
  ];

  await prisma.banner.createMany({
    data: [
      {
        title: 'Summer Collection 2026',
        subtitle: 'Up to 50% off on selected items',
        image: heroImages[0],
        link: '/products',
        position: 0,
      },
      {
        title: 'New Arrivals',
        subtitle: 'Discover the latest trends',
        image: heroImages[1],
        link: '/products?sort=newest',
        position: 1,
      },
      {
        title: 'Premium Essentials',
        subtitle: 'Curated styles for every occasion',
        image: heroImages[2],
        link: '/products?featured=true',
        position: 2,
      },
    ],
  });

  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 3);

  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME10',
        description: '10% off your first order',
        discountType: 'percentage',
        discountValue: 10,
        minOrderAmount: 50,
        maxDiscount: 25,
        usageLimit: 1000,
        expiresAt: expiry,
      },
      {
        code: 'SAVE20',
        description: '$20 off orders over $100',
        discountType: 'fixed',
        discountValue: 20,
        minOrderAmount: 100,
        usageLimit: 500,
        expiresAt: expiry,
      },
    ],
  });

  const [products, customers, welcomeCoupon] = await Promise.all([
    prisma.product.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.user.findMany({ where: { role: 'customer' } }),
    prisma.coupon.findUnique({ where: { code: 'WELCOME10' } }),
  ]);

  const paymentProfiles: { paymentStatus: PaymentStatus; orderStatus: OrderStatus; weight: number }[] = [
    { paymentStatus: 'paid', orderStatus: 'delivered', weight: 35 },
    { paymentStatus: 'paid', orderStatus: 'shipped', weight: 15 },
    { paymentStatus: 'paid', orderStatus: 'processing', weight: 10 },
    { paymentStatus: 'paid', orderStatus: 'confirmed', weight: 8 },
    { paymentStatus: 'pending', orderStatus: 'pending', weight: 12 },
    { paymentStatus: 'paid', orderStatus: 'pending', weight: 5 },
    { paymentStatus: 'failed', orderStatus: 'cancelled', weight: 5 },
    { paymentStatus: 'refunded', orderStatus: 'cancelled', weight: 3 },
    { paymentStatus: 'paid', orderStatus: 'cancelled', weight: 2 },
  ];

  const weightedProfiles = paymentProfiles.flatMap((p) => Array(p.weight).fill(p));

  const orderSeeds = Array.from({ length: 28 }, (_, index) => {
    const customer = customers[index % customers.length];
    const profile = pick(weightedProfiles) as (typeof paymentProfiles)[number];
    const itemCount = 1 + Math.floor(Math.random() * 3);
    const chosenProducts = [...products].sort(() => Math.random() - 0.5).slice(0, itemCount);

    const items = chosenProducts.map((product) => {
      const sizeVariant = pick(asProductSizeList(product.sizes));
      const quantity = 1 + Math.floor(Math.random() * 2);
      return {
        product: product.id,
        name: product.name,
        image: product.images[0] || '',
        price: product.price,
        size: sizeVariant.size,
        color: product.colors[0] ?? undefined,
        quantity,
      };
    });

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
    const useCoupon = index % 5 === 0 && welcomeCoupon && subtotal >= welcomeCoupon.minOrderAmount;
    let discount = 0;
    if (useCoupon && welcomeCoupon) {
      discount = Math.min(subtotal * 0.1, welcomeCoupon.maxDiscount ?? subtotal);
      discount = Math.round(discount * 100) / 100;
    }
    const shippingCost = subtotal >= 100 ? 0 : 9.99;
    const total = Math.round(Math.max(0, subtotal - discount + shippingCost) * 100) / 100;
    const dayOffset = Math.floor((index / 28) * 85) + Math.floor(Math.random() * 4);

    return {
      userId: customer.id,
      orderNumber: generateOrderNumber(),
      items,
      shippingAddress: sampleAddress(),
      paymentMethod: 'stripe' as PaymentMethod,
      paymentStatus: profile.paymentStatus,
      orderStatus: profile.orderStatus,
      subtotal,
      discount,
      shippingCost,
      total,
      couponId: useCoupon ? welcomeCoupon?.id : undefined,
      createdAt: daysAgo(dayOffset),
    };
  });

  for (const order of orderSeeds) {
    await prisma.order.create({ data: order });
  }

  const reviewComments = [
  { rating: 5, title: 'Love it!', comment: 'Great quality and fits perfectly. Will buy again.' },
  { rating: 4, title: 'Very good', comment: 'Nice product, shipping was fast. Slightly pricey but worth it.' },
  { rating: 5, title: 'Excellent', comment: 'Exceeded my expectations. Highly recommend.' },
  { rating: 3, title: 'Okay', comment: 'Decent quality but sizing runs a bit small.' },
  { rating: 2, title: 'Not for me', comment: 'Color was different from the photos.' },
  { rating: 5, title: 'Perfect gift', comment: 'Bought this as a gift and they loved it.' },
  { rating: 4, title: 'Solid purchase', comment: 'Good value for money. Comfortable material.' },
  { rating: 1, title: 'Disappointed', comment: 'Arrived with a small defect. Waiting on replacement.' },
  ];

  const reviewStatuses: ReviewStatus[] = ['approved', 'approved', 'approved', 'pending', 'pending', 'rejected'];

  for (let i = 0; i < reviewComments.length; i++) {
    const product = products[i % products.length];
    const customer = customers[i % customers.length];
    const review = reviewComments[i];
    await prisma.review.create({
      data: {
        productId: product.id,
        userId: customer.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        status: reviewStatuses[i % reviewStatuses.length],
        createdAt: daysAgo(3 + i * 4),
      },
    });
  }

  const paidOrderCount = orderSeeds.filter((o) => o.paymentStatus === 'paid').length;
  const totalRevenue = orderSeeds
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + o.total, 0);

  console.log('Seed data created successfully!');
  console.log('Admin: admin@store.com / admin123');
  console.log('Customer: john@example.com / customer123');
  console.log(`Orders: ${orderSeeds.length} (${paidOrderCount} paid, $${totalRevenue.toFixed(2)} revenue)`);
  console.log(`Reviews: ${reviewComments.length} (mix of pending, approved, rejected)`);
  await prisma.$disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
