import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { isStripeEnabled, isDemoStripeMode } from '../config/stripe';
import { isCloudinaryConfigured } from '../config/cloudinary';
import { getConfiguredOAuthProviders } from '../services/oauthService';
import { checkDBHealth } from '../config/db';
import { env, isOAuthProviderConfigured } from '../config/env';

export const getPublicConfig = catchAsync(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    stripeEnabled: isStripeEnabled(),
    stripeDemoMode: isDemoStripeMode(),
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_')
      ? env.STRIPE_PUBLISHABLE_KEY
      : undefined,
    cloudinaryConfigured: isCloudinaryConfigured(),
    oauthProviders: getConfiguredOAuthProviders(),
    oauth: {
      google: isOAuthProviderConfigured('google'),
      github: isOAuthProviderConfigured('github'),
      microsoft: isOAuthProviderConfigured('microsoft'),
    },
    apiUrl: env.API_URL,
  });
});

export const getHealth = catchAsync(async (_req: Request, res: Response) => {
  const dbHealthy = await checkDBHealth();
  const status = dbHealthy ? 'healthy' : 'degraded';

  res.status(dbHealthy ? 200 : 503).json({
    success: dbHealthy,
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: dbHealthy ? 'up' : 'down',
    },
  });
});

export const getReadiness = catchAsync(async (_req: Request, res: Response) => {
  const dbHealthy = await checkDBHealth();
  if (!dbHealthy) {
    return res.status(503).json({ success: false, ready: false });
  }
  res.json({ success: true, ready: true });
});
