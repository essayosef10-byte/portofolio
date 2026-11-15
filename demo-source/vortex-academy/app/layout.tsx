import type {Metadata} from 'next';
import './globals.css'; // Global styles
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Vortex - Academic Operating System',
  description: 'Vortex is a modern Academic Operating System featuring an Academic Command Center, coursework progress tracking, task prioritizer, Assignments Hub, Quizzes system, Grades analytics, Schedule agenda, personalized Student Notification Center, Admin Moderation Inbox, and Student Profile & System Settings.',
  openGraph: {
    title: 'Vortex - Academic Operating System',
    description: 'Vortex is a modern Academic Operating System featuring an Academic Command Center, coursework progress tracking, task prioritizer, Assignments Hub, Quizzes system, Grades analytics, Schedule agenda, personalized Student Notification Center, Admin Moderation Inbox, and Student Profile & System Settings.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vortex - Academic Operating System',
    description: 'Vortex is a modern Academic Operating System featuring an Academic Command Center, coursework progress tracking, task prioritizer, Assignments Hub, Quizzes system, Grades analytics, Schedule agenda, personalized Student Notification Center, Admin Moderation Inbox, and Student Profile & System Settings.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
