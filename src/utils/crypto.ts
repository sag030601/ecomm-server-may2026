import crypto from 'crypto';

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export const generateSecureToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString('hex');

export const generatePkcePair = (): { codeVerifier: string; codeChallenge: string } => {
  const codeVerifier = generateSecureToken(32);
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
};

export const generateOAuthState = (): string => generateSecureToken(16);
