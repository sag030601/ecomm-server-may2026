import { env } from './env';
import Stripe from 'stripe';
import { AppError } from '../utils/AppError';

let stripeInstance: Stripe | null = null;

const isStripeConfigured = (): boolean => {
  const key = env.STRIPE_SECRET_KEY;
  return !!key && key !== 'sk_test_your_stripe_secret_key';
};

export const getStripe = (): Stripe => {
  if (!isStripeConfigured()) {
    throw new AppError('Stripe is not configured. Add STRIPE_SECRET_KEY to your .env file.', 503);
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
