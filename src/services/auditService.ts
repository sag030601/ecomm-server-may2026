import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export const recordAudit = async (
  action: string,
  meta: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: meta.userId,
        ipAddress: meta.ipAddress || '',
        userAgent: meta.userAgent || '',
        metadata: (meta.metadata || {}) as Prisma.InputJsonValue,
      },
    });
    logger.info(`Audit: ${action}`, { userId: meta.userId, ...meta.metadata });
  } catch (error) {
    logger.error('Failed to record audit log', {
      action,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
