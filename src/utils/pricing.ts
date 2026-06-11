import { AppError } from './AppError';
import { logger } from './logger';

/** Coerce stored price to USD dollars (handles string inputs from JSON). */
export const toDollars = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new AppError('Invalid product price', 400);
  }
  return Math.round(num * 100) / 100;
};

/** Convert dollar amount to Stripe cents (single conversion point). */
export const toStripeCents = (amountDollars: number): number => {
  const dollars = toDollars(amountDollars);
  return Math.round(dollars * 100);
};

export const assertReasonableOrderTotal = (total: number): void => {
  if (!Number.isFinite(total) || total < 0) {
    throw new AppError('Invalid order total', 400);
  }
  if (total > 50_000) {
    throw new AppError('Order total exceeds the maximum allowed amount', 400);
  }
};

export interface PaymentCalculationLog {
  orderNumber: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  shippingCost: number;
  totalDollars: number;
  stripeCents: number;
}

export const logPaymentCalculation = (calc: PaymentCalculationLog): void => {
  logger.info('checkout-payment-calculation', { ...calc });
};

export const assertStripeAmountMatches = (
  orderTotalDollars: number,
  stripeCents: number
): void => {
  const expected = toStripeCents(orderTotalDollars);
  if (stripeCents !== expected) {
    throw new AppError('Stripe amount does not match order total', 500);
  }
};
