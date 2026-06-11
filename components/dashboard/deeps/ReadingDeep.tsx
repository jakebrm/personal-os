'use client';
import { useState, useRef, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, closestCenter,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Panel } from '../Panel';
import { useDashboard } from '../context';
import { useReading } from '../ReadingContext';
import { useHabits, calcStreak } from '../HabitsContext';
import { useGoals } from '../GoalsContext';
import { bookPct, booksReadThisYear } from '@/lib/books';
import { localDateKey } from '@/lib/habits';
import type { Book } from '@/lib/books';
import type { GoalWithProgress } from '@/lib/goals';

// ── Stars ─────────────────────────────────────────────────────────────────────

function Stars({ rating, onRate }: { rating: number | null; onRate: (n: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? rating;
  return (
    <div style={{ display: 'flex', gap: 3 }} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => onRate(n)}
          onMouseEnter={() => setHover(n)}
          style={{
            cursor: 'pointer',
            color: active !== null && n <= active ? 'var(--warn)' : 'rgba(255,255,255,.15)',
            fontSize: 14, lineHeight: 1,
            transition: 'color .08s',
          }}
        >★</span>
      ))}
    </div>
  );
}

// ── Notes editor ──────────────────────────────────────────────────────────────

function NotesEditor({ book, onSave }: { book: Book; onSave: (notes: string) => Promise<void> }) {
  const [val, setVal]     = useState(book.notes ?? '');
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async (text: string) => {
    if (text === (book.notes ?? '')) return;
    await onSave(text);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }, [book.notes, onSave]);

  const handleChange = (text: string) => {
    setVal(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(text), 1400);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, color: 'var(--faint)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>
        Notes {saved && <span style={{ color: 'var(--ok)', textTransform: 'none', letterSpacing: 0 }}>· saved</span>}
      </div>
      <textarea
        value={val}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => flush(val)}
        placeholder="Thoughts, quotes, takeaways…"
        style={{
          width: '100%', minHeight: 72, resize: 'vertical',
          background: 'var(--ph)', border: '1px solid var(--card-bd)',
          borderRadius: 9, color: 'var(--text)', fontSize: 12.5,
          padding: '8px 11px', fontFamily: 'var(--sans)',
          outline: 'none', lineHeight: 1.55,
          transition: 'border-color .12s',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--card-bd)')}
      />
    </div>
  );
}

// ── Progress update inline form ───────────────────────────────────────────────

function ProgressEditor({ book, onSave, onClose }: {
  book: Book;
  onSave: (pages: number) => Promise<void>;
  onClose: () => void;
}) {
  const [val, setVal] = useState(String(book.pages_read));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 0) return;
    setSaving(true);
    await onSave(Math.min(n, book.pages ?? n)).finally(() => setSaving(false));
    onClose();
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
      <input
        type="number"
        min={0}
        max={book.pages ?? undefined}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }}
        autoFocus
        style={{
          width: 80,
          background: 'var(--bg)',
          border: '1px solid var(--card-bd)',
          borderRadius: 6,
          color: 'var(--text)',
          fontSize: 12,
          padding: '4px 8px',
          fontFamily: 'var(--mono)',
        }}
      />
      {book.pages && (
        <span style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
          / {book.pages}
        </span>
      )}
      <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={save} disabled={saving}>
        {saving ? '…' : 'Save'}
      </button>
      <button className="btn ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={onClose}>✕</button>
    </div>
  );
}

// ── Mark done flow ────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const smallSelectStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--card-bd)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 11,
  padding: '3px 6px',
  fontFamily: 'var(--sans)',
  outline: 'none',
  cursor: 'pointer',
};

function MarkDoneFlow({ onConfirm, onCancel }: {
  onConfirm: (finishedAt: string) => Promise<void>;
  onCancel: () => void;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [year,  setYear]  = useState(currentYear);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [saving, setSaving] = useState(false);
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const save = async () => {
    setSaving(true);
    const mm = String(month).padStart(2, '0');
    await onConfirm(`${year}-${mm}-01`).finally(() => setSaving(false));
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10.5, color: 'var(--mut)' }}>Finished:</span>
      <select value={month} onChange={e => setMonth(Number(e.target.value))} style={smallSelectStyle}>
        {MONTHS_SHORT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
      </select>
      <select value={year} onChange={e => setYear(Number(e.target.value))} style={smallSelectStyle}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <button className="btn" style={{ fontSize: 10.5, padding: '3px 10px' }} onClick={save} disabled={saving}>
        {saving ? '…' : '✓ Mark Done'}
      </button>
      <button className="btn ghost" style={{ fontSize: 10.5, padding: '3px 8px' }} onClick={onCancel}>✕</button>
    </div>
  );
}

