// Shared composer affordances: image attachments + fenced-code insertion +
// a tiny rich-text renderer for ``` code blocks. Used by the issue-detail
// comment composer and the create-issue description.
//
// Everything lives in component state — uploads become data URLs, never
// touch a server, and clear on navigate. That matches the rest of the
// prototype (no persistence beyond `bira:list-layout`).

import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { Icon } from './icons';

export interface Attachment {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
}

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function useComposer(initial?: { value?: string; attachments?: Attachment[] }) {
  const [value, setValue] = useState(initial?.value ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>(initial?.attachments ?? []);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            {
              id: newId(),
              name: file.name || 'pasted-image.png',
              size: file.size,
              dataUrl: reader.result as string,
            },
          ]);
        };
        reader.readAsDataURL(file);
      });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    // Allow re-selecting the same file by clearing the input value.
    e.target.value = '';
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items).filter(
      (i) => i.kind === 'file' && i.type.startsWith('image/'),
    );
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

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

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

  return {
    value,
    setValue,
    attachments,
    removeAttachment,
    addFiles,
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
  };
}

export function AttachmentRow({
  attachments,
  onRemove,
  bordered = true,
}: {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
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
        <Thumbnail key={a.id} att={a} onRemove={onRemove ? () => onRemove(a.id) : undefined} />
      ))}
    </div>
  );
}

function Thumbnail({ att, onRemove }: { att: Attachment; onRemove?: () => void }) {
  return (
    <div
      style={{
        position: 'relative',
        width: 96,
        height: 68,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid var(--border-muted)',
        background: 'var(--bg-subtle)',
      }}
    >
      <img
        src={att.dataUrl}
        alt={att.name}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          data-tip="Remove"
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: 'rgba(15,23,42,.7)',
            border: 'none',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Icon name="x" size={11} />
        </button>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '2px 6px',
          fontSize: 10,
          background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.6))',
          color: '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {att.name}
      </div>
    </div>
  );
}

// Render plain text, splitting out fenced ``` code blocks. Lightweight on
// purpose — full markdown is out of scope for the prototype.
export function renderRichText(text: string): ReactNode {
  const parts: { kind: 'text' | 'code'; lang?: string; body: string }[] = [];
  const re = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', body: text.slice(lastIndex, match.index) });
    }
    parts.push({ kind: 'code', lang: match[1] || undefined, body: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: 'text', body: text.slice(lastIndex) });
  }
  if (parts.length === 0) return text;
  return parts.map((p, i) =>
    p.kind === 'code' ? (
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
        {p.lang && (
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
            {p.lang}
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
          {p.body}
        </pre>
      </div>
    ) : (
      <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
        {p.body}
      </span>
    ),
  );
}
