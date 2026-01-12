import { NavLink } from 'react-router-dom';
import {
  Home,
  Utensils,
  Dumbbell,
  PersonStanding,
  Library,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/calories', icon: Utensils, label: 'Nutrition' },
  { to: '/workout', icon: Dumbbell, label: 'Training' },
  { to: '/exercises', icon: Library, label: 'Exercises' },
  { to: '/weight', icon: PersonStanding, label: 'Body' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50 px-1 pb-safe">
      <div className="flex justify-around items-center h-14 max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center min-w-[3.5rem] py-1.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-blue-400 bg-blue-500/10'
                  : 'text-slate-500 hover:text-slate-300 active:scale-95'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-0.5 rounded-lg transition-colors ${isActive ? 'bg-blue-500/20' : ''}`}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span
                  className={`text-[9px] mt-0.5 font-medium ${isActive ? 'text-blue-400' : ''}`}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
