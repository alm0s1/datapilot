"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface HorizontalBarChartProps {
  data: Record<string, unknown>[];
  dataKeys: string[];
  nameKey: string;
  colors: string[];
  height: number;
}

export default function HorizontalBarChart({
  data,
  dataKeys,
  nameKey,
  colors,
  height,
}: HorizontalBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          dataKey={nameKey}
          type="category"
          tick={{ fontSize: 11 }}
          width={50}
        />
        <Tooltip />
        <Legend />
        {dataKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={colors[i % colors.length]}
            radius={[0, 4, 4, 0]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
