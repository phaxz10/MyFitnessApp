import {
  Dumbbell,
  Home,
  Library,
  PersonStanding,
  Utensils,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { DISCIPLINE_TEXT, type Discipline } from './discipline';

const navItems: {
  to: string;
  icon: typeof Home;
  label: string;
  discipline: Discipline;
}[] = [
  { to: '/', icon: Home, label: 'Today', discipline: 'neutral' },
  { to: '/workout', icon: Dumbbell, label: 'Train', discipline: 'train' },
  { to: '/calories', icon: Utensils, label: 'Eat', discipline: 'eat' },
  { to: '/weight', icon: PersonStanding, label: 'Body', discipline: 'body' },
  { to: '/exercises', icon: Library, label: 'Exercises', discipline: 'train' },
];

const ACTIVE_BAR: Record<Discipline, string> = {
  neutral: 'bg-ink',
  train: 'bg-train',
  eat: 'bg-eat',
  body: 'bg-body',
};

export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label, discipline }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-0.5 h-16 text-xs font-semibold transition-colors ${
                isActive
                  ? DISCIPLINE_TEXT[discipline]
                  : 'text-ink-3 hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`absolute top-0 inset-x-4 h-[3px] rounded-b ${isActive ? ACTIVE_BAR[discipline] : 'bg-transparent'}`}
                />
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
