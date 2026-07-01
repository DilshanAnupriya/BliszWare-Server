import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/** True only when all three Cloudinary credentials are present. */
export const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

/**
 * Upload an in-memory file buffer to Cloudinary.
 * @param {Buffer} buffer  raw file bytes (from multer memoryStorage)
 * @param {string} folder  destination folder in your Cloudinary account
 */
export const uploadBuffer = (buffer, folder = 'shoe-shop') =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });

export const deleteImage = (publicId) => cloudinary.uploader.destroy(publicId);

export default cloudinary;
