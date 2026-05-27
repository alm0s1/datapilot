"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { databaseApi } from "@/lib/api/databases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Database,
  ArrowLeft,
  Play,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Table2,
  Columns,
  Loader2,
} from "lucide-react";
import Link from "next/link";

export default function DatabaseDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const connectionId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: connection, isLoading, isError } = useQuery({
    queryKey: ["database", connectionId],
    queryFn: () => databaseApi.get(connectionId),
  });

  const { data: schema, isLoading: schemaLoading } = useQuery({
    queryKey: ["database-schema", connectionId],
    queryFn: () => databaseApi.getSchema(connectionId),
    enabled: !!connection,
  });

  const deleteMutation = useMutation({
    mutationFn: () => databaseApi.delete(connectionId),
    onSuccess: () => {
      toast.success("Database connection deleted");
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      router.push("/databases");
    },
    onError: (err) => {
      toast.error("Failed to delete connection", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    },
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await databaseApi.test(connectionId);
      setTestResult(result);
      if (result.success) {
        toast.success("Connection successful!");
      } else {
        toast.error("Connection failed", { description: result.message });
      }
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : "Test failed" });
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32 mt-1" />
          </div>
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !connection) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Connection not found</h2>
        <p className="text-muted-foreground mt-1">This database connection may have been deleted.</p>
        <Link href="/databases">
          <Button className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Databases
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/databases">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-2 rounded-full bg-primary/10">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{connection.name}</h1>
            <p className="text-muted-foreground">{connection.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/query/new?connection=${connectionId}`}>
            <Button>
              <Play className="mr-2 h-4 w-4" />
              New Query
            </Button>
          </Link>
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      {testResult && (
        <Card className={testResult.success ? "border-green-500/50" : "border-destructive/50"}>
          <CardContent className="flex items-center gap-3 py-4">
            {testResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            <span className={testResult.success ? "text-green-600" : "text-destructive"}>
              {testResult.message}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Connection Details */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Host</dt>
              <dd className="font-medium">{connection.host || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Port</dt>
              <dd className="font-medium">{connection.port || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Database</dt>
              <dd className="font-medium">{connection.database_name || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Username</dt>
              <dd className="font-medium">{connection.username || "N/A"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">SSL</dt>
              <dd className="font-medium">{connection.ssl_enabled ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${connection.is_active ? "bg-green-500" : "bg-red-500"}`} />
                <span className="font-medium">{connection.is_active ? "Active" : "Inactive"}</span>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Schema / Tables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table2 className="h-5 w-5" />
            Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schemaLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : schema && schema.tables && schema.tables.length > 0 ? (
            <div className="space-y-2">
              {schema.tables.map((table: { name: string; type?: string }) => (
                <div
                  key={table.name}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Table2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{table.name}</span>
                  </div>
                  <Link href={`/query/new?connection=${connectionId}`}>
                    <Button variant="ghost" size="sm">
                      <Play className="h-3 w-3 mr-1" />
                      Query
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Columns className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No tables found</p>
              <p className="text-xs mt-1">Test the connection or check database permissions</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{connection.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
