import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-based signing for file read URLs.
 *
 * The PG FileStore returns URLs of the form
 *   /api/files/<fileId>?sig=<hex-hmac>&exp=<unix-seconds>
 * which the public file route (`server/src/routes/publicFiles.ts`) accepts
 * without a Bearer token. The signature proves the URL was minted by us,
 * the expiry caps the leakage window if a URL is shared, and `<fileId>` is
 * the only secret-free identifier needed to look up the bytes.
 *
 * S3 / GCS drivers do not use these helpers — they return native presigned
 * URLs from the cloud SDK and the public route is bypassed entirely. This
 * module is therefore a PG-driver implementation detail; the FileStore
 * interface (`getReadUrl(file): string`) is what callers see.
 */

const DEFAULT_DEV_SECRET = 'dev-only-file-signing-secret-change-me';
const ENV_VAR = 'FILE_SIGNING_SECRET';

let warned = false;

function getSecret(): string {
  const v = process.env[ENV_VAR];
  if (v && v.length > 0) return v;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${ENV_VAR} must be set in production — file read URLs are signed with it`
    );
  }
  if (!warned) {
    // eslint-disable-next-line no-console
    console.warn(
      `[fileSignature] ${ENV_VAR} not set; using dev default. Set it in .env for any non-throwaway environment.`
    );
    warned = true;
  }
  return DEFAULT_DEV_SECRET;
}

/** Default lifetime: 1 hour. Long enough that a page-load + a few user clicks
 *  all see a valid URL, short enough that a leaked URL stops working quickly. */
export const DEFAULT_TTL_SECONDS = 60 * 60;

export interface SignedToken {
  /** Hex-encoded HMAC. */
  sig: string;
  /** Unix seconds at which the signature stops being valid. */
  exp: number;
}

export function signFileId(fileId: string, ttlSeconds = DEFAULT_TTL_SECONDS): SignedToken {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = computeSig(fileId, exp);
  return { sig, exp };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'bad-signature' | 'malformed' };

export function verifyFileId(fileId: string, sigHex: string, expSeconds: number): VerifyResult {
  if (!fileId || !sigHex || !Number.isFinite(expSeconds)) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.floor(Date.now() / 1000) > expSeconds) {
    return { ok: false, reason: 'expired' };
  }
  const expected = computeSig(fileId, expSeconds);
  // Length must match for timingSafeEqual; treat mismatch as bad-signature.
  if (expected.length !== sigHex.length) {
    return { ok: false, reason: 'bad-signature' };
  }
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sigHex, 'hex');
  if (a.length !== b.length) return { ok: false, reason: 'bad-signature' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'bad-signature' };
}

function computeSig(fileId: string, exp: number): string {
  return createHmac('sha256', getSecret()).update(`${fileId}.${exp}`).digest('hex');
}
