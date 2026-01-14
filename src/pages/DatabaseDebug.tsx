import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent } from '../components/ui';
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
      const result = await db.query(
        `SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 50`,
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 text-slate-400 hover:text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-white">Database Debug</h1>
        <button
          type="button"
          onClick={fetchTables}
          className="ml-auto p-2 text-slate-400 hover:text-white"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Tables Overview */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="text-lg font-semibold text-white mb-3">Tables</h2>
          <div className="grid grid-cols-2 gap-2">
            {tables.map((table) => (
              <button
                key={table.name}
                type="button"
                onClick={() => fetchTableData(table.name)}
                className={`p-3 rounded-lg text-left transition-colors ${
                  selectedTable === table.name
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <p className="font-medium text-sm">{table.name}</p>
                <p className="text-xs opacity-70">{table.count} rows</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom Query */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <h2 className="text-lg font-semibold text-white mb-3">
            Custom Query
          </h2>
          <textarea
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="SELECT * FROM workout_sets WHERE workout_log_id = 100"
            className="w-full h-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button onClick={runCustomQuery} className="mt-2">
            Run Query
          </Button>

          {queryError && (
            <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
              {queryError}
            </div>
          )}

          {queryResult && (
            <div className="mt-3">
              <p className="text-slate-400 text-sm mb-2">
                {queryResult.length} results
              </p>
              <div className="overflow-x-auto">
                <pre className="text-xs text-slate-300 bg-slate-800 p-3 rounded overflow-auto max-h-64">
                  {JSON.stringify(queryResult, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table Data */}
      {selectedTable && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold text-white mb-3">
              {selectedTable} ({tableData.length} rows shown)
            </h2>
            <div className="overflow-x-auto">
              <pre className="text-xs text-slate-300 bg-slate-800 p-3 rounded overflow-auto max-h-96">
                {JSON.stringify(tableData, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
