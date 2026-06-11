import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export const connectDB = async (): Promise<void> => {
  await prisma.$connect();
  logger.info('Database connected (Prisma)');
};

export const disconnectDB = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info('Database disconnected');
};

export const checkDBHealth = async (): Promise<boolean> => {
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
};
