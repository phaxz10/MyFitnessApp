import { NavLink } from 'react-router-dom';
import { Home, Utensils, Dumbbell, Scale, Library } from 'lucide-react';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/calories', icon: Utensils, label: 'Calories' },
  { to: '/workout', icon: Dumbbell, label: 'Workout' },
  { to: '/exercises', icon: Library, label: 'Exercises' },
  { to: '/weight', icon: Scale, label: 'Weight' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 px-2 pb-safe">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'text-blue-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            <Icon size={24} />
            <span className="text-xs mt-1">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
