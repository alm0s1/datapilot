"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { queryApi } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Search, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function QuerySkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function QueryListPage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: queries, isLoading, isError, error } = useQuery({
    queryKey: ["queries"],
    queryFn: () => queryApi.list(),
  });

  if (isError) {
    toast.error("Failed to load queries", {
      description: error instanceof Error ? error.message : "Please try again",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.query.title}</h1>
          <p className="text-muted-foreground">
            Create and manage your SQL queries
          </p>
        </div>
        <Link href="/query/new">
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t.query.new}
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <QuerySkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-4 py-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-medium">Failed to load queries</p>
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
      ) : queries?.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="No queries yet"
            description="Create your first query to start exploring your data with SQL or visual query builder."
            action={{
              label: t.query.new,
              onClick: () => router.push("/query/new"),
            }}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queries?.map((q) => (
            <Link key={q.id} href={`/query/${q.id}`}>
              <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">
                    {q.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {q.description || "No description"}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                      {q.query_type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Updated {new Date(q.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
