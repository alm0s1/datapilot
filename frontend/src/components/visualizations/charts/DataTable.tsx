"use client";

interface DataTableProps {
  data: Record<string, unknown>[];
  dataKeys: string[];
  nameKey: string;
  height: number;
}

export default function DataTable({ data, dataKeys, nameKey, height }: DataTableProps) {
  const allKeys = [nameKey, ...dataKeys.filter((k) => k !== nameKey)];

  return (
    <div className="overflow-auto" style={{ maxHeight: height }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {allKeys.map((key) => (
              <th
                key={key}
                className="border-b px-3 py-2 text-start text-xs font-semibold"
              >
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri} className="border-b hover:bg-muted/50">
              {allKeys.map((key) => (
                <td key={key} className="px-3 py-1.5 text-xs">
                  {row[key] === null || row[key] === undefined ? (
                    <span className="italic text-muted-foreground">NULL</span>
                  ) : typeof row[key] === "number" ? (
                    <span className="font-mono">
                      {new Intl.NumberFormat().format(row[key] as number)}
                    </span>
                  ) : (
                    String(row[key])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
