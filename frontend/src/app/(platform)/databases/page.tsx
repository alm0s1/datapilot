"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { databaseApi } from "@/lib/api/databases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Database, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const dbTypeColors: Record<string, string> = {
  postgresql: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  mysql: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  sqlite: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  mongodb: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  redis: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  sqlserver: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  oracle: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  mariadb: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
};

function DatabaseSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DatabasesPage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: connections, isLoading, isError, error } = useQuery({
    queryKey: ["databases"],
    queryFn: () => databaseApi.list(),
  });

  if (isError) {
    toast.error("Failed to load database connections", {
      description: error instanceof Error ? error.message : "Please try again",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.database.title}</h1>
          <p className="text-muted-foreground">
            Connect and manage your database connections
          </p>
        </div>
        <Link href="/databases/new">
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t.database.new}
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <DatabaseSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-4 py-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-medium">Failed to load connections</p>
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
      ) : connections?.length === 0 ? (
        <Card>
          <EmptyState
            icon={Database}
            title="No database connections"
            description="Add your first database connection to start querying and visualizing your data."
            action={{
              label: t.database.new,
              onClick: () => router.push("/databases/new"),
            }}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connections?.map((conn) => (
            <Link key={conn.id} href={`/databases/${conn.id}`}>
              <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">
                      {conn.name}
                    </CardTitle>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${dbTypeColors[conn.type] || "bg-gray-100 text-gray-800"}`}>
                      {conn.type}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {conn.host ? `${conn.host}:${conn.port}` : conn.database_name}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${conn.is_active ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-xs text-muted-foreground">
                      {conn.is_active ? t.database.connected : t.database.disconnected}
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
