import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISizeVariant {
  size: string;
  stock: number;
  sku?: string;
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  category: Types.ObjectId;
  subcategory?: Types.ObjectId;
  images: string[];
  colors: string[];
  sizes: ISizeVariant[];
  tags: string[];
  isFeatured: boolean;
  isBestSeller: boolean;
  isSpecialCombo: boolean;
  isCrazyDeal: boolean;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sizeVariantSchema = new Schema<ISizeVariant>({
  size: { type: String, required: true },
  stock: { type: Number, required: true, min: 0, default: 0 },
  sku: { type: String },
});

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategory: { type: Schema.Types.ObjectId, ref: 'Category' },
    images: [{ type: String }],
    colors: [{ type: String }],
    sizes: [sizeVariantSchema],
    tags: [{ type: String }],
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isSpecialCombo: { type: Boolean, default: false },
    isCrazyDeal: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, price: 1 });

export default mongoose.model<IProduct>('Product', productSchema);
