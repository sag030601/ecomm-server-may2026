import jwt, { SignOptions } from 'jsonwebtoken';
import { User } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { generateSecureToken, hashToken } from '../utils/crypto';
import type { AuthUser } from '../types/domain';
import { asAddressList, asOAuthAccountList } from '../types/json';

export interface TokenPayload {
  id: string;
  tokenVersion: number;
}

const parseDurationMs = (duration: string): number => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] || multipliers.d);
};

export const generateAccessToken = (user: Pick<User, 'id' | 'tokenVersion'>): string => {
  const payload: TokenPayload = {
    id: user.id,
    tokenVersion: user.tokenVersion,
  };

  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const verifyAccessToken = (token: string): TokenPayload =>
  jwt.verify(token, env.JWT_SECRET) as TokenPayload;

export const createSession = async (
  userId: string,
  reqMeta: { ipAddress: string; userAgent: string; deviceName?: string },
  familyId?: string
): Promise<{ refreshToken: string; sessionId: string }> => {
  const refreshToken = generateSecureToken(48);
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));

  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash,
      familyId: familyId || generateSecureToken(16),
      deviceName: reqMeta.deviceName || parseDeviceName(reqMeta.userAgent),
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
      expiresAt,
    },
  });

  return { refreshToken, sessionId: session.id };
};

export const rotateRefreshToken = async (
  refreshToken: string,
  reqMeta: { ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; user: User }> => {
  const refreshTokenHash = hashToken(refreshToken);
  const session = await prisma.session.findFirst({
    where: {
      refreshTokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!session) {
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  const { refreshToken: newRefreshToken } = await createSession(user.id, reqMeta, session.familyId);

  return {
    accessToken: generateAccessToken(user),
    refreshToken: newRefreshToken,
    user,
  };
};

export const revokeSession = async (refreshToken: string): Promise<void> => {
  const refreshTokenHash = hashToken(refreshToken);
  await prisma.session.updateMany({
    where: { refreshTokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const revokeAllUserSessions = async (userId: string): Promise<number> => {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
  return result.count;
};

export const revokeSessionById = async (sessionId: string, userId: string): Promise<boolean> => {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
};

export const getUserSessions = async (userId: string) =>
  prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      deviceName: true,
      ipAddress: true,
      userAgent: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { lastUsedAt: 'desc' },
  });

const parseDeviceName = (userAgent: string): string => {
  if (!userAgent) return 'Unknown device';
  if (/mobile/i.test(userAgent)) return 'Mobile device';
  if (/windows/i.test(userAgent)) return 'Windows device';
  if (/mac/i.test(userAgent)) return 'Mac device';
  if (/linux/i.test(userAgent)) return 'Linux device';
  return 'Unknown device';
};

export const sanitizeUser = (user: AuthUser | User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  addresses: asAddressList(user.addresses),
  avatar: user.avatar,
  emailVerified: user.emailVerified,
  oauthAccounts: asOAuthAccountList(user.oauthAccounts).map((a) => ({
    provider: a.provider,
    email: a.email,
    linkedAt: a.linkedAt,
  })),
});
