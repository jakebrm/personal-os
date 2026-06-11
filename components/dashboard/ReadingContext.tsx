'use client';
import {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react';
import type { Book } from '@/lib/books';
import { booksReadThisYear } from '@/lib/books';
import { useDemo }           from './DemoContext';
import { DEMO_BOOKS, DEMO_BOOK_GOAL } from '@/lib/demoData';

type ReadingCtx = {
  books:      Book[];
  loading:    boolean;
  goal:       number;
  addBook:    (fields: { title: string; author?: string; pages?: number; status?: Book['status']; finished_at?: string }) => Promise<void>;
  updateBook: (id: string, patch: Partial<Book> & { pages_read?: number }) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  setGoal:    (n: number) => Promise<void>;
  doneThisYear: number;
};

const Ctx = createContext<ReadingCtx | null>(null);

export function useReading(): ReadingCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useReading must be used inside ReadingProvider');
  return ctx;
}

export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const { isDemo, notifyWrite } = useDemo();
  const isDemoRef = useRef(false);
  isDemoRef.current = isDemo;

  const [books,   setBooks]   = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [goal,    setGoalState] = useState(24);

  useEffect(() => {
    if (isDemo) { setBooks(DEMO_BOOKS); setGoalState(DEMO_BOOK_GOAL); setLoading(false); return; }

    let cancelled = false;

    Promise.all([
      fetch('/api/books').then(r => r.json()),
      fetch(`/api/books/goal?year=${new Date().getFullYear()}`).then(r => r.json()),
    ])
      .then(([booksData, goalData]) => {
        if (cancelled) return;
        setBooks(booksData.books ?? []);
        setGoalState(goalData.goal ?? 24);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isDemo]);

  const addBook = useCallback(async (fields: {
    title: string; author?: string; pages?: number; status?: Book['status']; finished_at?: string;
  }) => {
    if (isDemoRef.current) {
      notifyWrite();
      const b: Book = { id:`demo-${Date.now()}`, user_id:'demo', title:fields.title, author:fields.author??null, cover_url:null, status:fields.status??'queued', started_at:null, finished_at:null, rating:null, notes:null, pages:fields.pages??null, pages_read:0, sort_order:0, progress_date:null, created_at:new Date().toISOString(), updated_at:new Date().toISOString() };
      setBooks(prev => [...prev, b]);
      return;
    }
    const res  = await fetch('/api/books', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const { book } = await res.json() as { book: Book };
    if (book) setBooks(prev => [...prev, book]);
  }, []);

  const updateBook = useCallback(async (id: string, patch: Partial<Book> & { pages_read?: number }) => {
    if (isDemoRef.current) { notifyWrite(); setBooks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b)); return; }
    const res  = await fetch(`/api/books/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const { book } = await res.json() as { book: Book };
    if (book) setBooks(prev => prev.map(b => b.id === id ? book : b));
  }, []);

  const deleteBook = useCallback(async (id: string) => {
    setBooks(prev => prev.filter(b => b.id !== id));
    if (isDemoRef.current) { notifyWrite(); return; }
    await fetch(`/api/books/${id}`, { method: 'DELETE' });
  }, [notifyWrite]);

  const setGoal = useCallback(async (n: number) => {
    setGoalState(n);
    if (isDemoRef.current) { notifyWrite(); return; }
    const year = new Date().getFullYear();
    await fetch('/api/books/goal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: n, year }),
    }).catch(() => {});
  }, []);

  const doneThisYear = booksReadThisYear(books).length;

  return (
    <Ctx.Provider value={{ books, loading, goal, addBook, updateBook, deleteBook, setGoal, doneThisYear }}>
      {children}
    </Ctx.Provider>
  );
}
