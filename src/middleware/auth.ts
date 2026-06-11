import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { verifyAccessToken, type TokenPayload } from '../services/tokenService';
import { hashToken } from '../utils/crypto';

export interface AuthRequest extends Request {
  user?: User;
  sessionId?: string;
}

export const protect = catchAsync(async (req: AuthRequest, _res: Response, next: NextFunction) => {
  let token: string | undefined;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Not authorized. Please log in.', 401));
  }

  let decoded: TokenPayload;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Access token expired. Please refresh your session.', 401));
    }
    return next(new AppError('Invalid access token.', 401));
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) {
    return next(new AppError('User no longer exists.', 401));
  }

  if (decoded.tokenVersion !== user.tokenVersion) {
    return next(new AppError('Session revoked. Please log in again.', 401));
  }

  req.user = user;
  next();
});

export const restrictTo = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

export const attachSessionFromRefresh = catchAsync(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const session = await prisma.session.findFirst({
        where: {
          refreshTokenHash: hashToken(refreshToken),
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (session) {
        req.sessionId = session.id;
      }
    }
    next();
  }
);

export const getRequestMeta = (req: Request) => ({
  ipAddress: req.ip || req.socket.remoteAddress || '',
  userAgent: req.get('user-agent') || '',
});
