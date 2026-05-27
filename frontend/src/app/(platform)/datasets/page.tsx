"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { datasetApi } from "@/lib/api/datasets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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
import type { DatasetListItem } from "@/types/dataset";
import {
  FileSpreadsheet,
  Upload,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
} from "lucide-react";

function DatasetSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-5 w-10" />
      </div>
      <Skeleton className="h-3 w-48" />
      <div className="flex gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-14" />
      </div>
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function DatasetsPage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<DatasetListItem | null>(null);

  const { data: datasets, isLoading, isError, error } = useQuery({
    queryKey: ["datasets"],
    queryFn: datasetApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: datasetApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setDeletingId(null);
      toast.success("Dataset deleted", {
        description: `"${datasetToDelete?.name}" has been removed successfully.`,
      });
      setDatasetToDelete(null);
    },
    onError: (err) => {
      setDeletingId(null);
      toast.error("Failed to delete dataset", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    },
  });

  const handleDeleteClick = (ds: DatasetListItem, e: React.MouseEvent) => {
    e.preventDefault();
    setDatasetToDelete(ds);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (datasetToDelete) {
      setDeletingId(datasetToDelete.id);
      deleteMutation.mutate(datasetToDelete.id);
    }
    setDeleteDialogOpen(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "-";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      csv: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      xlsx: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      xls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    };
    return (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${colors[type] || "bg-muted"}`}>
        {type}
      </span>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.dataset?.title || "Datasets"}</h1>
          <p className="text-muted-foreground">
            Upload and manage your data files for analysis
          </p>
        </div>
        <Link href="/datasets/upload">
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            {t.dataset?.upload || "Upload Dataset"}
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <DatasetSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-4 py-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-medium">Failed to load datasets</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "An unexpected error occurred"}
              </p>
            </div>
            <Button
              variant="outline"
              className="ms-auto"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && (!datasets || datasets.length === 0) && (
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="No datasets yet"
            description="Upload your first dataset to start analyzing your data. Supports CSV, XLSX, and XLS files."
            action={{
              label: t.dataset?.upload || "Upload Dataset",
              onClick: () => router.push("/datasets/upload"),
            }}
          />
        </Card>
      )}

      {!isLoading && !isError && datasets && datasets.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {datasets.map((ds: DatasetListItem) => (
            <div key={ds.id} className="group relative rounded-lg border p-4 transition-all hover:border-primary/50 hover:shadow-sm">
              <Link href={`/datasets/${ds.id}`} className="block space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold group-hover:text-primary transition-colors">{ds.name}</h3>
                  </div>
                  {fileTypeBadge(ds.file_type)}
                </div>
                <p className="text-xs text-muted-foreground truncate">{ds.original_filename}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {ds.row_count != null && <span>{ds.row_count.toLocaleString()} rows</span>}
                  {ds.column_count != null && <span>{ds.column_count} cols</span>}
                  <span>{formatSize(ds.file_size_bytes)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {statusIcon(ds.upload_status)}
                  <span className="capitalize">{ds.upload_status}</span>
                  {ds.connection_id && (
                    <span className="ms-auto flex items-center gap-1 text-primary">
                      <Database className="h-3 w-3" /> Queryable
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(ds.created_at).toLocaleDateString()}
                </p>
              </Link>
              <button
                onClick={(e) => handleDeleteClick(ds, e)}
                disabled={deletingId === ds.id}
                className="absolute end-3 top-3 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Delete dataset"
              >
                {deletingId === ds.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dataset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{datasetToDelete?.name}"? This will also remove the stored table and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
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
