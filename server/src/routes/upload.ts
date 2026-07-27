import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { netlifyBlobsEnabled, putObject } from '../lib/storage';

const router = Router();

// Check if we're in production (Vercel Blob available)
const isProduction = !!process.env.BLOB_READ_WRITE_TOKEN;

// Upload directories for local development
const UPLOAD_DIR = path.join(process.cwd(), 'data', 'photos');
const FILES_DIR = path.join(process.cwd(), 'data', 'files');

// Ensure upload directories exist (true local-disk mode only). Skip when a cloud
// store is active — Vercel Blob (isProduction) OR Netlify Blobs — since Netlify's
// filesystem is read-only and mkdir would crash the function at module load.
if (!isProduction && !netlifyBlobsEnabled()) {
  for (const dir of [UPLOAD_DIR, FILES_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
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
  if (netlifyBlobsEnabled()) {
    // Netlify: store the buffer in Netlify Blobs, return a RELATIVE /photos path
    // (matches local-dev format + the SW photos-cache rule; served via routes/media.ts).
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
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(req.file.originalname).toLowerCase();
        const filename = `${uniqueSuffix}${ext}`;
        await putObject(`photos/${filename}`, req.file.buffer, req.file.mimetype);
        res.json({ path: `/photos/${filename}` });
      } catch (error) {
        console.error('Netlify Blobs upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
      }
    });
  } else if (isProduction) {
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

// ─── Generic file upload (meeting attachments) ──────────────
// Broader type allow-list than photos; 4MB cap keeps us under Vercel's ~4.5MB
// serverless request-body limit. Larger files would need client-direct Blob
// uploads — not worth it yet for a single user.

const FILE_EXT_ALLOWED = /\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|pptx?|txt|csv|md|json|eml|msg|zip)$/i;
const FILE_SIZE_LIMIT = 4 * 1024 * 1024;

const fileFilterGeneric = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (FILE_EXT_ALLOWED.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed (images, PDF, Office docs, text, zip)'));
  }
};

const localFileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, FILES_DIR),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    },
  }),
  limits: { fileSize: FILE_SIZE_LIMIT },
  fileFilter: fileFilterGeneric,
});

const memoryFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_SIZE_LIMIT },
  fileFilter: fileFilterGeneric,
});

// POST /api/upload/file - single generic file upload
// Returns { path, name, mimeType, size } for the attachment row.
router.post('/file', async (req: Request, res: Response) => {
  if (netlifyBlobsEnabled()) {
    // Netlify: store the buffer in Netlify Blobs, return a RELATIVE /files path
    // (served via routes/media.ts).
    memoryFileUpload.single('file')(req, res, async (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded or invalid file type' });
        return;
      }
      try {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(req.file.originalname).toLowerCase();
        const filename = `${uniqueSuffix}${ext}`;
        await putObject(`files/${filename}`, req.file.buffer, req.file.mimetype);
        res.json({
          path: `/files/${filename}`,
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });
      } catch (error) {
        console.error('Netlify Blobs upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
      }
    });
  } else if (isProduction) {
    memoryFileUpload.single('file')(req, res, async (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded or invalid file type' });
        return;
      }
      try {
        const { put } = await import('@vercel/blob');
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(req.file.originalname).toLowerCase();
        const blob = await put(`files/${uniqueSuffix}${ext}`, req.file.buffer, {
          access: 'public',
          contentType: req.file.mimetype,
        });
        res.json({
          path: blob.url,
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });
      } catch (error) {
        console.error('Vercel Blob upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
      }
    });
  } else {
    localFileUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded or invalid file type' });
        return;
      }
      res.json({
        path: `/files/${req.file.filename}`,
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      });
    });
  }
});

export default router;
