import { env } from './env';
import Stripe from 'stripe';
import { AppError } from '../utils/AppError';

let stripeInstance: Stripe | null = null;

const isValidStripeSecretKey = (key: string | undefined): boolean => {
  if (!key) return false;
  if (key === 'sk_test_your_stripe_secret_key') return false;
  return /^(sk|rk)_(test|live)_/.test(key);
};

const isStripeApiConfigured = (): boolean => isValidStripeSecretKey(env.STRIPE_SECRET_KEY);

const isPaymentLinkConfigured = (): boolean => {
  const url = env.STRIPE_PAYMENT_LINK_URL;
  return !!url && url.includes('buy.stripe.com/');
};

const isStripeConfigured = (): boolean => isStripeApiConfigured() || isPaymentLinkConfigured();

export const getStripe = (): Stripe => {
  if (!isStripeApiConfigured()) {
    throw new AppError('Stripe API is not configured. Add STRIPE_SECRET_KEY to your .env file.', 503);
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia',
    });
  }

  return stripeInstance;
};

export const isStripeEnabled = isStripeConfigured;

export const isDemoStripeMode = (): boolean => !isStripeConfigured();

export { isStripeApiConfigured, isPaymentLinkConfigured };
