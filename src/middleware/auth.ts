import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { verifyAccessToken, type TokenPayload } from '../services/tokenService';
import Session from '../models/Session';

export interface AuthRequest extends Request {
  user?: IUser;
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

  const user = await User.findById(decoded.id);
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
      const { hashToken } = await import('../utils/crypto');
      const session = await Session.findOne({
        refreshTokenHash: hashToken(refreshToken),
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      });
      if (session) {
        req.sessionId = session._id.toString();
      }
    }
    next();
  }
);

export const getRequestMeta = (req: Request) => ({
  ipAddress: req.ip || req.socket.remoteAddress || '',
  userAgent: req.get('user-agent') || '',
});
