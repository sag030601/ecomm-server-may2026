import mongoose, { Document, Schema } from 'mongoose';

export type OAuthProvider = 'google' | 'github' | 'microsoft';

export interface IOAuthAccount {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  linkedAt: Date;
}

export interface IAddress {
  _id?: mongoose.Types.ObjectId;
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isDefault: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: 'customer' | 'admin';
  phone?: string;
  addresses: IAddress[];
  avatar?: string;
  emailVerified: boolean;
  oauthAccounts: IOAuthAccount[];
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const oauthAccountSchema = new Schema<IOAuthAccount>({
  provider: { type: String, enum: ['google', 'github', 'microsoft'], required: true },
  providerId: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  linkedAt: { type: Date, default: Date.now },
});

const addressSchema = new Schema<IAddress>({
  label: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, required: true, default: 'US' },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, minlength: 8, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    phone: { type: String },
    addresses: [addressSchema],
    avatar: { type: String },
    emailVerified: { type: Boolean, default: false },
    oauthAccounts: [oauthAccountSchema],
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ 'oauthAccounts.provider': 1, 'oauthAccounts.providerId': 1 });

export default mongoose.model<IUser>('User', userSchema);
