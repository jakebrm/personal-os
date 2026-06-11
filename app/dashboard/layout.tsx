import { Space_Grotesk, Space_Mono } from 'next/font/google';
import { Shell } from '@/components/dashboard/Shell';
import './dashboard.css';

const sg = Space_Grotesk({ subsets: ['latin'], weight: ['400','500','600','700'], display: 'swap' });
// Imported so next/font registers the @font-face; var(--mono) references it by name in CSS
const sm = Space_Mono({ subsets: ['latin'], weight: ['400','700'], display: 'swap' });
void sm;

export const metadata = { title: 'Personal OS' };

// Shell lives in the layout (not the pages) so tab navigation between
// /dashboard and /dashboard/* re-renders it in place instead of remounting
// the whole provider/widget tree on every switch.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={sg.className} style={{ minHeight: '100vh' }}>
      <Shell />
      {children}
    </div>
  );
}
