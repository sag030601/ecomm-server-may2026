import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary';

export const uploadFromUrl = async (url: string, folder = 'ecommerce'): Promise<string> => {
  if (!isCloudinaryConfigured()) return url;

  const result = await cloudinary.uploader.upload(url, { folder });
  return result.secure_url;
};

export const uploadFromBuffer = async (
  buffer: Buffer,
  folder = 'ecommerce'
): Promise<string> => {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
      if (error) reject(error);
      else resolve(result!.secure_url);
    });
    stream.end(buffer);
  });
};
