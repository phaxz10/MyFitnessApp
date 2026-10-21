import {
  CheckCircle2,
  ChevronRight,
  Edit,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import type { WorkoutProgram } from '../../types';
import { Card } from '../ui';
import { Menu, MenuItem } from './Menu';

interface ProgramListProps {
  programs: WorkoutProgram[];
  onOpen: (programId: number) => void;
  onSetActive: (programId: number) => void;
  onDelete: (program: WorkoutProgram) => void;
}

export function ProgramList({
  programs,
  onOpen,
  onSetActive,
  onDelete,
}: ProgramListProps) {
  return (
    <Card>
      <ul className="divide-y divide-line">
        {programs.map((program) => (
          <li key={program.id} className="flex items-center pr-1">
            <button
              type="button"
              className="flex-1 min-w-0 flex items-center gap-2 pl-4 pr-2 py-3 text-left min-h-14 hover:bg-sunken transition-colors rounded-l-xl"
              onClick={() => onOpen(program.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-ink truncate">
                    {program.name}
                  </h3>
                  {program.is_active && (
                    <span className="shrink-0 rounded-full bg-train-soft text-train-ink px-2 py-0.5 text-sm font-semibold">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-ink-3 text-sm">
                  <span className="num">{program.sessions_per_week}</span>x per
                  week
                </p>
              </div>
              <ChevronRight
                size={20}
                className="text-ink-3 shrink-0"
                aria-hidden="true"
              />
            </button>

            <Menu
              label={`Actions for ${program.name}`}
              trigger={<MoreVertical size={20} />}
              triggerClassName="grid place-items-center size-11 rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
            >
              {(close) => (
                <>
                  {!program.is_active && (
                    <MenuItem
                      icon={<CheckCircle2 size={18} />}
                      onSelect={() => {
                        close();
                        onSetActive(program.id);
                      }}
                    >
                      Set Active
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={<Edit size={18} />}
                    onSelect={() => {
                      close();
                      onOpen(program.id);
                    }}
                  >
                    Edit
                  </MenuItem>
                  <MenuItem
                    danger
                    icon={<Trash2 size={18} />}
                    onSelect={() => {
                      close();
                      onDelete(program);
                    }}
                  >
                    Delete
                  </MenuItem>
                </>
              )}
            </Menu>
          </li>
        ))}
      </ul>
    </Card>
  );
}
