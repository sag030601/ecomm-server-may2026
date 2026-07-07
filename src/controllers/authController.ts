import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { User } from '@prisma/client';
import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, getRequestMeta } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import {
  createSession,
  generateAccessToken,
  rotateRefreshToken,
  revokeSession,
  revokeAllUserSessions,
  revokeSessionById,
  getUserSessions,
  sanitizeUser,
} from '../services/tokenService';
import { recordAudit } from '../services/auditService';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  getOAuthCallbackUrl,
} from '../utils/cookies';
import {
  buildAuthorizationUrl,
  exchangeCodeForProfile,
  getConfiguredOAuthProviders,
  getSafeRedirectUrl,
  isValidOAuthProvider,
} from '../services/oauthService';
import { generateOAuthState, generatePkcePair, generateSecureToken } from '../utils/crypto';
import type { OAuthProvider } from '../types/domain';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { toApiResponse } from '../utils/serialize';
import { asAddressList, asOAuthAccountList } from '../types/json';

const sendAuthResponse = async (user: User, res: Response, req: AuthRequest, statusCode = 200) => {
  const reqMeta = getRequestMeta(req);
  const { refreshToken } = await createSession(user.id, reqMeta);
  const accessToken = generateAccessToken(user);

  setRefreshTokenCookie(res, refreshToken);

  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    expiresIn: env.JWT_EXPIRES_IN,
    user: sanitizeUser(user),
  });
};

export const register = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, email, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw new AppError('Email already registered', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      emailVerified: false,
    },
  });

  await recordAudit('auth.register', {
    userId: user.id,
    ...getRequestMeta(req),
    metadata: { email: user.email },
  });

  await sendAuthResponse(user, res, req, 201);
});

export const login = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    await recordAudit('auth.login_failed', {
      ...getRequestMeta(req),
      metadata: { email },
    });
    throw new AppError('Invalid email or password', 401);
  }

  await recordAudit('auth.login', {
    userId: user.id,
    ...getRequestMeta(req),
  });

  await sendAuthResponse(user, res, req);
});

export const refresh = catchAsync(async (req: AuthRequest, res: Response) => {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) {
    throw new AppError('Refresh token required', 401);
  }

  try {
    const result = await rotateRefreshToken(refreshToken, getRequestMeta(req));
    setRefreshTokenCookie(res, result.refreshToken);

    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: env.JWT_EXPIRES_IN,
      user: sanitizeUser(result.user),
    });
  } catch {
    clearRefreshTokenCookie(res);
    throw new AppError('Invalid or expired refresh token', 401);
  }
});

export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (refreshToken) {
    await revokeSession(refreshToken);
  }

  if (req.user) {
    await recordAudit('auth.logout', {
      userId: req.user.id,
      ...getRequestMeta(req),
    });
  }

  clearRefreshTokenCookie(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const logoutAll = catchAsync(async (req: AuthRequest, res: Response) => {
  const count = await revokeAllUserSessions(req.user!.id);

  await recordAudit('auth.logout_all', {
    userId: req.user!.id,
    ...getRequestMeta(req),
    metadata: { sessionsRevoked: count },
  });

  clearRefreshTokenCookie(res);
  res.json({ success: true, message: `Logged out from ${count} device(s)` });
});

export const getSessions = catchAsync(async (req: AuthRequest, res: Response) => {
  const sessions = await getUserSessions(req.user!.id);
  res.json({
    success: true,
    sessions: toApiResponse(sessions),
  });
});

export const revokeSessionHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const revoked = await revokeSessionById(sessionId, req.user!.id);
  if (!revoked) throw new AppError('Session not found', 404);

  await recordAudit('auth.session_revoked', {
    userId: req.user!.id,
    ...getRequestMeta(req),
    metadata: { sessionId: req.params.sessionId },
  });

  res.json({ success: true, message: 'Session revoked' });
});

export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, user: sanitizeUser(req.user!) });
});

export const updateProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, phone } = req.body;
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name, phone },
    });
    res.json({ success: true, user: sanitizeUser(user) });
  } catch {
    throw new AppError('User not found', 404);
  }
});

export const addAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError('User not found', 404);

  const addresses = asAddressList(user.addresses).map((a) =>
    req.body.isDefault ? { ...a, isDefault: false } : a
  );

  addresses.push({ ...req.body, id: randomUUID() });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { addresses },
  });

  res.json({ success: true, user: sanitizeUser(updated) });
});

export const updateAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError('User not found', 404);

  const addressIndex = asAddressList(user.addresses).findIndex(
    (a) => a.id === req.params.addressId || (a as { _id?: string })._id === req.params.addressId
  );
  if (addressIndex === -1) throw new AppError('Address not found', 404);

  const addresses = asAddressList(user.addresses).map((addr, i) => {
    if (req.body.isDefault && i !== addressIndex) {
      return { ...addr, isDefault: false };
    }
    if (i === addressIndex) {
      return { ...addr, ...req.body, id: addr.id ?? randomUUID() };
    }
    return addr;
  });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { addresses },
  });

  res.json({ success: true, user: sanitizeUser(updated) });
});

