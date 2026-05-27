"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { dashboardApi } from "@/lib/api/dashboards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, LayoutDashboard, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function DashboardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  );
}

export default function DashboardListPage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: dashboards, isLoading, isError, error } = useQuery({
    queryKey: ["dashboards"],
    queryFn: () => dashboardApi.list(),
  });

  // Show error toast on query failure
  if (isError) {
    toast.error("Failed to load dashboards", {
      description: error instanceof Error ? error.message : "Please try again",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.dashboard.title}</h1>
          <p className="text-muted-foreground">
            View and manage your data dashboards
          </p>
        </div>
        <Link href="/dashboard/new">
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t.dashboard.new}
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <DashboardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-4 py-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="font-medium">Failed to load dashboards</p>
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
      ) : dashboards?.length === 0 ? (
        <Card>
          <EmptyState
            icon={LayoutDashboard}
            title="No dashboards yet"
            description="Create your first dashboard to visualize your data with charts and insights."
            action={{
              label: t.dashboard.new,
              onClick: () => router.push("/dashboard/new"),
            }}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards?.map((d) => (
            <Link key={d.id} href={`/dashboard/${d.id}`}>
              <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">
                    {d.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {d.description || "No description"}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Updated {new Date(d.updated_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
