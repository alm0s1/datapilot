"use client";

import type { ProfilingResults, ColumnProfile } from "@/types/dataset";
import { BarChart3, Hash, Type, Calendar, AlertTriangle } from "lucide-react";

interface ProfilingDisplayProps {
  profiling: ProfilingResults;
}

export default function ProfilingDisplay({ profiling }: ProfilingDisplayProps) {
  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Rows" value={profiling.total_rows.toLocaleString()} />
        <StatCard label="Total Columns" value={profiling.total_columns.toString()} />
        <StatCard label="Memory" value={`${profiling.memory_mb} MB`} />
        <StatCard
          label="Duplicates"
          value={profiling.duplicates_count.toString()}
          warn={profiling.duplicates_count > 0}
        />
      </div>

      {/* Per-column stats */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Column Details</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(profiling.columns).map(([name, col]) => (
            <ColumnCard key={name} name={name} profile={col} totalRows={profiling.total_rows} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${warn ? "text-amber-500" : ""}`}>{value}</p>
    </div>
  );
}

function ColumnCard({
  name,
  profile,
  totalRows,
}: {
  name: string;
  profile: ColumnProfile;
  totalRows: number;
}) {
  const isNumeric = profile.dtype.includes("int") || profile.dtype.includes("float");
  const isDate = profile.dtype.includes("datetime");
  const icon = isDate ? (
    <Calendar className="h-4 w-4 text-purple-500" />
  ) : isNumeric ? (
    <Hash className="h-4 w-4 text-blue-500" />
  ) : (
    <Type className="h-4 w-4 text-green-500" />
  );

  const nullBarWidth = Math.min(profile.null_pct, 100);

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="ms-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">
          {profile.dtype}
        </span>
      </div>

      {/* Null bar */}
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Nulls</span>
          <span className={profile.null_pct > 20 ? "text-amber-500 font-medium" : ""}>
            {profile.null_pct}% ({profile.null_count})
          </span>
        </div>
        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${profile.null_pct > 20 ? "bg-amber-500" : "bg-primary/60"}`}
            style={{ width: `${nullBarWidth}%` }}
          />
        </div>
      </div>

      {/* Unique values */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Unique</span>
        <span>{profile.unique_count.toLocaleString()}</span>
      </div>

      {/* Type-specific stats */}
      {isNumeric && profile.min !== undefined && (
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <span className="text-muted-foreground">Min: <span className="text-foreground">{profile.min}</span></span>
          <span className="text-muted-foreground">Max: <span className="text-foreground">{profile.max}</span></span>
          <span className="text-muted-foreground">Mean: <span className="text-foreground">{profile.mean?.toFixed(2)}</span></span>
          <span className="text-muted-foreground">Median: <span className="text-foreground">{profile.median}</span></span>
        </div>
      )}

      {/* Top values for categorical */}
      {profile.top_values && profile.top_values.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">Top values:</span>
          {profile.top_values.slice(0, 3).map((tv, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <div
                className="h-1.5 rounded-full bg-primary/40"
                style={{ width: `${Math.max((tv.count / totalRows) * 100, 4)}%` }}
              />
              <span className="truncate">{tv.value}</span>
              <span className="ms-auto shrink-0 text-muted-foreground">{tv.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
