import multer from 'multer';

/**
 * In-memory upload handler. Files are kept as buffers and streamed straight
 * to Cloudinary (see config/cloudinary.js), so nothing touches local disk.
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (/^image\/(jpeg|jpg|png|webp|avif|gif)$/.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB per image
});

// Separate handler for CSV bulk-import uploads.
const csvFilter = (req, file, cb) => {
  if (/csv|excel|text\/plain|octet-stream/.test(file.mimetype) || /\.csv$/i.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Please upload a .csv file'), false);
  }
};

export const uploadCsv = multer({
  storage,
  fileFilter: csvFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export default upload;
