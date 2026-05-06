// Shared composer affordances: file attachments + fenced-code insertion +
// a tiny rich-text renderer for ``` code blocks. Used by the issue-detail
// comment composer and the create-issue description.
//
// Attachments are uploaded to the BE inline as the user pastes / drops /
// picks them. Each attachment has a state machine:
//
//   uploading → uploaded   (success path)
//             → failed     (network / 4xx; user can retry)
//
// On submit, the consumer reads `attachmentIds` (the `attachment:<uuid>`
// refs only of the `uploaded` ones). Submit is gated on `hasInflight` so
// the BE always sees a coherent list — if the user fires the keyboard
// shortcut while uploads are still in flight, we no-op and let the
// "Posting…" button stay disabled until the queue drains.
//
// Pre-existing attachments (edit-mode for comments) are seeded via the
// `initial.existing` array — they enter directly in the `uploaded` state
// with their FileView already populated. Removing them locally just drops
// them from the draft; the BE delete is separate and triggered by the
// caller on save (since the user might cancel the edit).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { Icon } from './icons';
import { uploadFile } from '../api/files';
import {
  buildAttachmentRef, formatFileSize, isImageMime,
  type FileView,
} from '../api/adapters/file.adapter';
import { Modal } from './modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttachmentStatus = 'uploading' | 'uploaded' | 'failed';

export interface Attachment {
  /** Local-only id stable across the lifecycle. Distinct from `fileView.id`. */
  localId: string;
  name: string;
  size: number;
  mimeType: string;
  status: AttachmentStatus;
  /** Object-URL preview while uploading + after; null for non-image files. */
  previewUrl: string | null;
  /** Populated once `status === 'uploaded'`. The source of truth for refs. */
  fileView: FileView | null;
  /** Error message when `status === 'failed'`. */
  error: string | null;
  /**
   * Original File object retained so retry can re-upload without
   * re-prompting the user. Cleared after a successful upload to free the
   * underlying buffer; failed uploads keep it so retry works.
   */
  file: File | null;
}

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * The minimal shape we need to seed an existing attachment into the
 * composer. Both `FileView` (from file.adapter) and `CommentAttachmentView`
 * (from comment.adapter) satisfy this — they're the same wire shape, just
 * adapted on different paths.
 */
export interface SeedAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  readUrl: string;
}

export interface UseComposerOptions {
  value?: string;
  /**
   * Pre-existing attachments to seed the composer with (edit-mode for
   * comments). They enter directly in the `uploaded` state — wrapped into
   * a synthetic FileView with empty `uploaderUserId`/`createdAt` since the
   * composer never reads those.
   */
  existing?: SeedAttachment[];
  /**
   * Workspace coords for upload. When omitted, file picking still works
   * but uploads enter `failed` immediately — useful for the design canvas
   * preview where there's no live BE.
   */
  tenantSlug?: string;
  workspaceSlug?: string;
}

