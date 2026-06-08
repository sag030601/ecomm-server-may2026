import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  user: mongoose.Types.ObjectId;
  refreshTokenHash: string;
  familyId: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    deviceName: { type: String, default: 'Unknown device' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

sessionSchema.index({ user: 1, revokedAt: 1 });

export default mongoose.model<ISession>('Session', sessionSchema);
