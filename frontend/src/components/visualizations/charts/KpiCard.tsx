"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  data: Record<string, unknown>[];
  dataKey: string;
  title?: string;
  comparisonKey?: string;
}

export default function KpiCard({ data, dataKey, title, comparisonKey }: KpiCardProps) {
  const value = data.length > 0 ? Number(data[0][dataKey] ?? 0) : 0;
  const previousValue =
    comparisonKey && data.length > 0
      ? Number(data[0][comparisonKey] ?? 0)
      : data.length > 1
        ? Number(data[1][dataKey] ?? 0)
        : null;

  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
  }).format(value);

  let changePercent: number | null = null;
  if (previousValue !== null && previousValue !== 0) {
    changePercent = ((value - previousValue) / Math.abs(previousValue)) * 100;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      {title && (
        <p className="mb-2 text-sm font-medium text-muted-foreground">{title}</p>
      )}
      <p className="text-4xl font-bold text-primary">{formatted}</p>
      <p className="mt-1 text-xs text-muted-foreground">{dataKey}</p>
      {changePercent !== null && (
        <div
          className={`mt-2 flex items-center gap-1 text-xs font-medium ${
            changePercent > 0
              ? "text-green-600"
              : changePercent < 0
                ? "text-red-600"
                : "text-muted-foreground"
          }`}
        >
          {changePercent > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : changePercent < 0 ? (
            <TrendingDown className="h-3 w-3" />
          ) : (
            <Minus className="h-3 w-3" />
          )}
          <span>
            {changePercent > 0 ? "+" : ""}
            {changePercent.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
