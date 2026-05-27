"use client";

import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ZAxis,
} from "recharts";

interface ScatterChartProps {
  data: Record<string, unknown>[];
  dataKeys: string[];
  nameKey: string;
  colors: string[];
  height: number;
}

export default function ScatterChart({ data, dataKeys, nameKey, colors, height }: ScatterChartProps) {
  const xKey = dataKeys[0] || "x";
  const yKey = dataKeys[1] || dataKeys[0] || "y";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsScatterChart margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey={xKey} name={xKey} tick={{ fontSize: 12 }} type="number" />
        <YAxis dataKey={yKey} name={yKey} tick={{ fontSize: 12 }} type="number" />
        <ZAxis range={[40, 400]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        <Legend />
        <Scatter name={nameKey} data={data} fill={colors[0]} />
      </RechartsScatterChart>
    </ResponsiveContainer>
  );
}
