import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Check if we're in production (Vercel Blob available)
const isProduction = !!process.env.BLOB_READ_WRITE_TOKEN;

// Upload directory for local development
const UPLOAD_DIR = path.join(process.cwd(), 'data', 'photos');

// Ensure upload directory exists (local only)
if (!isProduction && !fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer storage for local development
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  },
});

// File filter - only allow images
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeValid = allowedTypes.test(file.mimetype);

  if (extValid && mimeValid) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, GIF, WebP) are allowed'));
  }
};

// Multer for local development (memory storage for production to pass to Blob)
const localUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

// POST /api/upload - single file upload
router.post('/', async (req: Request, res: Response) => {
  if (isProduction) {
    // Production: use Vercel Blob
    memoryUpload.single('photo')(req, res, async (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded or invalid file type' });
        return;
      }

      try {
        // Dynamic import for Vercel Blob (only used in production)
        const { put } = await import('@vercel/blob');

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(req.file.originalname).toLowerCase();
        const filename = `photos/${uniqueSuffix}${ext}`;

        const blob = await put(filename, req.file.buffer, {
          access: 'public',
          contentType: req.file.mimetype,
        });

        res.json({ path: blob.url });
      } catch (error) {
        console.error('Vercel Blob upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
      }
    });
  } else {
    // Local development: use multer disk storage
    localUpload.single('photo')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded or invalid file type' });
        return;
      }

      res.json({ path: `/photos/${req.file.filename}` });
    });
  }
});

export default router;