export function useComposer(initial?: UseComposerOptions) {
  const [value, setValue] = useState(initial?.value ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>(() =>
    (initial?.existing ?? []).map(seedFromFileView),
  );
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs created here so we can revoke them on unmount and avoid
  // leaking the underlying blobs (matters when a long page accumulates a
  // dozen pasted screenshots).
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => () => {
    for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
  }, []);

  const tenantSlug = initial?.tenantSlug;
  const workspaceSlug = initial?.workspaceSlug;

  // Upload one file. Idempotent per `localId` — used by both the initial
  // add path and the retry button.
  const beginUpload = useCallback(async (localId: string, file: File) => {
    if (!tenantSlug || !workspaceSlug) {
      setAttachments((prev) => prev.map((a) =>
        a.localId === localId
          ? { ...a, status: 'failed', error: 'Workspace not configured' }
          : a,
      ));
      return;
    }
    try {
      const view = await uploadFile(tenantSlug, workspaceSlug, file);
      setAttachments((prev) => prev.map((a) =>
        a.localId === localId
          ? { ...a, status: 'uploaded', fileView: view, error: null, file: null }
          : a,
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setAttachments((prev) => prev.map((a) =>
        a.localId === localId ? { ...a, status: 'failed', error: message } : a,
      ));
    }
  }, [tenantSlug, workspaceSlug]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const queued: Attachment[] = list.map((file) => {
      const isImage = file.type.startsWith('image/');
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      if (previewUrl) objectUrlsRef.current.push(previewUrl);
      return {
        localId: newId(),
        name: file.name || 'attachment',
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        status: 'uploading' as AttachmentStatus,
        previewUrl,
        fileView: null,
        error: null,
        file,
      };
    });
    setAttachments((prev) => [...prev, ...queued]);
    // Kick off uploads. Each runs independently — one failure doesn't block
    // the others, and the consumer can retry per-item.
    for (const a of queued) {
      if (a.file) void beginUpload(a.localId, a.file);
    }
  }, [beginUpload]);

  const retry = useCallback((localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId);
      if (!target || !target.file) return prev;
      // Mark uploading first; the async kick happens below with the same id.
      return prev.map((a) =>
        a.localId === localId ? { ...a, status: 'uploading', error: null } : a,
      );
    });
    // Read the current file; setAttachments is sync via state, but we need
    // the file ref captured BEFORE the state update (they may be cleared on
    // 'uploaded'). We pull it from a fresh closure scan.
    const ref = attachments.find((a) => a.localId === localId);
    if (ref?.file) void beginUpload(localId, ref.file);
  }, [attachments, beginUpload]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    // Allow re-selecting the same file by clearing the input value.
    e.target.value = '';
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items).filter((i) => i.kind === 'file');
    if (!items.length) return;
    e.preventDefault();
    const files = items.map((i) => i.getAsFile()).filter((f): f is File => f !== null);
    addFiles(files);
  };

  const handleDragOver = (e: DragEvent) => {
    if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) {
      e.preventDefault();
      setDragOver(true);
    }
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const removeAttachment = (localId: string) =>
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));

  /**
   * Replace the composer's text + attachments wholesale. Used by the
   * comment-edit flow on `beginEdit` / `cancelEdit` so the edit form starts
   * from the saved comment's contents, not whatever was last in the box.
   * Existing attachments are seeded directly in `uploaded` state — no
   * second roundtrip on entry to edit mode.
   */
  const reset = useCallback((next?: { value?: string; existing?: SeedAttachment[] }) => {
    setValue(next?.value ?? '');
    setAttachments((next?.existing ?? []).map(seedFromFileView));
  }, []);

  const openFilePicker = () => fileInputRef.current?.click();

  // Insert a snippet at the cursor. `{{SEL}}` is replaced with the current
  // selection so wrapping the selection in a code fence works as expected.
  const insertAtCursor = (snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setValue((v) => v + snippet.replace('{{SEL}}', ''));
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);
    const insertion = snippet.replace('{{SEL}}', selected);
    setValue(before + insertion + after);
    requestAnimationFrame(() => {
      ta.focus();
      // Place cursor inside the snippet where {{SEL}} was, so the user can
      // start typing if there was no selection.
      const selOffset = snippet.indexOf('{{SEL}}');
      const cursor =
        selOffset >= 0 && selected.length === 0
          ? before.length + selOffset
          : before.length + insertion.length;
      ta.setSelectionRange(cursor, cursor);
    });
  };

  const insertCodeBlock = () => {
    const needsLeading = value.length > 0 && !value.endsWith('\n');
    insertAtCursor(`${needsLeading ? '\n' : ''}\`\`\`\n{{SEL}}\n\`\`\`\n`);
  };

  // Derived flags consumers gate their submit on.
  const hasInflight = attachments.some((a) => a.status === 'uploading');
  const hasFailed = attachments.some((a) => a.status === 'failed');
  /**
   * Persisted refs (`attachment:<uuid>`) for the uploaded entries, in the
   * order the user added them. Failed / in-flight items are silently
   * skipped — submit guards against `hasInflight` separately so a user
   * can't ship a comment that's missing files.
   */
  const attachmentIds = attachments
    .filter((a) => a.status === 'uploaded' && a.fileView)
    .map((a) => buildAttachmentRef(a.fileView!.id));

  return {
    value,
    setValue,
    attachments,
    removeAttachment,
    addFiles,
    retry,
    reset,
    dragOver,
    textareaRef,
    fileInputRef,
    handleFileChange,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    openFilePicker,
    insertCodeBlock,
    insertAtCursor,
    hasInflight,
    hasFailed,
    attachmentIds,
  };
}

function seedFromFileView(view: SeedAttachment): Attachment {
  // Wrap into a synthetic FileView; uploader / createdAt aren't used by the
  // composer or the submit path (we only care about the `id` for the ref).
  const fileView: FileView = {
    id: view.id,
    name: view.name,
    size: view.size,
    mimeType: view.mimeType,
    readUrl: view.readUrl,
    uploaderUserId: null,
    createdAt: '',
  };
  return {
    localId: newId(),
    name: view.name,
    size: view.size,
    mimeType: view.mimeType,
    status: 'uploaded',
    previewUrl: isImageMime(view.mimeType) ? view.readUrl : null,
    fileView,
    error: null,
    file: null,
  };
}

