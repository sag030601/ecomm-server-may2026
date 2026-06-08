import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

const isPlaceholder = (value: string | undefined): boolean =>
  !value || ['your_cloud_name', 'your_api_key', 'your_api_secret', ''].includes(value);

export const isCloudinaryConfigured = (): boolean =>
  !isPlaceholder(env.CLOUDINARY_CLOUD_NAME) &&
  !isPlaceholder(env.CLOUDINARY_API_KEY) &&
  !isPlaceholder(env.CLOUDINARY_API_SECRET);

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

export default cloudinary;
