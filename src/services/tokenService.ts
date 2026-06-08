import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { generateSecureToken, hashToken } from '../utils/crypto';
import Session from '../models/Session';
import User, { IUser } from '../models/User';

export interface TokenPayload {
  id: string;
  tokenVersion: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
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

export const generateAccessToken = (user: InstanceType<typeof User>): string => {
  const payload: TokenPayload = {
    id: user._id.toString(),
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

  const session = await Session.create({
    user: userId,
    refreshTokenHash,
    familyId: familyId || generateSecureToken(16),
    deviceName: reqMeta.deviceName || parseDeviceName(reqMeta.userAgent),
    ipAddress: reqMeta.ipAddress,
    userAgent: reqMeta.userAgent,
    expiresAt,
  });

  return { refreshToken, sessionId: session._id.toString() };
};

export const rotateRefreshToken = async (
  refreshToken: string,
  reqMeta: { ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; user: InstanceType<typeof User> }> => {
  const refreshTokenHash = hashToken(refreshToken);
  const session = await Session.findOne({
    refreshTokenHash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  const user = await User.findById(session.user);
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  session.revokedAt = new Date();
  await session.save();

  const { refreshToken: newRefreshToken } = await createSession(
    user._id.toString(),
    reqMeta,
    session.familyId
  );

  return {
    accessToken: generateAccessToken(user),
    refreshToken: newRefreshToken,
    user,
  };
};

export const revokeSession = async (refreshToken: string): Promise<void> => {
  const refreshTokenHash = hashToken(refreshToken);
  await Session.updateOne(
    { refreshTokenHash, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
};

export const revokeAllUserSessions = async (userId: string): Promise<number> => {
  const result = await Session.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
  await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
  return result.modifiedCount;
};

export const revokeSessionById = async (sessionId: string, userId: string): Promise<boolean> => {
  const result = await Session.updateOne(
    { _id: sessionId, user: userId, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
  return result.modifiedCount > 0;
};

export const getUserSessions = async (userId: string) =>
  Session.find({
    user: userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .select('-refreshTokenHash')
    .sort({ lastUsedAt: -1 });

const parseDeviceName = (userAgent: string): string => {
  if (!userAgent) return 'Unknown device';
  if (/mobile/i.test(userAgent)) return 'Mobile device';
  if (/windows/i.test(userAgent)) return 'Windows device';
  if (/mac/i.test(userAgent)) return 'Mac device';
  if (/linux/i.test(userAgent)) return 'Linux device';
  return 'Unknown device';
};

export const sanitizeUser = (user: IUser) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  addresses: user.addresses,
  avatar: user.avatar,
  emailVerified: user.emailVerified,
  oauthAccounts: user.oauthAccounts?.map((a) => ({
    provider: a.provider,
    email: a.email,
    linkedAt: a.linkedAt,
  })),
});
