import Stripe from 'stripe';
import { env } from '../config/env';

export interface CheckoutSessionInput {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  stripeCents: number;
  itemSummary: string;
  metadata: Record<string, string>;
}

/** Stripe params not yet in all SDK type versions (Link wallet disable). */
type CheckoutSessionCreateParams = Stripe.Checkout.SessionCreateParams & {
  wallet_options?: {
    link?: {
      display?: 'auto' | 'never';
    };
  };
};

export const createStripeCheckoutSession = (
  stripe: Stripe,
  input: CheckoutSessionInput
): Promise<Stripe.Checkout.Session> => {
  const params: CheckoutSessionCreateParams = {
    mode: 'payment',
    payment_method_types: ['card'],
    adaptive_pricing: { enabled: false },
    locale: 'en',
    customer_email: input.customerEmail,
    phone_number_collection: { enabled: false },
    payment_method_options: {
      card: {
        request_three_d_secure: 'automatic',
      },
    },
    wallet_options: {
      link: { display: 'never' },
    },
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Order ${input.orderNumber}`,
            description: input.itemSummary.slice(0, 500),
          },
          unit_amount: input.stripeCents,
        },
        quantity: 1,
      },
    ],
    client_reference_id: input.orderId,
    metadata: input.metadata,
    success_url: `${env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_URL}/checkout?cancelled=true`,
  };

  return stripe.checkout.sessions.create(params);
};
