import { AlertTriangle, Check, LogOut, RefreshCw } from 'lucide-react';
import type { getGoogleAuthStatus } from '../../services/googleAuth';
import { Button } from '../ui';
import { GoogleIcon } from './GoogleIcon';

type GoogleUser = ReturnType<typeof getGoogleAuthStatus>['user'];

interface BackupPanelProps {
  googleUser: GoogleUser;
  needsReconnect: boolean;
  lastBackup: string | null | undefined;
  isLoading: boolean;
  onSignIn: () => void;
  onReconnect: () => void;
  onBackupNow: () => void;
  onDisconnect: () => void;
}

// Body of the Auto Backup row: connected-account status plus its actions, or
// the sign-in prompt when no account is linked.
export function BackupPanel({
  googleUser,
  needsReconnect,
  lastBackup,
  isLoading,
  onSignIn,
  onReconnect,
  onBackupNow,
  onDisconnect,
}: BackupPanelProps) {
  if (!googleUser) {
    return (
      <div className="space-y-4">
        <p className="text-ink-2 text-sm">
          Sign in with Google to automatically back up your data to Google
          Drive. Your data stays in your own Drive account.
        </p>
        <Button
          variant="secondary"
          size="lg"
          onClick={onSignIn}
          isLoading={isLoading}
          className="w-full"
        >
          <GoogleIcon />
          Sign in with Google
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-3 ${
          needsReconnect ? 'border-warn bg-warn-soft' : 'border-eat bg-eat-soft'
        }`}
      >
        <div className="flex items-center gap-3">
          <img
            src={googleUser.picture}
            alt=""
            className="size-9 rounded-full"
            referrerPolicy="no-referrer"
          />
          <div className="flex-1 min-w-0">
            <p
              className={`flex items-center gap-1.5 text-sm font-semibold ${
                needsReconnect ? 'text-warn' : 'text-eat-ink'
              }`}
            >
              {needsReconnect ? (
                <AlertTriangle size={14} aria-hidden="true" />
              ) : (
                <Check size={14} aria-hidden="true" />
              )}
              {needsReconnect ? 'Reconnect required' : 'Connected'}
            </p>
            <p className="text-ink-2 text-sm truncate">{googleUser.email}</p>
          </div>
        </div>
        {lastBackup && (
          <p className="text-ink-2 text-sm mt-2">
            Last backup:{' '}
            <span className="num">{new Date(lastBackup).toLocaleString()}</span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        {needsReconnect ? (
          <Button
            size="lg"
            onClick={onReconnect}
            isLoading={isLoading}
            className="w-full"
          >
            <RefreshCw size={18} aria-hidden="true" />
            Reconnect Google Drive
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            onClick={onBackupNow}
            isLoading={isLoading}
            className="w-full"
          >
            <RefreshCw size={18} aria-hidden="true" />
            Backup Now
          </Button>
        )}
        <Button variant="danger" onClick={onDisconnect} className="w-full">
          <LogOut size={18} aria-hidden="true" />
          Disconnect Google Drive
        </Button>
      </div>
    </div>
  );
}
