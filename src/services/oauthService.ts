import { env, isOAuthProviderConfigured } from '../config/env';
import type { OAuthProvider } from '../models/User';
import { AppError } from '../utils/AppError';

export interface OAuthProfile {
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
  emailVerified: boolean;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
}

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  usePkce: boolean;
}

const getRedirectUri = (provider: OAuthProvider): string =>
  `${env.API_URL.replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;

const providerConfigs: Record<OAuthProvider, () => ProviderConfig | null> = {
  google: () => {
    if (!isOAuthProviderConfigured('google')) return null;
    return {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
      scopes: ['openid', 'email', 'profile'],
      usePkce: true,
    };
  },
  github: () => {
    if (!isOAuthProviderConfigured('github')) return null;
    return {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      scopes: ['read:user', 'user:email'],
      usePkce: false,
    };
  },
  microsoft: () => {
    if (!isOAuthProviderConfigured('microsoft')) return null;
    const tenant = env.MICROSOFT_TENANT_ID || 'common';
    return {
      authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      scopes: ['openid', 'email', 'profile', 'User.Read'],
      usePkce: true,
    };
  },
};

export const getProviderConfig = (provider: OAuthProvider): ProviderConfig => {
  const config = providerConfigs[provider]();
  if (!config) {
    throw new AppError(`${provider} OAuth is not configured`, 503);
  }
  return config;
};

export const buildAuthorizationUrl = (
  provider: OAuthProvider,
  state: string,
  codeChallenge?: string
): string => {
  const config = getProviderConfig(provider);
  const redirectUri = getRedirectUri(provider);

  const params = new URLSearchParams({
    client_id: getClientId(provider),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  });

  if (config.usePkce && codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  if (provider === 'microsoft') {
    params.set('response_mode', 'query');
  }

  return `${config.authUrl}?${params.toString()}`;
};

export const exchangeCodeForProfile = async (
  provider: OAuthProvider,
  code: string,
  codeVerifier?: string
): Promise<OAuthProfile> => {
  const config = getProviderConfig(provider);
  const redirectUri = getRedirectUri(provider);

  const tokenBody = new URLSearchParams({
    client_id: getClientId(provider),
    client_secret: getClientSecret(provider),
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  if (config.usePkce && codeVerifier) {
    tokenBody.set('code_verifier', codeVerifier);
  }

  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: tokenBody.toString(),
  });

  if (!tokenResponse.ok) {
    throw new AppError('Failed to exchange OAuth authorization code', 401);
  }

  const tokenData = (await tokenResponse.json()) as TokenResponse;

  return fetchProviderProfile(provider, tokenData.access_token, config.userInfoUrl);
};

const getClientId = (provider: OAuthProvider): string => {
  switch (provider) {
    case 'google':
      return env.GOOGLE_CLIENT_ID!;
    case 'github':
      return env.GITHUB_CLIENT_ID!;
    case 'microsoft':
      return env.MICROSOFT_CLIENT_ID!;
  }
};

const getClientSecret = (provider: OAuthProvider): string => {
  switch (provider) {
    case 'google':
      return env.GOOGLE_CLIENT_SECRET!;
    case 'github':
      return env.GITHUB_CLIENT_SECRET!;
    case 'microsoft':
      return env.MICROSOFT_CLIENT_SECRET!;
  }
};

const fetchProviderProfile = async (
  provider: OAuthProvider,
  accessToken: string,
  userInfoUrl: string
): Promise<OAuthProfile> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  if (provider === 'github') {
    headers['User-Agent'] = 'ecommerce-app';
  }

  const response = await fetch(userInfoUrl, { headers });
  if (!response.ok) {
    throw new AppError('Failed to fetch OAuth user profile', 401);
  }

  const data = (await response.json()) as Record<string, unknown>;

  switch (provider) {
    case 'google': {
      const googleData = data as {
        sub: string;
        email: string;
        name?: string;
        picture?: string;
        email_verified?: boolean;
      };
      return {
        providerId: googleData.sub,
        email: googleData.email,
        name: googleData.name || googleData.email.split('@')[0],
        avatar: googleData.picture,
        emailVerified: googleData.email_verified === true,
      };
    }
    case 'github': {
      const githubData = data as {
        id: number;
        email?: string;
        name?: string;
        login: string;
        avatar_url?: string;
      };
      let email = githubData.email;
      if (!email) {
        const emailResponse = await fetch('https://api.github.com/user/emails', { headers });
        const emails = (await emailResponse.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
        const primary = emails.find((e) => e.primary && e.verified);
        email = primary?.email || emails[0]?.email;
      }
      if (!email) throw new AppError('GitHub account has no verified email', 400);
      return {
        providerId: String(githubData.id),
        email,
        name: githubData.name || githubData.login,
        avatar: githubData.avatar_url,
        emailVerified: true,
      };
    }
    case 'microsoft': {
      const msData = data as {
        id: string;
        mail?: string;
        userPrincipalName?: string;
        displayName?: string;
      };
      return {
        providerId: msData.id,
        email: msData.mail || msData.userPrincipalName || '',
        name: msData.displayName || msData.mail?.split('@')[0] || 'User',
        avatar: undefined,
        emailVerified: true,
      };
    }
    default:
      throw new AppError('Unsupported OAuth provider', 400);
  }
};

export const getConfiguredOAuthProviders = (): OAuthProvider[] => {
  const providers: OAuthProvider[] = [];
  if (isOAuthProviderConfigured('google')) providers.push('google');
  if (isOAuthProviderConfigured('github')) providers.push('github');
  if (isOAuthProviderConfigured('microsoft')) providers.push('microsoft');
  return providers;
};

export const isValidOAuthProvider = (provider: string): provider is OAuthProvider =>
  ['google', 'github', 'microsoft'].includes(provider);

/** Returns an in-app path (e.g. `/` or `/products`), never a full origin URL. */
export const getSafeRedirectUrl = (redirectTo?: string): string => {
  const fallback = '/';
  if (!redirectTo?.trim()) return fallback;

  const clientOrigin = new URL(env.CLIENT_URL).origin;

  try {
    const url = new URL(redirectTo, env.CLIENT_URL);
    if (url.origin !== clientOrigin) return fallback;
    if (url.pathname.startsWith('//')) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith('/') ? path : fallback;
  } catch {
    if (redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
      return redirectTo;
    }
    return fallback;
  }
};