// ── Currently Reading section ─────────────────────────────────────────────────

function CurrentlyReading({ books, updateBook }: { books: Book[]; updateBook: ReadingCtxUpdate }) {
  const [editing,      setEditing]      = useState<string | null>(null);
  const [notesOpen,    setNotesOpen]    = useState<string | null>(null);
  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null);

  if (books.length === 0) {
    return (
      <Panel glyph="▭" title="Currently Reading">
        <div style={{ color: 'var(--faint)', fontSize: 12, padding: '8px 0' }}>
          No books in progress. Add one above or move a queued book to reading.
        </div>
      </Panel>
    );
  }

  return (
    <Panel glyph="▭" title="Currently Reading" meta={<span className="pill">{books.length}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {books.map(book => {
          const pct = bookPct(book);
          const showNotes = notesOpen === book.id;
          return (
            <div key={book.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{book.title}</div>
                  {book.author && <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 6 }}>{book.author}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="prog" style={{ flex: 1 }}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                    <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--mut)', flexShrink: 0 }}>
                      {pct}%
                    </span>
                  </div>
                  {book.pages && (
                    <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)', marginTop: 3 }}>
                      {book.pages_read} / {book.pages} pages
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {editing === book.id ? (
                      <ProgressEditor
                        book={book}
                        onSave={async pages => { await updateBook(book.id, { pages_read: pages }); }}
                        onClose={() => setEditing(null)}
                      />
                    ) : (
                      <button
                        className="btn ghost"
                        style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={() => setEditing(book.id)}
                      >
                        Update progress
                      </button>
                    )}
                    <button
                      className="btn ghost"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => setNotesOpen(showNotes ? null : book.id)}
                    >
                      {showNotes ? '▴ Notes' : '▾ Notes'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                  <Stars
                    rating={book.rating}
                    onRate={n => updateBook(book.id, { rating: book.rating === n ? null : n })}
                  />
                  {markingDoneId !== book.id && (
                    <button
                      className="btn ghost"
                      style={{ fontSize: 10.5, padding: '3px 8px' }}
                      onClick={() => setMarkingDoneId(book.id)}
                    >
                      Mark done ✓
                    </button>
                  )}
                </div>
              </div>
              {markingDoneId === book.id && (
                <MarkDoneFlow
                  onConfirm={async (finishedAt) => {
                    await updateBook(book.id, { status: 'done', finished_at: finishedAt });
                    setMarkingDoneId(null);
                  }}
                  onCancel={() => setMarkingDoneId(null)}
                />
              )}
              {showNotes && (
                <NotesEditor book={book} onSave={notes => updateBook(book.id, { notes })} />
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Queue sortable item ───────────────────────────────────────────────────────

function QueueItem({ book, onStart, onDelete, onRate, onSaveNotes }: {
  book: Book;
  onStart: () => void;
  onDelete: () => void;
  onRate: (n: number) => void;
  onSaveNotes: (notes: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: book.id });
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{
        borderTop: '1px solid rgba(255,255,255,.06)',
        opacity: isDragging ? 0.3 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
        <button
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', background: 'none', border: 'none', color: 'var(--faint)', fontSize: 16, padding: '0 4px', flexShrink: 0 }}
          tabIndex={-1}
          aria-label="Drag to reorder"
          suppressHydrationWarning
        >⠿</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{book.title}</div>
          {book.author && <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 1 }}>{book.author}</div>}
          {book.pages && <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>{book.pages} pages</div>}
        </div>
        <button
          className="btn ghost"
          style={{ fontSize: 10.5, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}
          onClick={onStart}
        >Start reading</button>
        <button
          onClick={() => setExpanded(e => !e)}
          title={expanded ? 'Collapse' : 'Stars & notes'}
          style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 12, flexShrink: 0, padding: '0 2px' }}
        >{expanded ? '▴' : '▾'}</button>
        <button
          onClick={onDelete}
          style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
        >×</button>
      </div>
      {expanded && (
        <div style={{ paddingLeft: 28, paddingBottom: 10 }}>
          <Stars rating={book.rating} onRate={onRate} />
          <NotesEditor book={book} onSave={onSaveNotes} />
        </div>
      )}
    </div>
  );
}

// ── Queue section ─────────────────────────────────────────────────────────────

type ReadingCtxUpdate = (id: string, patch: Partial<Book> & { pages_read?: number }) => Promise<void>;

function QueueSection({ books, updateBook, deleteBook }: {
  books: Book[];
  updateBook: ReadingCtxUpdate;
  deleteBook: (id: string) => Promise<void>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localBooks, setLocalBooks] = useState<Book[]>(books);

  // Keep in sync when parent changes
  if (JSON.stringify(localBooks.map(b => b.id)) !== JSON.stringify(books.map(b => b.id))) {
    setLocalBooks(books);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const activeBook = localBooks.find(b => b.id === activeId) ?? null;

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = localBooks.findIndex(b => b.id === active.id);
    const newIdx = localBooks.findIndex(b => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(localBooks, oldIdx, newIdx);
    setLocalBooks(reordered);
    // Persist new sort_orders in parallel
    await Promise.all(reordered.map((b, i) =>
      i !== books.findIndex(x => x.id === b.id)
        ? updateBook(b.id, { sort_order: i })
        : Promise.resolve()
    ));
  }

  if (localBooks.length === 0) {
    return (
      <Panel glyph="≡" title="Reading Queue" meta={<span className="pill">0</span>}>
        <div style={{ color: 'var(--faint)', fontSize: 12, padding: '8px 0' }}>Queue is empty. Add books below.</div>
      </Panel>
    );
  }

  return (
    <Panel glyph="≡" title="Reading Queue" meta={<span className="pill">{localBooks.length}</span>}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={localBooks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          {localBooks.map(book => (
            <QueueItem
              key={book.id}
              book={book}
              onStart={() => updateBook(book.id, { status: 'reading' })}
              onDelete={() => deleteBook(book.id)}
              onRate={n => updateBook(book.id, { rating: book.rating === n ? null : n })}
              onSaveNotes={notes => updateBook(book.id, { notes })}
            />
          ))}
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.22,.61,.36,1)' }}>
          {activeBook && (
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--card-bd)',
              borderRadius: 10, padding: '8px 14px',
              opacity: 0.9, fontSize: 13, fontWeight: 500,
              boxShadow: '0 16px 48px rgba(0,0,0,.7)',
            }}>
              {activeBook.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </Panel>
  );
}

// ── Finished section ──────────────────────────────────────────────────────────

function FinishedSection({ books, updateBook, title = 'Finished', allTime = false }: { books: Book[]; updateBook: ReadingCtxUpdate; title?: string; allTime?: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (books.length === 0) return null;

  return (
    <Panel glyph="★" title={title} meta={<span className="pill">{books.length}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {books.map((book, i) => {
          const isExpanded = expandedId === book.id;
          return (
            <div key={book.id} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
                <span style={{ color: 'var(--ok)', fontSize: 13, flexShrink: 0 }}>✓</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{book.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 1 }}>
                    {book.author && `${book.author} · `}
                    {book.finished_at
                      ? new Date(book.finished_at + 'T12:00:00').toLocaleDateString('en-US',
                          allTime
                            ? { month: 'long', year: 'numeric' }
                            : { month: 'short', day: 'numeric', year: 'numeric' }
                        )
                      : 'finished'
                    }
                  </div>
                </div>
                <Stars
                  rating={book.rating}
                  onRate={n => updateBook(book.id, { rating: book.rating === n ? null : n })}
                />
                <button
                  onClick={() => setExpandedId(isExpanded ? null : book.id)}
                  title={isExpanded ? 'Collapse' : 'Notes & options'}
                  style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                >{isExpanded ? '▴' : '▾'}</button>
              </div>
              {isExpanded && (
                <div style={{ paddingBottom: 12 }}>
                  <NotesEditor book={book} onSave={notes => updateBook(book.id, { notes })} />
                  <button
                    className="btn ghost"
                    style={{ marginTop: 10, fontSize: 11, padding: '4px 10px' }}
                    onClick={() => {
                      updateBook(book.id, { status: 'reading', finished_at: '' });
                      setExpandedId(null);
                    }}
                  >
                    ↩ Move back to Reading
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Add book form ─────────────────────────────────────────────────────────────

function AddBookForm({ addBook }: { addBook: ReadingCtxAdd }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [title,      setTitle]      = useState('');
  const [author,     setAuthor]     = useState('');
  const [pages,      setPages]      = useState('');
  const [status,     setStatus]     = useState<Book['status']>('queued');
  const [finishMonth, setFinishMonth] = useState(now.getMonth() + 1);
  const [finishYear,  setFinishYear]  = useState(currentYear);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const mm = String(finishMonth).padStart(2, '0');
    await addBook({
      title,
      author: author.trim() || undefined,
      pages: pages ? parseInt(pages, 10) : undefined,
      status,
      finished_at: status === 'done' ? `${finishYear}-${mm}-01` : undefined,
    }).finally(() => setSaving(false));
    setTitle(''); setAuthor(''); setPages(''); setStatus('queued');
    setFinishMonth(now.getMonth() + 1); setFinishYear(currentYear);
    titleRef.current?.focus();
  };

  return (
    <Panel glyph="+" title="Add Book">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input
            ref={titleRef}
            placeholder="Title *"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={inputStyle}
          />
          <input
            placeholder="Author"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={inputStyle}
          />
          <input
            placeholder="Pages"
            type="number"
            min={1}
            value={pages}
            onChange={e => setPages(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={inputStyle}
          />
          <select
            value={status}
            onChange={e => setStatus(e.target.value as Book['status'])}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="queued">Queue</option>
            <option value="reading">Reading now</option>
            <option value="done">Already read</option>
          </select>
        </div>
        {status === 'done' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>Finished:</span>
            <select
              value={finishMonth}
              onChange={e => setFinishMonth(Number(e.target.value))}
              style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}
            >
              {MONTHS_SHORT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={finishYear}
              onChange={e => setFinishYear(Number(e.target.value))}
              style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        <button
          className="btn"
          onClick={submit}
          disabled={!title.trim() || saving}
          style={{ alignSelf: 'flex-start', fontSize: 13, padding: '8px 20px' }}
        >
          {saving ? 'Adding…' : '+ Add book'}
        </button>
      </div>
    </Panel>
  );
}

type ReadingCtxAdd = (fields: { title: string; author?: string; pages?: number; status?: Book['status']; finished_at?: string }) => Promise<void>;

const inputStyle: React.CSSProperties = {
  background: 'var(--ph)',
  border: '1px solid var(--card-bd)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 13,
  padding: '8px 12px',
  fontFamily: 'var(--sans)',
  outline: 'none',
  width: '100%',
};

// ── Linked goal display (shows a goal from the Goals system) ─────────────────

const PACE_COLORS: Record<string, string> = {
  on_track:  'var(--ok)',
  at_risk:   'var(--warn)',
  behind:    'var(--danger)',
  completed: 'var(--accent)',
};
const PACE_LABELS: Record<string, string> = {
  on_track: 'On Track', at_risk: 'At Risk', behind: 'Behind', completed: 'Done!',
};

function LinkedGoalDisplay({ goal, onNavigate }: {
  goal: GoalWithProgress;
  onNavigate: () => void;
}) {
  const color = PACE_COLORS[goal.pace_status] ?? 'var(--accent)';
  const pct   = Math.min(100, goal.pct);
  const R     = 34;
  const C     = parseFloat((2 * Math.PI * R).toFixed(1));
  const off   = C * (1 - pct / 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        {/* Ring */}
        <div style={{ position: 'relative', flexShrink: 0, width: 88, height: 88 }}>
          <svg width={88} height={88} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
            <circle r={R} cx={44} cy={44} fill="none" stroke="var(--ph)" strokeWidth={7} />
            <circle r={R} cx={44} cy={44} fill="none" stroke={color} strokeWidth={7}
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off}
              style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,.61,.36,1)' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
              {Math.round(goal.current_value)}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)', marginTop: 1 }}>
              of {goal.target_value}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ flex: 1 }}>
          <div className="stat" style={{ marginBottom: 10 }}>
            <div className="n">{pct}<small>%</small></div>
            <div className="l">{goal.timeframe} reading goal</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color, background: color + '20',
              border: '1px solid ' + color + '40',
              borderRadius: 20, padding: '1px 7px',
            }}>
              {PACE_LABELS[goal.pace_status] ?? goal.pace_status}
            </span>
            <span style={{ fontSize: 10, color: 'var(--mut)', fontFamily: 'var(--mono)' }}>
              {goal.days_remaining}d left
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .6s cubic-bezier(.22,.61,.36,1)' }} />
      </div>

      {/* Navigate to Goals */}
      <button
        onClick={onNavigate}
        style={{ background: 'none', border: 'none', color: 'var(--mut)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0 }}
      >
        {goal.icon} {goal.title} · view in Goals →
      </button>
    </div>
  );
}

// ── Goal ring ─────────────────────────────────────────────────────────────────

function GoalRing({ done, goal, setGoal }: { done: number; goal: number; setGoal: (n: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(String(goal));
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;

  const save = async () => {
    const n = parseInt(val, 10);
    if (n > 0) await setGoal(n);
    setEditing(false);
  };

  const R   = 34;
  const C   = parseFloat((2 * Math.PI * R).toFixed(1));
  const off = C * (1 - pct / 100);

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
      {/* Ring with done/goal centred inside */}
      <div style={{ position: 'relative', flexShrink: 0, width: 88, height: 88 }}>
        <svg width={88} height={88} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle r={R} cx={44} cy={44} fill="none" stroke="var(--ph)" strokeWidth={7} />
          <circle
            r={R} cx={44} cy={44} fill="none"
            stroke="var(--accent)" strokeWidth={7} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={off}
            style={{ transition: 'stroke-dashoffset .55s cubic-bezier(.22,.61,.36,1)' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{done}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mut)', marginTop: 1 }}>of {goal}</span>
        </div>
      </div>

      {/* Stats + change-goal */}
      <div style={{ flex: 1 }}>
        <div className="stat" style={{ marginBottom: 12 }}>
          <div className="n">{pct}<small>%</small></div>
          <div className="l">{new Date().getFullYear()} reading goal</div>
        </div>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number" min={1} value={val} autoFocus
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              className="hs-input"
              style={{ width: 72, padding: '5px 9px' }}
            />
            <button className="btn"       style={{ fontSize: 11, padding: '5px 10px' }} onClick={save}>Save</button>
            <button className="btn ghost" style={{ fontSize: 11, padding: '5px 8px'  }} onClick={() => setEditing(false)}>✕</button>
          </div>
        ) : (
          <button
            className="btn ghost"
            style={{ fontSize: 11, padding: '5px 10px' }}
            onClick={() => { setVal(String(goal)); setEditing(true); }}
          >
            Change goal
          </button>
        )}
      </div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ books, streak }: { books: Book[]; streak: number }) {
  const year       = new Date().getFullYear();
  const thisYear   = booksReadThisYear(books);
  const pagesRead  = books.reduce((s, b) => s + (b.pages_read ?? 0), 0);
  const month      = new Date().getMonth() + 1;
  const avgPerMo   = month > 0 ? (thisYear.length / month).toFixed(1) : '0.0';

  const stats = [
    { n: thisYear.length,            l: `books ${year}` },
    { n: pagesRead.toLocaleString(), l: 'pages read'    },
    { n: avgPerMo,                   l: 'avg/month'     },
    { n: streak,                     l: 'day streak'    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 1,
      background: 'var(--card-bd)',
      borderRadius: 14,
      overflow: 'hidden',
      border: '1px solid var(--card-bd)',
    }}>
      {stats.map(({ n, l }) => (
        <div key={l} style={{
          background: 'var(--bg2)',
          padding: '16px 18px',
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: 'var(--text)' }}>
            {n}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 4 }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function ReadingDeep() {
  const { setTab }                                          = useDashboard();
  const { books, loading, goal, addBook, updateBook, deleteBook, setGoal, doneThisYear } = useReading();
  const { done, history }                                   = useHabits();
  const { goals: allGoals, refresh: refreshGoals }          = useGoals();

  const handleUpdateBook: ReadingCtxUpdate = useCallback(async (id, patch) => {
    await updateBook(id, patch);
    if (patch.status !== undefined) refreshGoals();
  }, [updateBook, refreshGoals]);

  const today   = localDateKey();
  const streak  = calcStreak('read', today, done, history, true);

  // Reading goals from the Goals tab: books-tracker goals plus "Read N days"
  // habit goals, limited to ones whose period covers today (no stale months).
  const isReadingGoal = (g: GoalWithProgress) =>
    g.metric_source === 'books' ||
    (g.metric_source === 'habits' && g.metric_field === 'read');
  const readingGoals = allGoals.filter(g =>
    isReadingGoal(g) && g.timeframe_start <= today && today <= g.timeframe_end,
  );
  const yearlyGoals  = readingGoals.filter(g => g.timeframe === 'yearly' || g.timeframe === 'custom');
  const monthlyGoals = readingGoals.filter(g => g.timeframe !== 'yearly' && g.timeframe !== 'custom');
  // A non-books yearly goal (e.g. "Read 300 days") must not hide the books ring.
  const hasBooksGoal = yearlyGoals.some(g => g.metric_source === 'books');

  const year     = new Date().getFullYear();
  const reading  = books.filter(b => b.status === 'reading');
  const queued   = books.filter(b => b.status === 'queued').sort((a, b) => a.sort_order - b.sort_order);
  const finished = books.filter(b => b.status === 'done')
    .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''));
  const thisYear = finished.filter(b => b.finished_at?.startsWith(String(year)));

  return (
    <div className="canvas">
      <button className="btn-back" onClick={() => setTab('dashboard')}>← Dashboard</button>

      <div className="deep-head">
        <div>
          <h1>Reading</h1>
          <div className="sub">
            {loading
              ? 'Loading…'
              : `${books.length} BOOKS · ${reading.length} READING · ${queued.length} QUEUED · ${finished.length} FINISHED`
            }
          </div>
        </div>
      </div>

      {!loading && <StatsBar books={books} streak={streak} />}

      <div style={{ marginTop: 16 }}>
        <div className="two-col">
          <div className="stack">
            <AddBookForm addBook={addBook} />
            <CurrentlyReading books={reading} updateBook={handleUpdateBook} />
            <QueueSection books={queued} updateBook={handleUpdateBook} deleteBook={deleteBook} />
          </div>

          <div className="stack">
            <Panel glyph="◎" title={`${year} Goal`}>
              {yearlyGoals.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {!hasBooksGoal && <GoalRing done={doneThisYear} goal={goal} setGoal={setGoal} />}
                  {yearlyGoals.map(g => (
                    <LinkedGoalDisplay key={g.id} goal={g} onNavigate={() => setTab('goals')} />
                  ))}
                </div>
              ) : (
                <>
                  <GoalRing done={doneThisYear} goal={goal} setGoal={setGoal} />
                  <button
                    onClick={() => setTab('goals')}
                    style={{ background: 'none', border: 'none', color: 'var(--mut)', fontSize: 11, cursor: 'pointer', padding: 0, marginTop: 4 }}
                  >
                    + Set a reading goal in Goals →
                  </button>
                </>
              )}
            </Panel>
            {monthlyGoals.length > 0 && (
              <Panel glyph="◐" title="This Month">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {monthlyGoals.map(g => (
                    <LinkedGoalDisplay key={g.id} goal={g} onNavigate={() => setTab('goals')} />
                  ))}
                </div>
              </Panel>
            )}
            {thisYear.length > 0 && (
              <FinishedSection books={thisYear} updateBook={handleUpdateBook} title={`${year} Finished`} />
            )}
          </div>
        </div>

        {finished.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <FinishedSection books={finished} updateBook={handleUpdateBook} title="All Time" allTime />
          </div>
        )}
      </div>
    </div>
  );
}
