import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../lib/errors.js';
import { verifyFileId } from '../lib/fileSignature.js';
import { getFileBySignedId } from '../usecases/files/getFileBySignedId.js';

/**
 * Public, unauthenticated file read by signed URL.
 *
 *   GET /api/files/:id?sig=<hex>&exp=<unix-seconds>
 *
 * Mounted *outside* `/api/tenants` so it doesn't pass through the
 * `authenticate` middleware on the tenants router. The signature is the
 * authorisation: a valid `sig` proves the URL was minted by us, and `exp`
 * caps the leakage window. This is the path used by `<img src>` /
 * `<a download>` etc., where attaching a Bearer token is impractical.
 *
 * Drivers other than PG (S3, GCS) return native presigned URLs that point
 * directly at the cloud bucket and never reach this route — so this is
 * effectively the PG-driver download endpoint.
 */
const router: Router = Router();

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
    const expRaw = typeof req.query.exp === 'string' ? req.query.exp : '';
    const exp = Number.parseInt(expRaw, 10);

    const verdict = verifyFileId(req.params.id, sig, exp);
    if (!verdict.ok) {
      const message =
        verdict.reason === 'expired'
          ? 'Link expired'
          : verdict.reason === 'bad-signature'
            ? 'Invalid signature'
            : 'Malformed signed URL';
      throw new AppError(message, 401);
    }

    const { file, bytes } = await getFileBySignedId(req.params.id);
    res.set('Content-Type', file.mime);
    res.set('Cache-Control', 'private, max-age=300');
    // Helmet's default CORP is `same-origin`, which blocks cross-origin
    // <img> / <video> loads from the FE (5173) hitting the BE (5001) even
    // though the URL is signed and CORS is permissive. Override to
    // `cross-origin` because the signature is the access control here —
    // the BE genuinely intends these bytes to be fetchable from elsewhere.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set(
      'Content-Disposition',
      `inline; filename="${file.filename.replace(/"/g, '')}"`
    );
    res.send(bytes);
  })
);

export default router;
