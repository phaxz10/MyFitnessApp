import { AlertTriangle, Loader2, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelCatalogEntry } from '../../services/ai/openrouterModels';
import {
  filterModels,
  priceTag,
  useModelCatalog,
} from '../../services/ai/openrouterModels';

// Searchable model combobox backed by OpenRouter's live public models list
// (see src/services/ai/openrouterModels.ts). Plain controlled component —
// Onboarding and Settings wire it into their own form state.
//
// The *value* is the OpenRouter model id. The input text IS the value: every
// keystroke commits, so a power user can type an id the catalog doesn't know
// about (or fight an offline fetch) and still land on a valid model string.

const MAX_RENDERED_OPTIONS = 60;

interface ModelComboboxProps {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelCombobox({
  value,
  onChange,
  disabled,
}: ModelComboboxProps) {
  const { models, isLoading, error, refetch } = useModelCatalog();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the input text in sync when the parent changes the value (e.g.
  // Settings resets the form from the saved profile).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const allMatches = useMemo(
    () => filterModels(models, query),
    [models, query],
  );
  const matches = allMatches.slice(0, MAX_RENDERED_OPTIONS);
  const totalMatches = allMatches.length;
  const queryHasExactMatch = useMemo(
    () => !!query.trim() && models.some((m) => m.id === query.trim()),
    [models, query],
  );
  // "Use <query>" row appended when the typed text isn't already a known id —
  // keeps manual entry (new models, offline catalog) one keystroke away.
  const showCustomRow = !!query.trim() && !queryHasExactMatch;

  const select = (id: string) => {
    onChange(id);
    setQuery(id);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, matches.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlight >= 0 && matches[highlight]) {
          select(matches[highlight].id);
        } else {
          select(query.trim());
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlight(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          id="ai-model"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={query}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search models (e.g. claude, gpt, llama, free…)"
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setHighlight(-1);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 pr-9 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Search size={16} />
          )}
        </span>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-lg">
          {error ? (
            <div className="p-3 text-sm">
              <p className="text-amber-300 flex items-center gap-2">
                <AlertTriangle size={14} />
                Couldn&apos;t load the OpenRouter model list.
              </p>
              <p className="text-slate-400 text-xs mt-1">
                You can still type a model id manually.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-2 inline-flex items-center gap-1.5 text-blue-400 text-xs hover:underline"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          ) : matches.length === 0 && !isLoading ? (
            <p className="p-3 text-slate-400 text-sm">
              No models match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <>
              <div role="listbox" aria-label="OpenRouter models">
                {matches.map((m, i) => (
                  <ModelOption
                    key={m.id}
                    entry={m}
                    active={i === highlight}
                    onMouseDown={(e) => {
                      // Use mousedown so the input's blur doesn't swallow
                      // the click before selection registers.
                      e.preventDefault();
                      select(m.id);
                    }}
                  />
                ))}
              </div>
              {totalMatches > matches.length && (
                <p className="px-3 py-2 text-xs text-slate-500 border-t border-slate-700">
                  {totalMatches - matches.length} more — refine your search to
                  see them
                </p>
              )}
              {showCustomRow && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(query.trim());
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-slate-700 border-t border-slate-700"
                >
                  Use &ldquo;{query.trim()}&rdquo; anyway
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ModelOption({
  entry,
  active,
  onMouseDown,
}: {
  entry: ModelCatalogEntry;
  active: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={onMouseDown}
      className={`w-full px-3 py-2 text-left ${active ? 'bg-blue-500/20' : 'hover:bg-slate-700'}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm text-white truncate">{entry.name}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {entry.free && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">
              free
            </span>
          )}
          {entry.vision && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
              vision
            </span>
          )}
          <span className="text-xs text-slate-400">{priceTag(entry)}</span>
        </span>
      </span>
      <span className="block text-xs text-slate-500 truncate">{entry.id}</span>
    </button>
  );
}
