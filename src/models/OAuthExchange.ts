import mongoose, { Document, Schema } from 'mongoose';

export interface IOAuthExchange extends Document {
  code: string;
  refreshToken: string;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
}

const oauthExchangeSchema = new Schema<IOAuthExchange>({
  code: { type: String, required: true, unique: true, index: true },
  refreshToken: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export default mongoose.model<IOAuthExchange>('OAuthExchange', oauthExchangeSchema);
