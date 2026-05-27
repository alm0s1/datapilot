"use client";

import { use, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboards";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useDashboardStore } from "@/lib/stores/dashboardStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Share2, Copy, Plus, LayoutDashboard, RefreshCcw } from "lucide-react";
import Link from "next/link";
import WidgetCard from "@/components/dashboard/WidgetCard";

export default function DashboardViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const t = useTranslations();
  const setWidgets = useDashboardStore((s) => s.setWidgets);

  const { data: dashboard, isLoading, refetch } = useQuery({
    queryKey: ["dashboards", id],
    queryFn: () => dashboardApi.get(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (dashboard?.widgets) {
      setWidgets(dashboard.widgets);
    }
  }, [dashboard, setWidgets]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-center text-muted-foreground">
        Dashboard not found
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{dashboard.name}</h1>
          {dashboard.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {dashboard.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCcw className="me-2 h-4 w-4" />
            Refresh
          </Button>
          <Link href={`/dashboard/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="me-2 h-4 w-4" />
              {t.common.edit}
            </Button>
          </Link>
          <Button variant="outline" size="sm">
            <Share2 className="me-2 h-4 w-4" />
            {t.dashboard.share}
          </Button>
          <Button variant="outline" size="sm">
            <Copy className="me-2 h-4 w-4" />
            {t.dashboard.duplicate}
          </Button>
        </div>
      </div>

      {dashboard.widgets.length === 0 ? (
        <Card className="py-16 text-center">
          <CardContent>
            <LayoutDashboard className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No widgets yet</p>
            <Link href={`/dashboard/${id}/edit`}>
              <Button className="mt-4">
                <Plus className="me-2 h-4 w-4" />
                {t.dashboard.addWidget}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {dashboard.widgets.map((widget) => (
            <div
              key={widget.id}
              style={{
                gridColumn: `span ${Math.min(widget.width || 6, 12)}`,
                minHeight: `${(widget.height || 3) * 60}px`,
              }}
            >
              <WidgetCard widget={widget} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
