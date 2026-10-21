import type { DayConsistency } from '../../hooks/useWeeklyConsistency';

interface WeekStripProps {
  days: DayConsistency[];
  onSelect: (day: DayConsistency) => void;
}

function Dot({
  done,
  future,
  colour,
}: {
  done: boolean;
  future: boolean;
  colour: string;
}) {
  return (
    <span
      className={`size-2 rounded-full ${
        future ? 'bg-sunken' : done ? colour : 'bg-sunken-strong'
      }`}
    />
  );
}

// Seven day tiles. Dots follow the discipline colours: training, food, weight.
export function WeekStrip({ days, onSelect }: WeekStripProps) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => (
        <button
          key={day.date}
          type="button"
          onClick={() => onSelect(day)}
          disabled={day.isFuture}
          aria-label={`${day.date}${day.isToday ? ', today' : ''}`}
          className={`flex flex-col items-center gap-1.5 h-14 justify-center rounded-lg border transition-colors ${
            day.isToday
              ? 'bg-surface border-line-strong'
              : 'border-transparent hover:bg-sunken'
          } ${day.isFuture ? 'opacity-40' : ''}`}
        >
          <span
            className={`text-sm font-semibold ${
              day.isToday ? 'text-ink' : 'text-ink-2'
            }`}
          >
            {day.dayLabel}
          </span>
          <span className="flex gap-1 h-2">
            {day.isScheduledWorkoutDay && (
              <Dot
                done={day.hasWorkout}
                future={day.isFuture}
                colour="bg-train"
              />
            )}
            <Dot done={day.hasFood} future={day.isFuture} colour="bg-eat" />
            <Dot done={day.hasWeight} future={day.isFuture} colour="bg-body" />
          </span>
        </button>
      ))}
    </div>
  );
}
