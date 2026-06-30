const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload a file buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Cloudinary folder path
 * @param {object} options - Extra cloudinary upload options
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadToCloudinary = (buffer, folder = 'intellmeet/recordings', options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder,
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Delete a resource from Cloudinary by public_id.
 */
const deleteFromCloudinary = async (publicId, resourceType = 'video') => {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

/**
 * Generate a signed URL for a Cloudinary resource.
 */
const getSignedUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    secure: true,
    sign_url: true,
    type: 'authenticated',
    ...options,
  });
};

module.exports = { cloudinary, uploadToCloudinary, deleteFromCloudinary, getSignedUrl };
