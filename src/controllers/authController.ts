import bcrypt from 'bcryptjs';
import { Response } from 'express';
import User from '../models/User';
import OAuthState from '../models/OAuthState';
import OAuthExchange from '../models/OAuthExchange';
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
import type { OAuthProvider } from '../models/User';
import { env } from '../config/env';

const sendAuthResponse = async (
  user: InstanceType<typeof User>,
  res: Response,
  req: AuthRequest,
  statusCode = 200
) => {
  const reqMeta = getRequestMeta(req);
  const { refreshToken } = await createSession(user._id.toString(), reqMeta);
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

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('Email already registered', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    emailVerified: false,
  });

  await recordAudit('auth.register', {
    userId: user._id.toString(),
    ...getRequestMeta(req),
    metadata: { email: user.email },
  });

  await sendAuthResponse(user, res, req, 201);
});

export const login = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    await recordAudit('auth.login_failed', {
      ...getRequestMeta(req),
      metadata: { email },
    });
    throw new AppError('Invalid email or password', 401);
  }

  await recordAudit('auth.login', {
    userId: user._id.toString(),
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
      userId: req.user._id.toString(),
      ...getRequestMeta(req),
    });
  }

  clearRefreshTokenCookie(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const logoutAll = catchAsync(async (req: AuthRequest, res: Response) => {
  const count = await revokeAllUserSessions(req.user!._id.toString());

  await recordAudit('auth.logout_all', {
    userId: req.user!._id.toString(),
    ...getRequestMeta(req),
    metadata: { sessionsRevoked: count },
  });

  clearRefreshTokenCookie(res);
  res.json({ success: true, message: `Logged out from ${count} device(s)` });
});

export const getSessions = catchAsync(async (req: AuthRequest, res: Response) => {
  const sessions = await getUserSessions(req.user!._id.toString());
  res.json({
    success: true,
    sessions: sessions.map((s) => ({
      id: s._id,
      deviceName: s.deviceName,
      ipAddress: s.ipAddress,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    })),
  });
});

export const revokeSessionHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const revoked = await revokeSessionById(sessionId, req.user!._id.toString());
  if (!revoked) throw new AppError('Session not found', 404);

  await recordAudit('auth.session_revoked', {
    userId: req.user!._id.toString(),
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
  const user = await User.findByIdAndUpdate(
    req.user!._id,
    { name, phone },
    { new: true, runValidators: true }
  );
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, user: sanitizeUser(user) });
});

export const addAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new AppError('User not found', 404);

  if (req.body.isDefault) {
    user.addresses.forEach((addr) => { addr.isDefault = false; });
  }

  user.addresses.push(req.body);
  await user.save();
  res.json({ success: true, user: sanitizeUser(user) });
});

export const updateAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new AppError('User not found', 404);

  const address = user.addresses.find((a) => a._id?.toString() === req.params.addressId);
  if (!address) throw new AppError('Address not found', 404);

  if (req.body.isDefault) {
    user.addresses.forEach((addr) => { addr.isDefault = false; });
  }

  Object.assign(address, req.body);
  await user.save();
  res.json({ success: true, user: sanitizeUser(user) });
});

export const deleteAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new AppError('User not found', 404);

  const addressIndex = user.addresses.findIndex((a) => a._id?.toString() === req.params.addressId);
  if (addressIndex === -1) throw new AppError('Address not found', 404);

  user.addresses.splice(addressIndex, 1);
  await user.save();
  res.json({ success: true, user: sanitizeUser(user) });
});

export const getAllUsers = catchAsync(async (_req: AuthRequest, res: Response) => {
  const users = await User.find({ role: 'customer' }).select('-password').sort({ createdAt: -1 });
  res.json({ success: true, users, count: users.length });
});

export const getUserById = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, user });
});

export const startOAuth = catchAsync(async (req: AuthRequest, res: Response) => {
  const provider = String(req.params.provider);
  if (!isValidOAuthProvider(provider)) {
    throw new AppError('Invalid OAuth provider', 400);
  }

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateOAuthState();
  const redirectUri = `${env.API_URL.replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;

  await OAuthState.create({
    state,
    provider,
    codeVerifier,
    redirectUri,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
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

  const oauthState = await OAuthState.findOneAndDelete({ state, provider });
  if (!oauthState) {
    return res.redirect(`${getOAuthCallbackUrl()}?error=invalid_state`);
  }

  const profile = await exchangeCodeForProfile(provider, code, oauthState.codeVerifier);
  const user = await findOrCreateOAuthUser(provider, profile);

  const reqMeta = getRequestMeta(req);
  const { refreshToken } = await createSession(user._id.toString(), reqMeta);
  const accessToken = generateAccessToken(user);

  setRefreshTokenCookie(res, refreshToken);

  await recordAudit('auth.oauth_login', {
    userId: user._id.toString(),
    ...reqMeta,
    metadata: { provider },
  });

  const exchangeCode = generateSecureToken(24);
  await OAuthExchange.create({
    code: exchangeCode,
    refreshToken,
    userId: user._id,
    expiresAt: new Date(Date.now() + 60 * 1000),
  });

  const safeRedirect = getSafeRedirectUrl(req.query.redirect as string | undefined);
  const callbackUrl = new URL(getOAuthCallbackUrl());
  callbackUrl.searchParams.set('code', exchangeCode);
  callbackUrl.searchParams.set('redirect', safeRedirect);

  res.redirect(callbackUrl.toString());
});

export const exchangeOAuthCode = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  if (!code) throw new AppError('Exchange code required', 400);

  const exchange = await OAuthExchange.findOneAndDelete({
    code,
    expiresAt: { $gt: new Date() },
  });

  if (!exchange) throw new AppError('Invalid or expired exchange code', 401);

  const user = await User.findById(exchange.userId);
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
): Promise<InstanceType<typeof User>> => {
  const normalizedEmail = profile.email.toLowerCase();

  let user = await User.findOne({
    oauthAccounts: { $elemMatch: { provider, providerId: profile.providerId } },
  });

  if (user) {
    if (profile.avatar && !user.avatar) {
      user.avatar = profile.avatar;
      await user.save();
    }
    return user;
  }

  user = await User.findOne({ email: normalizedEmail });

  if (user) {
    if (!profile.emailVerified) {
      throw new AppError(
        'An account with this email already exists. Please verify your email or log in with password.',
        409
      );
    }

    user.oauthAccounts.push({
      provider,
      providerId: profile.providerId,
      email: normalizedEmail,
      linkedAt: new Date(),
    });
    user.emailVerified = user.emailVerified || profile.emailVerified;
    if (profile.avatar && !user.avatar) user.avatar = profile.avatar;
    await user.save();
    return user;
  }

  user = await User.create({
    name: profile.name,
    email: normalizedEmail,
    avatar: profile.avatar,
    emailVerified: profile.emailVerified,
    oauthAccounts: [{
      provider,
      providerId: profile.providerId,
      email: normalizedEmail,
      linkedAt: new Date(),
    }],
  });

  return user;
};