export const deleteAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError('User not found', 404);

  const currentAddresses = asAddressList(user.addresses);
  const addresses = currentAddresses.filter(
    (a) => a.id !== req.params.addressId && (a as { _id?: string })._id !== req.params.addressId
  );
  if (addresses.length === currentAddresses.length) throw new AppError('Address not found', 404);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { addresses },
  });

  res.json({ success: true, user: sanitizeUser(updated) });
});

export const startOAuth = catchAsync(async (req: AuthRequest, res: Response) => {
  const provider = String(req.params.provider);
  if (!isValidOAuthProvider(provider)) {
    throw new AppError('Invalid OAuth provider', 400);
  }

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateOAuthState();
  const redirectUri = `${env.API_URL.replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;
  const clientRedirect = getSafeRedirectUrl(req.query.redirect as string | undefined);

  await prisma.oAuthState.create({
    data: {
      state,
      provider: provider as OAuthProvider,
      codeVerifier,
      redirectUri,
      clientRedirect,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const authUrl = buildAuthorizationUrl(provider, state, codeChallenge);
  res.redirect(authUrl);
});

export const oauthCallback = catchAsync(async (req: AuthRequest, res: Response) => {
  const provider = String(req.params.provider);
  if (!isValidOAuthProvider(provider)) {
    throw new AppError('Invalid OAuth provider', 400);
  }

  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error) {
    return res.redirect(`${getOAuthCallbackUrl()}?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${getOAuthCallbackUrl()}?error=missing_code`);
  }

  const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.provider !== provider) {
    return res.redirect(`${getOAuthCallbackUrl()}?error=invalid_state`);
  }
  await prisma.oAuthState.delete({ where: { state } });

  const profile = await exchangeCodeForProfile(provider, code, oauthState.codeVerifier);
  const user = await findOrCreateOAuthUser(provider as OAuthProvider, profile);

  const reqMeta = getRequestMeta(req);
  const { refreshToken } = await createSession(user.id, reqMeta);
  setRefreshTokenCookie(res, refreshToken);

  await recordAudit('auth.oauth_login', {
    userId: user.id,
    ...reqMeta,
    metadata: { provider },
  });

  const exchangeCode = generateSecureToken(24);
  await prisma.oAuthExchange.create({
    data: {
      code: exchangeCode,
      refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 1000),
    },
  });

  const safeRedirect = getSafeRedirectUrl(oauthState.clientRedirect);
  const callbackUrl = new URL(getOAuthCallbackUrl());
  callbackUrl.searchParams.set('code', exchangeCode);
  callbackUrl.searchParams.set('redirect', safeRedirect);

  res.redirect(callbackUrl.toString());
});

export const exchangeOAuthCode = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  if (!code) throw new AppError('Exchange code required', 400);

  const exchange = await prisma.oAuthExchange.findUnique({ where: { code } });
  if (!exchange || exchange.expiresAt <= new Date()) {
    throw new AppError('Invalid or expired exchange code', 401);
  }

  await prisma.oAuthExchange.delete({ where: { code } });

  const user = await prisma.user.findUnique({ where: { id: exchange.userId } });
  if (!user) throw new AppError('User not found', 404);

  setRefreshTokenCookie(res, exchange.refreshToken);

  res.json({
    success: true,
    accessToken: generateAccessToken(user),
    refreshToken: exchange.refreshToken,
    expiresIn: env.JWT_EXPIRES_IN,
    user: sanitizeUser(user),
  });
});

export const getOAuthProviders = catchAsync(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, providers: getConfiguredOAuthProviders() });
});

const findOrCreateOAuthUser = async (
  provider: OAuthProvider,
  profile: Awaited<ReturnType<typeof exchangeCodeForProfile>>
): Promise<User> => {
  const normalizedEmail = profile.email.toLowerCase();

  const usersWithOAuth = await prisma.user.findMany();
  let user =
    usersWithOAuth.find((u) =>
      asOAuthAccountList(u.oauthAccounts).some(
        (a) => a.provider === provider && a.providerId === profile.providerId
      )
    ) ?? null;

  if (user) {
    if (profile.avatar && !user.avatar) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { avatar: profile.avatar },
      });
    }
    return user;
  }

  user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (user) {
    if (!profile.emailVerified) {
      throw new AppError(
        'An account with this email already exists. Please verify your email or log in with password.',
        409
      );
    }

    return prisma.user.update({
      where: { id: user.id },
      data: {
        oauthAccounts: [
          ...asOAuthAccountList(user.oauthAccounts),
          {
            provider,
            providerId: profile.providerId,
            email: normalizedEmail,
            linkedAt: new Date(),
          },
        ],
        emailVerified: user.emailVerified || profile.emailVerified,
        avatar: user.avatar || profile.avatar,
      },
    });
  }

  return prisma.user.create({
    data: {
      name: profile.name,
      email: normalizedEmail,
      avatar: profile.avatar,
      emailVerified: profile.emailVerified,
      oauthAccounts: [
        {
          provider,
          providerId: profile.providerId,
          email: normalizedEmail,
          linkedAt: new Date(),
        },
      ],
    },
  });
};
