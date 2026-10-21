import { Check, Link2, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GeneratorState } from '../../../hooks/useProgramGenerator';
import { formatRepTarget } from '../../training/format';
import { ExerciseMark } from '../../ui';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="text-sm font-semibold text-ink-2 mb-2">{children}</h4>;
}

export function ReviewStep({ state }: { state: GeneratorState }) {
  const program = state.generatedProgram;
  if (!program) return null;

  const newExercises = state.exerciseMappings.filter(
    (m) => m.status === 'needs_creation',
  );
  const matchedExercises = state.exerciseMappings.filter(
    (m) => m.status === 'matched' || m.status === 'duplicate_found',
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-ink">{program.programName}</h3>
        <p className="text-ink-2 mt-1">{program.programDescription}</p>
      </div>

      <section>
        <SubHeading>
          Sessions (<span className="num">{program.sessions.length}</span>)
        </SubHeading>
        <div className="space-y-3">
          {program.sessions.map((session) => {
            const dayName =
              session.dayOfWeek !== null
                ? DAY_NAMES[session.dayOfWeek]
                : 'Flexible';

            // Divide by 2 since both exercises reference each other
            const supersetCount =
              session.exercises.filter((ex) => ex.supersetWith).length / 2;

            return (
              <div
                key={`session-${session.name}-${session.dayOfWeek}`}
                className="rounded-xl border border-line overflow-hidden"
              >
                <div className="flex items-baseline justify-between gap-2 px-4 py-2.5 bg-sunken">
                  <p className="min-w-0 truncate">
                    <span className="font-semibold text-ink">
                      {session.name}
                    </span>
                    <span className="text-ink-2 text-sm ml-2">{dayName}</span>
                  </p>
                  <p className="text-ink-3 text-sm shrink-0">
                    <span className="num">{session.exercises.length}</span>{' '}
                    exercises
                    {supersetCount > 0 && (
                      <>
                        {' · '}
                        <span className="num">{Math.floor(supersetCount)}</span>{' '}
                        superset{supersetCount >= 2 ? 's' : ''}
                      </>
                    )}
                  </p>
                </div>
                <ul className="divide-y divide-line">
                  {session.exercises.map((ex) => {
                    const target = formatRepTarget(
                      ex.targetRepMin,
                      ex.targetRepMax,
                      ex.targetDurationSeconds ?? null,
                    );
                    return (
                      <li
                        key={`ex-${ex.name}`}
                        className="flex items-center gap-3 px-4 py-2"
                      >
                        <ExerciseMark name={ex.name} size={32} />
                        <span className="flex-1 min-w-0 truncate text-ink">
                          {ex.name}
                        </span>
                        {ex.supersetWith && (
                          <Link2
                            size={14}
                            className="text-ink-3 shrink-0"
                            aria-label="Superset"
                          />
                        )}
                        <span className="num font-bold text-ink shrink-0">
                          {ex.targetSets}
                          {target && (
                            <>
                              <span className="text-ink-3 font-medium mx-0.5">
                                ×
                              </span>
                              {target}
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SubHeading>Weekly Volume</SubHeading>
        <ul className="grid grid-cols-2 gap-x-4 border-t border-line">
          {Object.entries(program.weeklyVolumeSummary.muscleGroupBreakdown).map(
            ([muscle, sets]) => (
              <li
                key={muscle}
                className="flex justify-between py-2 border-b border-line"
              >
                <span className="text-ink-2 text-sm">{muscle}</span>
                <span className="text-sm text-ink-3">
                  <span className="num font-bold text-ink">{sets}</span> sets
                </span>
              </li>
            ),
          )}
        </ul>
      </section>

      <section>
        <SubHeading>Exercise Library</SubHeading>
        <div className="space-y-1.5">
          {matchedExercises.length > 0 && (
            <p className="flex items-center gap-2 text-eat-ink text-sm">
              <Check size={16} aria-hidden="true" />
              <span className="num">{matchedExercises.length}</span> exercises
              found in your library
            </p>
          )}
          {newExercises.length > 0 && (
            <p className="flex items-center gap-2 text-ink text-sm">
              <Sparkles size={16} aria-hidden="true" />
              <span className="num">{newExercises.length}</span> new exercises
              will be added
            </p>
          )}
        </div>
      </section>

      {program.recommendations.length > 0 && (
        <section className="p-4 rounded-xl bg-sunken">
          <SubHeading>Tips</SubHeading>
          <ul className="space-y-1.5 list-disc pl-5 text-ink-2 text-sm">
            {program.recommendations.map((tip) => (
              <li key={`tip-${tip.slice(0, 20)}`}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
