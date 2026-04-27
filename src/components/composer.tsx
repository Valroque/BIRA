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
