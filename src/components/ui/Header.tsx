import { Settings, WifiOff } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../../hooks/useAppStore';
import { DISCIPLINE_FILL, disciplineForPath } from './discipline';

const SECTION_TITLES: [prefix: string, title: string][] = [
  ['/calories', 'Nutrition'],
  ['/workout', 'Training'],
  ['/exercises', 'Exercises'],
  ['/weight', 'Body'],
  ['/settings', 'Settings'],
];

function titleForPath(pathname: string): string {
  return (
    SECTION_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
    'Today'
  );
}

// Discipline band: the section name on a flat field of its colour.
export function Header() {
  const isOnline = useAppStore((state) => state.isOnline);
  const { pathname } = useLocation();
  const discipline = disciplineForPath(pathname);

  return (
    <header
      className={`sticky top-0 z-40 pt-[env(safe-area-inset-top)] ${DISCIPLINE_FILL[discipline]}`}
    >
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <h1 className="text-xl font-bold tracking-tight">
          {titleForPath(pathname)}
        </h1>
        <div className="flex items-center gap-1">
          {!isOnline && (
            <span className="flex items-center gap-1 text-sm font-medium opacity-90">
              <WifiOff size={16} aria-hidden="true" />
              Offline
            </span>
          )}
          {pathname !== '/settings' && (
            <Link
              to="/settings"
              aria-label="Settings"
              className="grid place-items-center size-11 rounded-full opacity-90 hover:opacity-100 hover:bg-white/15 transition"
            >
              <Settings size={20} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
