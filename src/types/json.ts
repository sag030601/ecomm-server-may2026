import type { OAuthProvider } from './domain';

export type AddressJson = {
  id?: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isDefault: boolean;
};

export type OAuthAccountJson = {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  linkedAt: Date | string;
};

export type ProductSizeJson = {
  size: string;
  stock: number;
  sku?: string | null;
};

export type OrderItemJson = {
  product: string;
  name: string;
  image: string;
  price: number;
  size: string;
  color?: string | null;
  quantity: number;
};

export type ShippingAddressJson = {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
};

export const asAddressList = (value: unknown): AddressJson[] =>
  Array.isArray(value) ? (value as AddressJson[]) : [];

export const asOAuthAccountList = (value: unknown): OAuthAccountJson[] =>
  Array.isArray(value) ? (value as OAuthAccountJson[]) : [];

export const asProductSizeList = (value: unknown): ProductSizeJson[] =>
  Array.isArray(value) ? (value as ProductSizeJson[]) : [];

export const asOrderItemList = (value: unknown): OrderItemJson[] =>
  Array.isArray(value) ? (value as OrderItemJson[]) : [];

export const asShippingAddress = (value: unknown): ShippingAddressJson =>
  (value ?? {}) as ShippingAddressJson;