// ---------------------------------------------------------------------------
// Composer-side editable attachment row
// ---------------------------------------------------------------------------

export function AttachmentRow({
  attachments,
  onRemove,
  onRetry,
  bordered = true,
}: {
  attachments: Attachment[];
  onRemove?: (localId: string) => void;
  onRetry?: (localId: string) => void;
  bordered?: boolean;
}) {
  if (attachments.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        padding: '8px 12px',
        borderTop: bordered ? '1px solid var(--border-muted)' : 'none',
      }}
    >
      {attachments.map((a) => (
        <ComposerThumbnail
          key={a.localId}
          att={a}
          onRemove={onRemove ? () => onRemove(a.localId) : undefined}
          onRetry={onRetry && a.status === 'failed' ? () => onRetry(a.localId) : undefined}
        />
      ))}
    </div>
  );
}

function ComposerThumbnail({
  att, onRemove, onRetry,
}: {
  att: Attachment;
  onRemove?: () => void;
  onRetry?: () => void;
}) {
  const isImage = isImageMime(att.mimeType);
  const isUploading = att.status === 'uploading';
  const isFailed = att.status === 'failed';

  // Compact, dense rendering. Image: 96×68 with overlaid filename. Non-image:
  // wider chip with icon + name + size. Both share status badges.
  if (isImage) {
    return (
      <div
        data-tip={isFailed ? `Upload failed: ${att.error}` : att.name}
        style={{
          position: 'relative',
          width: 96,
          height: 68,
          borderRadius: 6,
          overflow: 'hidden',
          border: `1px solid ${isFailed ? 'var(--canceled)' : 'var(--border-muted)'}`,
          background: 'var(--bg-subtle)',
          opacity: isUploading ? 0.7 : 1,
        }}
      >
        {att.previewUrl && (
          <img
            src={att.previewUrl}
            alt={att.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {isUploading && <UploadOverlay />}
        {isFailed && <FailedOverlay onRetry={onRetry} />}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            data-tip="Remove"
            style={{
              position: 'absolute', top: 3, right: 3,
              width: 18, height: 18, borderRadius: 9,
              background: 'rgba(15,23,42,.7)', border: 'none', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            <Icon name="x" size={11} />
          </button>
        )}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '2px 6px', fontSize: 10,
            background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.6))',
            color: '#fff', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {att.name}
        </div>
      </div>
    );
  }

  // Non-image: chip with icon + name + size. Status uses a coloured outline.
  return (
    <div
      data-tip={isFailed ? `Upload failed: ${att.error}` : att.name}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 10px 6px 8px',
        height: 36,
        borderRadius: 6,
        border: `1px solid ${isFailed ? 'var(--canceled)' : 'var(--border-muted)'}`,
        background: 'var(--bg-subtle)',
        opacity: isUploading ? 0.7 : 1,
        maxWidth: 240,
      }}
    >
      <FileIcon mimeType={att.mimeType} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{
          fontSize: 12, color: 'var(--fg)', fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 160,
        }}>{att.name}</span>
        <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>
          {isUploading ? 'Uploading…'
            : isFailed ? 'Failed'
            : formatFileSize(att.size)}
        </span>
      </div>
      {isFailed && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          data-tip="Retry upload"
          style={{
            width: 22, height: 22, borderRadius: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--fg-muted)', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="refresh" size={12} />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          data-tip="Remove"
          style={{
            width: 18, height: 18, borderRadius: 9,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--fg-muted)', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}

function UploadOverlay() {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(15,23,42,.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
      }}
    >
      Uploading…
    </div>
  );
}

function FailedOverlay({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(220,38,38,.45)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
        color: '#fff',
      }}
    >
      <Icon name="alert" size={14} />
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            background: 'rgba(255,255,255,.95)', color: 'var(--canceled)',
            border: 'none', borderRadius: 4, padding: '2px 8px',
            fontSize: 10, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  // We don't have a dedicated file icon — paperclip works as a generic
  // attachment marker that's already in the icon set. PDFs / docs / etc.
  // share it; the filename itself is the discriminator.
  void mimeType;
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 4,
      background: 'var(--bg-muted)', color: 'var(--fg-muted)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon name="paperclip" size={12} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Render-side attachment view (read-only — used by comment + description)
// ---------------------------------------------------------------------------

/**
 * The minimal shape the read-side row needs: matches both `FileView` and
 * `CommentAttachmentView` from the comment adapter (intentionally — they're
 * the same wire shape, just adapted by different paths).
 */
export interface RenderAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  readUrl: string;
}

