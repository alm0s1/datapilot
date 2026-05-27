"use client";

import dynamic from "next/dynamic";
import type { ChartType } from "@/types/query";

const BarChartComponent = dynamic(() => import("./charts/BarChart"), { ssr: false });
const HorizontalBarChartComponent = dynamic(() => import("./charts/HorizontalBarChart"), { ssr: false });
const LineChartComponent = dynamic(() => import("./charts/LineChart"), { ssr: false });
const PieChartComponent = dynamic(() => import("./charts/PieChart"), { ssr: false });
const AreaChartComponent = dynamic(() => import("./charts/AreaChart"), { ssr: false });
const ScatterChartComponent = dynamic(() => import("./charts/ScatterChart"), { ssr: false });
const RadarChartComponent = dynamic(() => import("./charts/RadarChart"), { ssr: false });
const ComboChartComponent = dynamic(() => import("./charts/ComboChart"), { ssr: false });
const DataTableComponent = dynamic(() => import("./charts/DataTable"), { ssr: false });
const KpiCardComponent = dynamic(() => import("./charts/KpiCard"), { ssr: false });

export interface ChartData {
  columns: { name: string; type: string }[];
  rows: unknown[][];
}

export interface ChartConfig {
  type: ChartType;
  title?: string;
  dimensions?: string[];
  metrics?: string[];
  colors?: string[];
  orientation?: "vertical" | "horizontal";
}

interface ChartRendererProps {
  data: ChartData;
  config: ChartConfig;
  height?: number;
}

const defaultColors = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
  "hsl(199, 89%, 48%)",
  "hsl(24, 95%, 53%)",
  "hsl(330, 81%, 60%)",
];

function transformData(data: ChartData, config: ChartConfig) {
  const { columns, rows } = data;
  const dimIdx = config.dimensions?.[0]
    ? columns.findIndex((c) => c.name === config.dimensions![0])
    : 0;
  const metricIndices = config.metrics?.length
    ? config.metrics.map((m) => columns.findIndex((c) => c.name === m)).filter((i) => i >= 0)
    : columns.map((_, i) => i).filter((i) => i !== dimIdx).slice(0, 3);

  return rows.map((row) => {
    const item: Record<string, unknown> = { name: String(row[dimIdx] ?? "") };
    metricIndices.forEach((mi) => {
      item[columns[mi].name] = Number(row[mi]) || 0;
    });
    return item;
  });
}

export default function ChartRenderer({ data, config, height = 300 }: ChartRendererProps) {
  if (!data || !data.rows.length) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        No data available
      </div>
    );
  }

  const chartData = transformData(data, config);
  const colors = config.colors || defaultColors;
  const dimCol = config.dimensions?.[0] || data.columns[0]?.name || "name";
  const metricCols = config.metrics?.length
    ? config.metrics
    : data.columns.filter((c) => c.name !== dimCol).map((c) => c.name).slice(0, 3);

  const chartProps = { data: chartData, colors, dataKeys: metricCols, nameKey: "name", height };

  switch (config.type) {
    case "bar":
      if (config.orientation === "horizontal") {
        return <HorizontalBarChartComponent {...chartProps} />;
      }
      return <BarChartComponent {...chartProps} />;
    case "line":
      return <LineChartComponent {...chartProps} />;
    case "pie":
      return <PieChartComponent {...chartProps} />;
    case "donut":
      return <PieChartComponent {...chartProps} donut />;
    case "area":
      return <AreaChartComponent {...chartProps} />;
    case "scatter":
      return <ScatterChartComponent {...chartProps} />;
    case "radar":
      return <RadarChartComponent {...chartProps} />;
    case "combo":
      return <ComboChartComponent {...chartProps} />;
    case "table":
      return <DataTableComponent {...chartProps} />;
    case "kpi":
      return <KpiCardComponent data={chartData} dataKey={metricCols[0]} title={config.title} />;
    default:
      return <BarChartComponent {...chartProps} />;
  }
}
