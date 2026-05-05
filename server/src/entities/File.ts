import { required, toISO } from './utils.js';
import { EntityError } from '../lib/errors.js';

const MAX_SIZE = 10_485_760; // 10 MB — must match files_size_chk + multer cap
const SHA256_RE = /^[0-9a-f]{64}$/;
const ENTITY = 'File';

export interface FileRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  uploaderUserId: string | null;
  mime: string;
  // bigint comes back as a string from the pg driver; we coerce in the
  // constructor so callers always see a number.
  size: number | string;
  sha256: string;
  filename: string;
  storageKey: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

export class File {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly uploaderUserId: string | null;
  readonly mime: string;
  readonly size: number;
  readonly sha256: string;
  readonly filename: string;
  readonly storageKey: string;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: FileRow) {
    required(row.id, ENTITY, 'id');
    required(row.tenantId, ENTITY, 'tenantId');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.mime, ENTITY, 'mime');
    required(row.sha256, ENTITY, 'sha256');
    required(row.filename, ENTITY, 'filename');
    required(row.storageKey, ENTITY, 'storageKey');
    required(row.createdAt, ENTITY, 'createdAt');

    if (!SHA256_RE.test(row.sha256)) {
      throw new EntityError(
        `File.sha256 must be 64 lowercase hex characters, got '${row.sha256}'`,
        ENTITY,
        'sha256'
      );
    }

    // mime must be non-empty (required() already checks this, but be explicit)
    if (row.mime.trim().length === 0) {
      throw new EntityError('File.mime must be non-empty', ENTITY, 'mime');
    }

    const size = typeof row.size === 'string' ? Number(row.size) : row.size;
    if (!Number.isFinite(size) || size < 0) {
      throw new EntityError(
        `File.size must be a non-negative number, got '${row.size}'`,
        ENTITY,
        'size'
      );
    }
    if (size > MAX_SIZE) {
      throw new EntityError(
        `File.size ${size} exceeds the 10 MB maximum (${MAX_SIZE})`,
        ENTITY,
        'size'
      );
    }

    this.id = row.id;
    this.tenantId = row.tenantId;
    this.workspaceId = row.workspaceId;
    this.uploaderUserId = row.uploaderUserId ?? null;
    this.mime = row.mime;
    this.size = size;
    this.sha256 = row.sha256;
    this.filename = row.filename;
    this.storageKey = row.storageKey;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: FileRow): File {
    return new File(row);
  }
}
