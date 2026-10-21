import { Coffee } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../../hooks/useAppStore';
import { getLocalDateString } from '../../utils/date';
import { Button, Modal } from '../ui';
import {
  answer,
  COFFEE_URL,
  loadState,
  recordActiveDay,
  type SupportAnswer,
  saveState,
  shouldAsk,
} from './supportSchedule';

// Occasional, polite support ask. Shown only on Today, online, after the
// person has used the app on enough separate days; easy to dismiss forever.
export function SupportPrompt() {
  const { pathname } = useLocation();
  const isOnline = useAppStore((s) => s.isOnline);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const state = recordActiveDay(loadState(now), getLocalDateString());
    saveState(state);
    if (pathname !== '/' || !isOnline || !shouldAsk(state, now)) return;
    // Let the page settle first; never interrupt the first glance.
    const t = setTimeout(() => setOpen(true), 4000);
    return () => clearTimeout(t);
  }, [pathname, isOnline]);

  const close = (choice: SupportAnswer) => {
    saveState(answer(loadState(Date.now()), choice, Date.now()));
    setOpen(false);
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => close('later')}
      title="Enjoying MyPersonalFitness?"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-ink-2">
          It's free, has no ads and keeps your data on your device. If it helps
          your training, a coffee keeps it going.
        </p>
        <a
          href={COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => close('thanks')}
          className="flex items-center justify-center gap-2 h-13 rounded-xl bg-ink text-canvas font-semibold text-lg hover:opacity-90 transition"
        >
          <Coffee size={20} aria-hidden="true" />
          Buy me a coffee
        </a>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => close('later')}>
            Maybe later
          </Button>
          <Button variant="ghost" onClick={() => close('never')}>
            Don't ask again
          </Button>
        </div>
      </div>
    </Modal>
  );
}
