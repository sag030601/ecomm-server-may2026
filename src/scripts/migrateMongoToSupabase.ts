/**
 * One-time migration: copy all documents from MongoDB Atlas into Supabase PostgreSQL.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." npm run migrate:mongo
 */
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI ??
  'mongodb+srv://sagarsingh030601_db_user:q5zoblcHu0csX5SP@cluster0.3ptb5lc.mongodb.net/ecommerce';

const toHexId = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof ObjectId) return value.toHexString();
  return String(value);
};

/** Deterministic ObjectId -> UUID mapping for stable foreign keys. */
export const objectIdToUuid = (id: string): string => {
  const hex = id.replace(/[^a-f0-9]/gi, '').slice(0, 24);
  const padded = (hex + '00000000').slice(0, 32);
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-${padded.slice(12, 16)}-${padded.slice(16, 20)}-${padded.slice(20, 32)}`;
};

const refId = (value: unknown): string | null => {
  const hex = toHexId(value);
  return hex ? objectIdToUuid(hex) : null;
};

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  return new Date(value as string);
};

const asArray = <T>(value: unknown, fallback: T[] = []): T[] =>
  Array.isArray(value) ? (value as T[]) : fallback;

const clearTarget = async () => {
  await prisma.order.deleteMany();
  await prisma.review.deleteMany();
  await prisma.session.deleteMany();
  await prisma.oAuthExchange.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.oAuthState.deleteMany();
};

const migrate = async () => {
  const mongo = new MongoClient(MONGODB_URI);
  await mongo.connect();
  const db = mongo.db();

  console.log('Connected to MongoDB');
  await prisma.$connect();
  console.log('Connected to Supabase (PostgreSQL)');

  await clearTarget();
  console.log('Cleared existing Supabase data');

  const users = await db.collection('users').find().toArray();
  if (users.length) {
    await prisma.user.createMany({
      data: users.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        name: doc.name,
        email: doc.email,
        password: doc.password ?? null,
        role: doc.role,
        phone: doc.phone ?? null,
        addresses: asArray(doc.addresses) as Prisma.InputJsonValue,
        avatar: doc.avatar ?? null,
        emailVerified: Boolean(doc.emailVerified),
        oauthAccounts: asArray(doc.oauthAccounts) as Prisma.InputJsonValue,
        tokenVersion: doc.tokenVersion ?? 0,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      })),
    });
    console.log(`Migrated users: ${users.length}`);
  }

  const categories = await db.collection('categories').find().toArray();
  const rootCategories = categories.filter((doc) => !doc.parent);
  const childCategories = categories.filter((doc) => doc.parent);

  for (const doc of rootCategories) {
    await prisma.category.create({
      data: {
        id: objectIdToUuid(toHexId(doc._id)),
        name: doc.name,
        slug: doc.slug,
        description: doc.description ?? null,
        image: doc.image ?? null,
        parentId: null,
        isActive: doc.isActive ?? true,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
    });
  }

  for (const doc of childCategories) {
    await prisma.category.create({
      data: {
        id: objectIdToUuid(toHexId(doc._id)),
        name: doc.name,
        slug: doc.slug,
        description: doc.description ?? null,
        image: doc.image ?? null,
        parentId: refId(doc.parent),
        isActive: doc.isActive ?? true,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
    });
  }
  console.log(`Migrated categories: ${categories.length}`);

  const products = await db.collection('products').find().toArray();
  if (products.length) {
    await prisma.product.createMany({
      data: products.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        name: doc.name,
        slug: doc.slug,
        description: doc.description,
        price: doc.price,
        compareAtPrice: doc.compareAtPrice ?? null,
        categoryId: refId(doc.category)!,
        subcategoryId: refId(doc.subcategory),
        images: asArray<string>(doc.images),
        colors: asArray<string>(doc.colors),
        sizes: asArray(doc.sizes) as Prisma.InputJsonValue,
        tags: asArray<string>(doc.tags),
        isFeatured: doc.isFeatured ?? false,
        isBestSeller: doc.isBestSeller ?? false,
        isSpecialCombo: doc.isSpecialCombo ?? false,
        isCrazyDeal: doc.isCrazyDeal ?? false,
        rating: doc.rating ?? 0,
        reviewCount: doc.reviewCount ?? 0,
        isActive: doc.isActive ?? true,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      })),
    });
    console.log(`Migrated products: ${products.length}`);
  }

  const coupons = await db.collection('coupons').find().toArray();
  if (coupons.length) {
    await prisma.coupon.createMany({
      data: coupons.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        code: doc.code,
        description: doc.description ?? null,
        discountType: doc.discountType,
        discountValue: doc.discountValue,
        minOrderAmount: doc.minOrderAmount ?? 0,
        maxDiscount: doc.maxDiscount ?? null,
        usageLimit: doc.usageLimit ?? 100,
        usedCount: doc.usedCount ?? 0,
        expiresAt: toDate(doc.expiresAt),
        isActive: doc.isActive ?? true,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      })),
    });
    console.log(`Migrated coupons: ${coupons.length}`);
  }

  const orders = await db.collection('orders').find().toArray();
  for (const doc of orders) {
    await prisma.order.create({
      data: {
        id: objectIdToUuid(toHexId(doc._id)),
        userId: refId(doc.user)!,
        orderNumber: doc.orderNumber,
        items: asArray<{ product: unknown; [key: string]: unknown }>(doc.items).map((item) => ({
          ...item,
          product: refId(item.product)!,
        })) as Prisma.InputJsonValue,
        shippingAddress: doc.shippingAddress as Prisma.InputJsonValue,
        paymentMethod: doc.paymentMethod,
        paymentStatus: doc.paymentStatus,
        orderStatus: doc.orderStatus,
        subtotal: doc.subtotal,
        discount: doc.discount ?? 0,
        shippingCost: doc.shippingCost ?? 0,
        total: doc.total,
        couponId: refId(doc.coupon),
        stripePaymentIntentId: doc.stripePaymentIntentId ?? null,
        stripeCheckoutSessionId: doc.stripeCheckoutSessionId ?? null,
        notes: doc.notes ?? null,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      },
    });
  }
  console.log(`Migrated orders: ${orders.length}`);

  const reviews = await db.collection('reviews').find().toArray();
  if (reviews.length) {
    await prisma.review.createMany({
      data: reviews.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        productId: refId(doc.product)!,
        userId: refId(doc.user)!,
        rating: doc.rating,
        title: doc.title ?? null,
        comment: doc.comment,
        status: doc.status,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      })),
    });
    console.log(`Migrated reviews: ${reviews.length}`);
  }

  const banners = await db.collection('banners').find().toArray();
  if (banners.length) {
    await prisma.banner.createMany({
      data: banners.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        title: doc.title,
        subtitle: doc.subtitle ?? null,
        image: doc.image,
        link: doc.link ?? null,
        position: doc.position ?? 0,
        isActive: doc.isActive ?? true,
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      })),
    });
    console.log(`Migrated banners: ${banners.length}`);
  }

  const sessions = await db.collection('sessions').find().toArray();
  if (sessions.length) {
    await prisma.session.createMany({
      data: sessions.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        userId: refId(doc.user)!,
        refreshTokenHash: doc.refreshTokenHash,
        familyId: doc.familyId,
        deviceName: doc.deviceName ?? 'Unknown device',
        ipAddress: doc.ipAddress ?? '',
        userAgent: doc.userAgent ?? '',
        expiresAt: toDate(doc.expiresAt),
        revokedAt: doc.revokedAt ? toDate(doc.revokedAt) : null,
        lastUsedAt: toDate(doc.lastUsedAt),
        createdAt: toDate(doc.createdAt),
        updatedAt: toDate(doc.updatedAt),
      })),
    });
    console.log(`Migrated sessions: ${sessions.length}`);
  }

  const auditLogs = await db.collection('auditlogs').find().toArray();
  if (auditLogs.length) {
    await prisma.auditLog.createMany({
      data: auditLogs.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        action: doc.action,
        userId: refId(doc.userId),
        ipAddress: doc.ipAddress ?? '',
        userAgent: doc.userAgent ?? '',
        metadata: doc.metadata ?? {},
        createdAt: toDate(doc.createdAt),
      })),
    });
    console.log(`Migrated audit logs: ${auditLogs.length}`);
  }

  const oauthStates = await db.collection('oauthstates').find().toArray();
  if (oauthStates.length) {
    await prisma.oAuthState.createMany({
      data: oauthStates.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        state: doc.state,
        provider: doc.provider,
        codeVerifier: doc.codeVerifier,
        redirectUri: doc.redirectUri,
        clientRedirect: doc.clientRedirect ?? '/',
        expiresAt: toDate(doc.expiresAt),
      })),
    });
    console.log(`Migrated oauth states: ${oauthStates.length}`);
  }

  const oauthExchanges = await db.collection('oauthexchanges').find().toArray();
  if (oauthExchanges.length) {
    await prisma.oAuthExchange.createMany({
      data: oauthExchanges.map((doc) => ({
        id: objectIdToUuid(toHexId(doc._id)),
        code: doc.code,
        refreshToken: doc.refreshToken,
        userId: refId(doc.userId)!,
        expiresAt: toDate(doc.expiresAt),
      })),
    });
    console.log(`Migrated oauth exchanges: ${oauthExchanges.length}`);
  }

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.review.count(),
    prisma.banner.count(),
    prisma.coupon.count(),
    prisma.session.count(),
    prisma.auditLog.count(),
  ]);

  console.log('\nSupabase row counts after migration:');
  console.log({
    users: counts[0],
    categories: counts[1],
    products: counts[2],
    orders: counts[3],
    reviews: counts[4],
    banners: counts[5],
    coupons: counts[6],
    sessions: counts[7],
    auditLogs: counts[8],
  });

  await mongo.close();
  await prisma.$disconnect();
};

migrate().catch(async (error) => {
  console.error('Migration failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