/**
 * Read-side row used by `CommentRow` + the description renderer.
 * - Images render as clickable thumbnails (open the lightbox).
 * - Non-images render as filename + size with a download link.
 *
 * Empty-state is `null` so the consumer can skip the whitespace it would
 * otherwise occupy.
 */
export function RenderedAttachmentRow({ attachments }: { attachments: RenderAttachment[] }) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  if (attachments.length === 0) return null;

  const lightboxAtt = attachments.find((a) => a.id === lightboxId);

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8,
    }}>
      {attachments.map((a) => (
        isImageMime(a.mimeType) ? (
          <button
            key={a.id}
            type="button"
            onClick={() => setLightboxId(a.id)}
            data-tip={a.name}
            style={{
              padding: 0, border: '1px solid var(--border-muted)',
              borderRadius: 6, overflow: 'hidden', cursor: 'zoom-in',
              background: 'var(--bg-subtle)', width: 120, height: 80,
              flexShrink: 0,
            }}
          >
            <img
              src={a.readUrl}
              alt={a.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </button>
        ) : (
          <a
            key={a.id}
            href={a.readUrl}
            target="_blank"
            rel="noreferrer"
            download={a.name}
            data-tip={`Download ${a.name}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 10px 6px 8px', height: 36,
              borderRadius: 6,
              border: '1px solid var(--border-muted)',
              background: 'var(--bg-subtle)',
              color: 'var(--fg)', textDecoration: 'none',
              maxWidth: 240,
            }}
          >
            <FileIcon mimeType={a.mimeType} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{
                fontSize: 12, fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: 160,
              }}>{a.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>
                {formatFileSize(a.size)}
              </span>
            </div>
            <Icon name="download" size={12} color="var(--fg-muted)" />
          </a>
        )
      ))}
      {lightboxAtt && (
        <ImageLightbox
          src={lightboxAtt.readUrl}
          alt={lightboxAtt.name}
          name={lightboxAtt.name}
          onClose={() => setLightboxId(null)}
        />
      )}
    </div>
  );
}

/**
 * Full-screen image preview. Clicks outside the image close it; the modal
 * shell already wires up Esc → onClose. The image itself doesn't propagate
 * the click so users can pan / right-click without dismissing.
 */
function ImageLightbox({
  src, alt, name, onClose,
}: { src: string; alt: string; name: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} maxWidth={1100} label={`Preview: ${name}`}>
      <div style={{
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{name}</span>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            download={name}
            className="btn btn-ghost btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="download" size={12} /> Download
          </a>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ width: 24, padding: 0 }}
            aria-label="Close preview"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--bg-subtle)',
            padding: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            maxHeight: '80vh',
          }}
        >
          <img
            src={src}
            alt={alt}
            style={{
              maxWidth: '100%', maxHeight: '76vh',
              objectFit: 'contain', display: 'block',
              borderRadius: 4,
              boxShadow: 'var(--shadow-sm)',
            }}
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rich text renderer (unchanged — just kept here so consumers don't need
// to import from a second module)
// ---------------------------------------------------------------------------
//
// Render a Slack-flavored markdown subset:
//   block:  # / ## / ### headers, > quote, - / * bullets, 1. numbered,
//           ``` fenced code, blank-line separated paragraphs
//   inline: **bold**, _italic_, ~strike~, `code`, [label](url)
// Not a markdown spec implementation — just enough to make descriptions
// and comments scannable. Edge cases (e.g. `~/path`) are tolerated, not
// handled, matching Slack's own loose parser.

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; body: string }
  | { kind: 'quote'; body: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; lang?: string; body: string }
  | { kind: 'p'; body: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const codeRe = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = codeRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushNonCode(blocks, text.slice(lastIndex, match.index));
    }
    blocks.push({ kind: 'code', lang: match[1] || undefined, body: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) pushNonCode(blocks, text.slice(lastIndex));
  return blocks;
}

function pushNonCode(blocks: Block[], chunk: string): void {
  const lines = chunk.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, body: heading[2] });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', body: buf.join('\n') });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const buf = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() !== '' &&
      !/^#{1,3}\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', body: buf.join('\n') });
  }
}

// Inline tokenizer. Walks left-to-right and emits text/strong/em/del/code/a
// nodes. Recurses into wrapper bodies so emphasis can nest.
function parseInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) { out.push(buf); buf = ''; }
  };
  const tryWrap = (marker: string): { body: string; end: number } | null => {
    const end = text.indexOf(marker, i + marker.length);
    if (end <= i + marker.length) return null;
    return { body: text.slice(i + marker.length, end), end: end + marker.length };
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push(
          <code key={out.length} style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.92em',
            background: 'var(--bg-subtle)', border: '1px solid var(--border-muted)',
            borderRadius: 3, padding: '0 4px',
          }}>{text.slice(i + 1, end)}</code>,
        );
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const m = text.slice(i).match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
      if (m) {
        flush();
        out.push(
          <a key={out.length} href={m[2]} target="_blank" rel="noreferrer" style={{
            color: 'var(--accent)', textDecoration: 'none',
          }}>{parseInline(m[1])}</a>,
        );
        i += m[0].length;
        continue;
      }
    }
    if (ch === '*' && text[i + 1] === '*') {
      const w = tryWrap('**');
      if (w) {
        flush();
        out.push(<strong key={out.length}>{parseInline(w.body)}</strong>);
        i = w.end;
        continue;
      }
    }
    if (ch === '*') {
      const w = tryWrap('*');
      if (w) {
        flush();
        out.push(<em key={out.length}>{parseInline(w.body)}</em>);
        i = w.end;
        continue;
      }
    }
    if (ch === '_') {
      const w = tryWrap('_');
      if (w) {
        flush();
        out.push(<em key={out.length}>{parseInline(w.body)}</em>);
        i = w.end;
        continue;
      }
    }
    if (ch === '~') {
      const w = tryWrap('~');
      if (w) {
        flush();
        out.push(
          <span key={out.length} style={{ textDecoration: 'line-through' }}>
            {parseInline(w.body)}
          </span>,
        );
        i = w.end;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// Paragraphs preserve hard line breaks within a block as <br/>.
function renderParagraph(body: string, key: number): ReactNode {
  const lines = body.split('\n');
  const parts: ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) parts.push(<br key={`br-${idx}`} />);
    parts.push(...parseInline(line).map((n, j) =>
      typeof n === 'string' ? <span key={`t-${idx}-${j}`}>{n}</span> : n,
    ));
  });
  return <p key={key} style={{ margin: '0 0 8px', lineHeight: 1.65 }}>{parts}</p>;
}

