export type OAuthProvider = 'google' | 'github' | 'microsoft';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  password?: string | null;
  role: 'customer' | 'admin';
  phone?: string | null;
  avatar?: string | null;
  emailVerified: boolean;
  tokenVersion: number;
  addresses: Array<{
    label: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    isDefault: boolean;
  }>;
  oauthAccounts: Array<{
    provider: OAuthProvider;
    providerId: string;
    email: string;
    linkedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
