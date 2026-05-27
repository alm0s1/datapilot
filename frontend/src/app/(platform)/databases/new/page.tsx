"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { databaseApi } from "@/lib/api/databases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DatabaseConnectionCreate, DatabaseType } from "@/types/database";

const dbTypes: { value: DatabaseType; label: string; defaultPort: number }[] = [
  { value: "postgresql", label: "PostgreSQL", defaultPort: 5432 },
  { value: "mysql", label: "MySQL", defaultPort: 3306 },
  { value: "mariadb", label: "MariaDB", defaultPort: 3306 },
  { value: "sqlite", label: "SQLite", defaultPort: 0 },
  { value: "sqlserver", label: "SQL Server", defaultPort: 1433 },
  { value: "oracle", label: "Oracle", defaultPort: 1521 },
  { value: "mongodb", label: "MongoDB", defaultPort: 27017 },
  { value: "redis", label: "Redis", defaultPort: 6379 },
];

export default function NewDatabasePage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<DatabaseConnectionCreate>({
    name: "",
    type: "postgresql",
    host: "localhost",
    port: 5432,
    database_name: "",
    username: "",
    password: "",
    ssl_enabled: false,
  });

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => databaseApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      router.push("/databases");
    },
  });

  const handleTypeChange = (type: DatabaseType) => {
    const dbType = dbTypes.find((d) => d.value === type);
    setForm({ ...form, type, port: dbType?.defaultPort || 5432 });
  };

  const isSqlite = form.type === "sqlite";

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">{t.database.new}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t.common.create}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Connection Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Database" />
          </div>
          <div className="space-y-2">
            <Label>Database Type</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.type}
              onChange={(e) => handleTypeChange(e.target.value as DatabaseType)}
            >
              {dbTypes.map((db) => (
                <option key={db.value} value={db.value}>{db.label}</option>
              ))}
            </select>
          </div>
          {!isSqlite && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-2">
                  <Label>Host</Label>
                  <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Database Name{isSqlite ? " (File Path)" : ""}</Label>
            <Input value={form.database_name} onChange={(e) => setForm({ ...form, database_name: e.target.value })} placeholder={isSqlite ? "/path/to/db.sqlite" : "mydb"} />
          </div>

          {testResult && (
            <div className={`rounded-md p-3 text-sm ${testResult.success ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300" : "bg-destructive/10 text-destructive"}`}>
              {testResult.message}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { /* test will be wired after create */ setTestResult({ success: true, message: "Create the connection first, then test it." }); }}>
              {t.database.test}
            </Button>
            <Button className="flex-1" onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}>
              {createMutation.isPending ? t.common.loading : t.common.create}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
