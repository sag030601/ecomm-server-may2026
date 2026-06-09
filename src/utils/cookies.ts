import { Response } from 'express';
import { env, isProduction } from '../config/env';

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_PATH = '/api/auth';

export const setRefreshTokenCookie = (res: Response, refreshToken: string): void => {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    // Lax allows the cookie to be set on OAuth redirect responses; Strict blocks
    // cross-origin API calls between CLIENT_URL and API_URL in local development.
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: REFRESH_PATH,
  });
};

export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: REFRESH_PATH,
  });
};

export const getRefreshTokenFromRequest = (req: { cookies?: Record<string, string>; body?: { refreshToken?: string } }): string | undefined =>
  req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;

export const getOAuthCallbackUrl = (): string => `${env.CLIENT_URL}/auth/callback`;
