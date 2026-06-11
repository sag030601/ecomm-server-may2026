import { env } from '../config/env';

export const buildPaymentLinkUrl = (orderId: string, email?: string): string => {
  const url = new URL(env.STRIPE_PAYMENT_LINK_URL!);
  url.searchParams.set('client_reference_id', orderId);
  if (email) {
    url.searchParams.set('prefilled_email', email);
  }
  return url.toString();
};
