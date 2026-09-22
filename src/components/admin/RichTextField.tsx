import { useEffect, useRef } from 'react';
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Link as LinkIcon, Eraser } from 'lucide-react';
import { sanitizeJobHtml } from '@/lib/atsImport';

/**
 * A small WYSIWYG box for job/program descriptions — bold, headings,
 * bullet/numbered lists, links, matching the same small tag set
 * sanitizeJobHtml already allows through (see src/lib/atsImport.ts:
 * h2/h3/h4, p, ul/ol/li, strong/b, em/i, br, a, span). No new npm
 * dependency: this uses the browser's own contentEditable +
 * document.execCommand, which — despite being a deprecated API — still
 * works reliably across Chrome/Safari/Firefox for exactly this small
 * set of formatting commands, and keeps this internal admin tool from
 * needing a full editor library (Tiptap/Quill/etc.) and its own
 * `npm install` + redeploy just for this one field.
 *
 * Deliberately uncontrolled-ish: `value` is only pushed into the DOM
 * when it changes from OUTSIDE this component (loading a different
 * job) — never on every keystroke, since re-setting innerHTML while
 * the user is mid-edit would reset their cursor to the start on every
 * character typed.
 */
export function RichTextField({ label, value, onChange }: { label?: string; value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastKnownValue = useRef(value);

  useEffect(() => {
    if (!ref.current) return;
    // First mount, or the value changed for a reason other than our own
    // onInput below (e.g. the admin picked a different pending job) —
    // sync it in. Skip while this field currently has focus, so a
    // parent re-render mid-typing can't fight the user's cursor.
    if (value !== lastKnownValue.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || '';
      lastKnownValue.current = value;
    } else if (ref.current.innerHTML === '' && value) {
      ref.current.innerHTML = value;
      lastKnownValue.current = value;
    }
  }, [value]);

  const emitChange = () => {
    if (!ref.current) return;
    const clean = sanitizeJobHtml(ref.current.innerHTML);
    lastKnownValue.current = clean;
    onChange(clean);
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emitChange();
  };

  const addLink = () => {
    const url = window.prompt('Link URL (e.g. https://example.com)');
    if (url) exec('createLink', url);
  };

  return (
    <div>
      {label && <label className="mb-1 block text-[11px] font-semibold text-ink-500">{label}</label>}
      <div className="rounded-md border border-ink-200 focus-within:border-brand-500">
        <div className="flex flex-wrap gap-0.5 border-b border-ink-100 bg-ink-50/60 p-1">
          <ToolbarButton icon={Bold} label="Bold" onClick={() => exec('bold')} />
          <ToolbarButton icon={Italic} label="Italic" onClick={() => exec('italic')} />
          <ToolbarButton icon={Heading2} label="Heading" onClick={() => exec('formatBlock', '<h2>')} />
          <ToolbarButton icon={Heading3} label="Subheading" onClick={() => exec('formatBlock', '<h3>')} />
          <ToolbarButton icon={List} label="Bullet list" onClick={() => exec('insertUnorderedList')} />
          <ToolbarButton icon={ListOrdered} label="Numbered list" onClick={() => exec('insertOrderedList')} />
          <ToolbarButton icon={LinkIcon} label="Link" onClick={addLink} />
          <ToolbarButton icon={Eraser} label="Clear formatting" onClick={() => exec('removeFormat')} />
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          className="prose-job min-h-[220px] max-h-[480px] overflow-y-auto p-3 text-sm leading-6 text-ink-800 outline-none [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink-950 [&_h2]:first:mt-0 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-ink-900 [&_p]:mt-2 [&_p]:first:mt-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_strong]:font-bold [&_a]:text-brand-600 [&_a]:underline"
        />
      </div>
      <p className="mt-1 text-[10px] text-ink-400">
        Bold, headings, lists and links only — anything else (scripts, custom styling, other tags) is stripped automatically.
      </p>
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: typeof Bold; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      // Prevents the toolbar button from stealing focus away from the
      // editable area before the command runs — without this, the
      // browser's current text selection (what bold/italic/etc. would
      // apply to) is lost the instant the button is clicked.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
