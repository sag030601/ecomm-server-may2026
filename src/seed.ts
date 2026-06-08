import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from './models/User';
import Category from './models/Category';
import Product from './models/Product';
import Banner from './models/Banner';
import Coupon from './models/Coupon';
import { uploadFromUrl } from './utils/cloudinaryUpload';

dotenv.config();

const seedImage = async (url: string) => uploadFromUrl(url, 'ecommerce/seed');

const seed = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Banner.deleteMany({}),
    Coupon.deleteMany({}),
  ]);

  const adminPassword = await bcrypt.hash('admin123', 12);
  const customerPassword = await bcrypt.hash('customer123', 12);

  await User.create([
    { name: 'Admin User', email: 'admin@store.com', password: adminPassword, role: 'admin', emailVerified: true },
    { name: 'John Doe', email: 'john@example.com', password: customerPassword, role: 'customer', emailVerified: true },
  ]);

  const categories = await Category.insertMany([
    {
      name: 'Men',
      slug: 'men',
      description: 'Men\'s fashion',
      image: await seedImage('https://images.unsplash.com/photo-1617137968427-85924c800a41?w=600'),
    },
    {
      name: 'Women',
      slug: 'women',
      description: 'Women\'s fashion',
      image: await seedImage('https://images.unsplash.com/photo-1483985988355-763728e3685b?w=600'),
    },
    {
      name: 'Accessories',
      slug: 'accessories',
      description: 'Fashion accessories',
      image: await seedImage('https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600'),
    },
    {
      name: 'Footwear',
      slug: 'footwear',
      description: 'Shoes and sneakers',
      image: await seedImage('https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600'),
    },
  ]);

  const subcategories = await Category.insertMany([
    { name: 'T-Shirts', slug: 't-shirts', parent: categories[0]._id },
    { name: 'Jeans', slug: 'jeans', parent: categories[0]._id },
    { name: 'Dresses', slug: 'dresses', parent: categories[1]._id },
    { name: 'Handbags', slug: 'handbags', parent: categories[2]._id },
  ]);

  const products = [
    {
      name: 'Classic Cotton Tee',
      slug: 'classic-cotton-tee',
      description: 'Premium 100% cotton t-shirt with a relaxed fit. Perfect for everyday wear.',
      price: 29.99,
      compareAtPrice: 39.99,
      category: categories[0]._id,
      subcategory: subcategories[0]._id,
      images: [await seedImage('https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800')],
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
      category: categories[0]._id,
      subcategory: subcategories[1]._id,
      images: [await seedImage('https://images.unsplash.com/photo-1542272604-787c3835535d?w=800')],
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
      category: categories[1]._id,
      subcategory: subcategories[2]._id,
      images: [await seedImage('https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800')],
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
      category: categories[2]._id,
      subcategory: subcategories[3]._id,
      images: [await seedImage('https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800')],
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
      category: categories[3]._id,
      images: [await seedImage('https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800')],
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
      category: categories[0]._id,
      subcategory: subcategories[0]._id,
      images: [await seedImage('https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800')],
      colors: ['Gray', 'Black', 'Navy'],
      sizes: [{ size: 'S', stock: 40 }, { size: 'M', stock: 55 }, { size: 'L', stock: 50 }, { size: 'XL', stock: 30 }],
      isSpecialCombo: true,
      rating: 4.4,
      reviewCount: 94,
    },
  ];

  await Product.insertMany(products);

  await Banner.insertMany([
    {
      title: 'Summer Collection 2026',
      subtitle: 'Up to 50% off on selected items',
      image: await seedImage('https://images.unsplash.com/photo-1441984904996-e0b6a68737d2?w=1600'),
      link: '/products',
      position: 0,
    },
    {
      title: 'New Arrivals',
      subtitle: 'Discover the latest trends',
      image: await seedImage('https://images.unsplash.com/photo-1483985988355-763728e3685b?w=1600'),
      link: '/products?sort=newest',
      position: 1,
    },
  ]);

  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 3);

  await Coupon.insertMany([
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
  ]);

  console.log('Seed data created successfully!');
  console.log('Admin: admin@store.com / admin123');
  console.log('Customer: john@example.com / customer123');
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
