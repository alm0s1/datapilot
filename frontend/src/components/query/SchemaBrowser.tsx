"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { databaseApi } from "@/lib/api/databases";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { ChevronRight, ChevronDown, Table2, Columns3, Key, Database, FileSpreadsheet } from "lucide-react";
import type { TableInfo, ColumnInfo, DatabaseConnection } from "@/types/database";

interface SchemaBrowserProps {
  connectionId: string;
  connectionType?: string;
  onInsertText?: (text: string) => void;
}

function TableNode({ connectionId, table, onInsertText }: { connectionId: string; table: TableInfo; onInsertText?: (text: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  const { data: columns } = useQuery({
    queryKey: ["columns", connectionId, table.name],
    queryFn: () => databaseApi.getColumns(connectionId, table.name),
    enabled: expanded,
  });

  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-start text-xs hover:bg-muted/80 group"
        onClick={() => setExpanded(!expanded)}
        onDoubleClick={() => onInsertText?.(table.name)}
        title="Double-click to insert table name"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <Table2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
        <span className="truncate font-mono">{table.name}</span>
      </button>
      {expanded && columns && (
        <div className="ms-4 border-s border-border ps-2">
          {columns.map((col: ColumnInfo) => (
            <button
              key={col.name}
              className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-start text-xs hover:bg-muted/80"
              onDoubleClick={() => onInsertText?.(col.name)}
              title={`${col.type}${col.nullable ? " (nullable)" : ""}${col.primary_key ? " PK" : ""} - Double-click to insert`}
            >
              {col.primary_key ? (
                <Key className="h-3 w-3 shrink-0 text-amber-500" />
              ) : (
                <Columns3 className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate font-mono">{col.name}</span>
              <span className="ms-auto shrink-0 text-[10px] text-muted-foreground">
                {col.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SchemaBrowser({ connectionId, connectionType, onInsertText }: SchemaBrowserProps) {
  const t = useTranslations();
  const isDataset = connectionType === "dataset";

  const { data: schema, isLoading } = useQuery({
    queryKey: ["schema", connectionId],
    queryFn: () => databaseApi.getSchema(connectionId),
    enabled: !!connectionId,
  });

  if (!connectionId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        <div>
          <Database className="mx-auto mb-2 h-8 w-8" />
          <p>Select a database to browse schema</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
          {isDataset ? (
            <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" />
          ) : null}
          {t.database.tables}
          {schema?.tables && (
            <span className="ms-1 text-[10px] font-normal">({schema.tables.length})</span>
          )}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {schema?.tables?.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">No tables found</p>
        )}
        {schema?.tables?.map((table: TableInfo) => (
          <TableNode
            key={table.name}
            connectionId={connectionId}
            table={table}
            onInsertText={onInsertText}
          />
        ))}
      </div>
    </div>
  );
}
