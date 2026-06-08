import mongoose, { Document, Schema } from 'mongoose';
import type { OAuthProvider } from './User';

export interface IOAuthState extends Document {
  state: string;
  provider: OAuthProvider;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: Date;
}

const oauthStateSchema = new Schema<IOAuthState>({
  state: { type: String, required: true, unique: true, index: true },
  provider: { type: String, enum: ['google', 'github', 'microsoft'], required: true },
  codeVerifier: { type: String, required: true },
  redirectUri: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export default mongoose.model<IOAuthState>('OAuthState', oauthStateSchema);
