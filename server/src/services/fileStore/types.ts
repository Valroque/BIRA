import type { Knex } from 'knex';

export interface PutInput {
  tenantId: string;
  workspaceId: string;
  bytes: Buffer;
}

export interface PutResult {
  storageKey: string;
  sha256: string;
  size: number;
}

export interface ReadUrlInput {
  id: string;
  storageKey: string;
  tenantSlug: string;
  workspaceSlug: string;
}

export interface FileStore {
  put(input: PutInput, trx?: Knex.Transaction): Promise<PutResult>;
  get(storageKey: string): Promise<Buffer>;
  getReadUrl(file: ReadUrlInput): string;
  delete(storageKey: string, trx?: Knex.Transaction): Promise<void>;
}
