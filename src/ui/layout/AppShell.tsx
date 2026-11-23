import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { strings } from '../strings';

const icon = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const ITEMS: { to: string; label: string; end?: boolean; svg: ReactNode }[] = [
  {
    to: '/',
    label: strings.nav.library,
    end: true,
    svg: (
      <svg {...icon}>
        <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H6a2 2 0 0 0-2 2z" />
        <path d="M4 19a2 2 0 0 1 2-2h14" />
      </svg>
    ),
  },
  {
    to: '/study',
    label: strings.nav.study,
    svg: (
      <svg {...icon}>
        <path d="M12 3 2 8l10 5 10-5z" />
        <path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
      </svg>
    ),
  },
  {
    to: '/stats',
    label: strings.nav.stats,
    svg: (
      <svg {...icon}>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: strings.nav.settings,
    svg: (
      <svg {...icon}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
      </svg>
    ),
  },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 text-xs font-medium',
    'md:min-h-11 md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:text-sm',
    isActive
      ? 'text-accent-600 md:bg-accent-50 dark:text-accent-500 dark:md:bg-slate-800'
      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
  ].join(' ');

export default function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex dark:bg-slate-950 dark:text-slate-100">
      <main tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none md:pb-8">
        <Outlet />
      </main>
      <nav
        aria-label={strings.nav.main}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:static md:order-first md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-e md:border-t-0 md:p-3 dark:border-slate-800 dark:bg-slate-900"
      >
        <span className="hidden px-3 py-3 text-lg font-bold md:block">{strings.app.title}</span>
        {ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            {item.svg}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
