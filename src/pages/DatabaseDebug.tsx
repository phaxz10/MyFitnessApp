import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TextArea,
} from '../components/ui';
import { getDB } from '../services/db';

interface TableInfo {
  name: string;
  count: number;
}

export function DatabaseDebug() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [customQuery, setCustomQuery] = useState('');
  const [queryResult, setQueryResult] = useState<
    Record<string, unknown>[] | null
  >(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDB();

      const tableNames = [
        'user_profiles',
        'exercises',
        'workout_programs',
        'program_sessions',
        'program_exercises',
        'workout_logs',
        'workout_sets',
        'exercise_notes',
        'calorie_entries',
        'weight_entries',
      ];

      const tablesWithCounts: TableInfo[] = [];
      for (const name of tableNames) {
        try {
          const result = await db.query(
            `SELECT COUNT(*) as count FROM ${name}`,
          );
          const count = (result.rows[0] as { count: number }).count;
          tablesWithCounts.push({ name, count: Number(count) });
        } catch {
          tablesWithCounts.push({ name, count: -1 });
        }
      }

      setTables(tablesWithCounts);
    } catch (err) {
      console.error('Failed to fetch tables:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTableData = async (tableName: string) => {
    try {
      const db = await getDB();
      // Truncate long text columns (e.g. photo_data) so the browser stays light.
      const cols = await db.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName],
      );
      const select =
        cols.rows.length > 0
          ? (cols.rows as { column_name: string; data_type: string }[])
              .map(({ column_name: c, data_type: t }) =>
                t === 'text' || t.startsWith('character')
                  ? `left("${c}", 200) AS "${c}"`
                  : `"${c}"`,
              )
              .join(', ')
          : '*';
      const result = await db.query(
        `SELECT ${select} FROM ${tableName} ORDER BY id DESC LIMIT 50`,
      );
      setTableData(result.rows as Record<string, unknown>[]);
      setSelectedTable(tableName);
    } catch (err) {
      console.error('Failed to fetch table data:', err);
    }
  };

  const runCustomQuery = async () => {
    if (!customQuery.trim()) return;

    setQueryError(null);
    setQueryResult(null);

    try {
      const db = await getDB();
      const result = await db.query(customQuery);
      setQueryResult(result.rows as Record<string, unknown>[]);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed');
    }
  };

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-canvas grid place-items-center">
        <Loader2
          size={40}
          className="text-ink-2 animate-spin"
          aria-label="Loading tables"
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-4 space-y-4">
      <div className="flex items-center gap-1 -ml-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="grid place-items-center size-11 rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-ink">Database Debug</h1>
        <button
          type="button"
          onClick={fetchTables}
          aria-label="Refresh tables"
          className="ml-auto grid place-items-center size-11 rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tables</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {tables.map((table) => (
              <button
                key={table.name}
                type="button"
                onClick={() => fetchTableData(table.name)}
                className={`min-h-11 px-3 py-2 rounded-lg text-left transition-colors ${
                  selectedTable === table.name
                    ? 'bg-train text-on-accent'
                    : 'bg-sunken text-ink-2 hover:bg-sunken-strong'
                }`}
              >
                <p className="font-semibold text-sm">{table.name}</p>
                <p className="text-sm opacity-80">
                  <span className="num">{table.count}</span> rows
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TextArea
            label="SQL"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="SELECT * FROM workout_sets WHERE workout_log_id = 100"
            className="font-mono"
            rows={4}
          />
          <Button onClick={runCustomQuery} size="lg" className="w-full">
            Run Query
          </Button>

          {queryError && (
            <div
              role="alert"
              className="p-3 bg-danger-soft border border-danger rounded-xl text-danger text-sm"
            >
              {queryError}
            </div>
          )}

          {queryResult && (
            <div className="space-y-2">
              <p className="text-ink-2 text-sm">
                <span className="num font-bold">{queryResult.length}</span>{' '}
                results
              </p>
              <pre className="text-xs text-ink-2 bg-sunken p-3 rounded-lg overflow-auto max-h-64">
                {JSON.stringify(queryResult, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTable && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedTable} (<span className="num">{tableData.length}</span>{' '}
              rows shown)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-ink-2 bg-sunken p-3 rounded-lg overflow-auto max-h-96">
              {JSON.stringify(tableData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
