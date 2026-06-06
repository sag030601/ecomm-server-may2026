import { Request, Response } from 'express';
import Order from '../models/Order';
import Product from '../models/Product';
import Coupon from '../models/Coupon';
import { catchAsync } from '../utils/catchAsync';
import { getStripe } from '../config/stripe';

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
      const order = await Order.findById(orderId);
      if (order && order.paymentStatus !== 'paid') {
        for (const item of order.items) {
          await Product.updateOne(
            { _id: item.product, 'sizes.size': item.size },
            { $inc: { 'sizes.$.stock': -item.quantity } }
          );
        }

        if (order.coupon) {
          await Coupon.updateOne({ _id: order.coupon }, { $inc: { usedCount: 1 } });
        }

        order.paymentStatus = 'paid';
        order.orderStatus = 'confirmed';
        await order.save();
      }
    }
  }

  res.json({ received: true });
});

export const uploadImage = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const cloudinary = (await import('../config/cloudinary')).default;

  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'ecommerce' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result as { secure_url: string });
      }
    );
    stream.end(req.file!.buffer);
  });

  res.json({ success: true, url: result.secure_url });
});
