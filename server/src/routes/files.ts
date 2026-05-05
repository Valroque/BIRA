import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  authorize,
  requireActiveWorkspace,
} from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { uploadFile } from '../usecases/files/uploadFile.js';
import { deleteFile } from '../usecases/files/deleteFile.js';
import { getFileForDownload } from '../usecases/files/getFileForDownload.js';
import { toFileView } from '../usecases/files/fileView.js';

// 10 MB cap — must stay in sync with the files_size_chk DB constraint and
// the entity-layer MAX_SIZE constant.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Wraps multer.single('file') so that MulterError instances are converted
 * to typed AppErrors before reaching the global error handler.
 * Generic errors from the underlying busboy parser (e.g. malformed
 * multipart content-type) are also converted to 400 responses.
 */
function multerMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new AppError('File too large (10 MB max)', 413)
          : new AppError(err.message, 400)
      );
    }
    // busboy and other multipart parse errors are client-side issues
    if (err instanceof Error) {
      const lc = err.message.toLowerCase();
      if (
        lc.includes('boundary') ||
        lc.includes('multipart') ||
        lc.includes('content-type')
      ) {
        return next(new AppError('Invalid multipart request', 400));
      }
    }
    next(err);
  });
}

// mergeParams: true so this router can read :tenantSlug and :workspaceSlug
// from the parent router (tenants.ts mounts us under
// /:tenantSlug/workspaces/:workspaceSlug/files after resolveWorkspaceScope).
const router: Router = Router({ mergeParams: true });

// POST /api/tenants/:tenantSlug/workspaces/:workspaceSlug/files
router.post(
  '/',
  requireActiveWorkspace,
  authorize('write'),
  multerMiddleware,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    if (!req.file) {
      throw new AppError('file field is required', 400);
    }

    const mime = req.file.mimetype || 'application/octet-stream';
    const filename = req.file.originalname;
    const bytes = req.file.buffer;

    const file = await uploadFile({
      tenantId: req.scope.tenantId,
      workspaceId: req.scope.workspaceId,
      uploaderUserId: req.user.id,
      mime,
      filename,
      bytes,
    });

    res.status(201).json({
      success: true,
      data: toFileView(file, {
        tenantSlug: req.scope.tenantSlug,
        workspaceSlug: req.scope.workspaceSlug!,
      }),
    });
  })
);

// GET /api/tenants/:tenantSlug/workspaces/:workspaceSlug/files/:id
// No requireActiveWorkspace — reads from archived workspaces are fine.
router.get(
  '/:id',
  authorize('read'),
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const { file, bytes } = await getFileForDownload(req.scope.workspaceId, req.params.id);
    res.set('Content-Type', file.mime);
    res.set(
      'Content-Disposition',
      `inline; filename="${file.filename.replace(/"/g, '')}"`
    );
    res.send(bytes);
  })
);

// DELETE /api/tenants/:tenantSlug/workspaces/:workspaceSlug/files/:id
router.delete(
  '/:id',
  requireActiveWorkspace,
  authorize('write'),
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    await deleteFile({
      workspaceId: req.scope.workspaceId,
      fileId: req.params.id,
      actingUserId: req.user.id,
      actingRole: req.scope.role,
    });
    res.status(204).send();
  })
);

export default router;