const HEADING_STYLE: Record<1 | 2 | 3, React.CSSProperties> = {
  1: { fontSize: 18, fontWeight: 600, margin: '14px 0 6px', lineHeight: 1.3 },
  2: { fontSize: 15.5, fontWeight: 600, margin: '12px 0 6px', lineHeight: 1.3 },
  3: { fontSize: 13.5, fontWeight: 600, margin: '10px 0 4px', lineHeight: 1.3 },
};

export function renderRichText(text: string): ReactNode {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return text;
  return blocks.map((b, i) => {
    if (b.kind === 'code') {
      return (
        <div
          key={i}
          style={{
            margin: '8px 0',
            border: '1px solid var(--border-muted)',
            borderRadius: 6,
            background: 'var(--bg-subtle)',
            overflow: 'hidden',
          }}
        >
          {b.lang && (
            <div
              style={{
                padding: '3px 10px',
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--fg-faint)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                borderBottom: '1px solid var(--border-muted)',
                background: 'var(--bg)',
              }}
            >
              {b.lang}
            </div>
          )}
          <pre
            style={{
              margin: 0,
              padding: '10px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.55,
              color: 'var(--fg)',
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {b.body}
          </pre>
        </div>
      );
    }
    if (b.kind === 'heading') {
      const Tag = (`h${b.level}` as 'h1' | 'h2' | 'h3');
      return <Tag key={i} style={HEADING_STYLE[b.level]}>{parseInline(b.body)}</Tag>;
    }
    if (b.kind === 'quote') {
      return (
        <blockquote
          key={i}
          style={{
            margin: '6px 0', padding: '2px 12px',
            borderLeft: '3px solid var(--border)',
            color: 'var(--fg-muted)', lineHeight: 1.6,
          }}
        >
          {b.body.split('\n').map((line, idx) => (
            <div key={idx}>{parseInline(line)}</div>
          ))}
        </blockquote>
      );
    }
    if (b.kind === 'ul') {
      return (
        <ul key={i} style={{ margin: '6px 0', paddingLeft: 22, lineHeight: 1.65 }}>
          {b.items.map((item, idx) => <li key={idx}>{parseInline(item)}</li>)}
        </ul>
      );
    }
    if (b.kind === 'ol') {
      return (
        <ol key={i} style={{ margin: '6px 0', paddingLeft: 22, lineHeight: 1.65 }}>
          {b.items.map((item, idx) => <li key={idx}>{parseInline(item)}</li>)}
        </ol>
      );
    }
    return renderParagraph(b.body, i);
  });
}
