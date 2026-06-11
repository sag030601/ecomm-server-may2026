import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { catchAsync } from '../utils/catchAsync';
import { getStripe } from '../config/stripe';
import { finalizePaidOrder } from '../services/orderPaymentService';
import { isCloudinaryConfigured } from '../config/cloudinary';
import { uploadFromBuffer } from '../utils/cloudinaryUpload';
import { AppError } from '../utils/AppError';

export const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const orderId = paymentIntent.metadata.orderId;

    if (orderId) {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (order && order.paymentStatus !== 'paid') {
        await finalizePaidOrder(order);
      }
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.client_reference_id || session.metadata?.orderId;

    if (orderId) {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (order && order.paymentStatus !== 'paid') {
        await prisma.order.update({
          where: { id: order.id },
          data: { stripeCheckoutSessionId: session.id },
        });
        await finalizePaidOrder(order);
      }
    }
  }

  res.json({ received: true });
});

export const uploadImage = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  if (!isCloudinaryConfigured()) {
    throw new AppError(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env',
      503
    );
  }

  const url = await uploadFromBuffer(req.file.buffer);
  res.json({ success: true, url });
});
