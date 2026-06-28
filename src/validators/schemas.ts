import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/[A-Za-z]/, 'Password must contain a letter')
      .regex(/[0-9]/, 'Password must contain a number'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
  }),
});

export const addressSchema = z.object({
  body: z.object({
    label: z.string().min(1),
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
    country: z.string().default('US'),
    isDefault: z.boolean().optional(),
  }),
});

export const productSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    price: z.number().min(0),
    compareAtPrice: z.number().min(0).optional(),
    category: z.string(),
    subcategory: z.string().optional(),
    images: z.array(z.string()).optional(),
    colors: z.array(z.string()).optional(),
    sizes: z.array(z.object({
      size: z.string(),
      stock: z.number().min(0),
      sku: z.string().optional(),
    })).optional(),
    tags: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional(),
    isBestSeller: z.boolean().optional(),
    isSpecialCombo: z.boolean().optional(),
    isCrazyDeal: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const orderSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      product: z.string(),
      size: z.string(),
      color: z.string().optional(),
      quantity: z.number().min(1),
    })).min(1),
    shippingAddress: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      country: z.string().default('US'),
    }),
    paymentMethod: z.literal('stripe'),
    couponCode: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const categorySchema = z.object({
  body: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    image: z.string().optional(),
    parent: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});

export const couponSchema = z.object({
  body: z.object({
    code: z.string().min(1),
    description: z.string().optional(),
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: z.number().min(0),
    minOrderAmount: z.number().min(0).optional(),
    maxDiscount: z.number().min(0).optional(),
    usageLimit: z.number().min(1).optional(),
    expiresAt: z.string(),
    isActive: z.boolean().optional(),
  }),
});

export const reviewSchema = z.object({
  body: z.object({
    product: z.string(),
    rating: z.number().min(1).max(5),
    title: z.string().optional(),
    comment: z.string().min(1),
  }),
});

export const bannerSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    image: z.string().min(1),
    link: z.string().optional(),
    position: z.number().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const validateCouponSchema = z.object({
  body: z.object({
    code: z.string().min(1),
    subtotal: z.number().min(0),
  }),
});
