export type BookStatus = 'reading' | 'done' | 'queued';

export type Book = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  status: BookStatus;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  notes: string | null;
  pages: number | null;
  pages_read: number;
  sort_order: number;
  progress_date: string | null;
  created_at: string;
  updated_at: string;
};

export function bookPct(book: Book): number {
  if (!book.pages || book.pages <= 0) return 0;
  return Math.min(100, Math.round((book.pages_read / book.pages) * 100));
}

export function booksReadThisYear(books: Book[]): Book[] {
  const year = new Date().getFullYear();
  return books.filter(b => b.status === 'done' && b.finished_at?.startsWith(String(year)));
}
