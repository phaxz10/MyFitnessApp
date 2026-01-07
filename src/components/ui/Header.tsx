import { Link } from 'react-router-dom';
import { Settings, Wifi, WifiOff } from 'lucide-react';
import { useAppStore } from '../../hooks/useAppStore';

export function Header() {
  const isOnline = useAppStore((state) => state.isOnline);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-700">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <h1 className="text-lg font-bold text-white">MyPersonalFitness</h1>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi size={18} className="text-green-500" />
          ) : (
            <WifiOff size={18} className="text-red-500" />
          )}
          <Link
            to="/settings"
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
          >
            <Settings size={20} />
          </Link>
        </div>
      </div>
    </header>
  );
}
