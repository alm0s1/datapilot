"use client";

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface PieChartProps {
  data: Record<string, unknown>[];
  dataKeys: string[];
  nameKey: string;
  colors: string[];
  height: number;
  donut?: boolean;
}

export default function PieChart({ data, dataKeys, nameKey, colors, height, donut = false }: PieChartProps) {
  const dataKey = dataKeys[0] || "value";
  const outerRadius = height / 3;
  const innerRadius = donut ? outerRadius * 0.55 : 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={!donut}
          label={donut ? false : ({ name, percent }: { name: string; percent: number }) =>
            `${name} ${(percent * 100).toFixed(0)}%`
          }
          outerRadius={outerRadius}
          innerRadius={innerRadius}
          dataKey={dataKey}
          nameKey={nameKey}
          paddingAngle={donut ? 2 : 0}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
