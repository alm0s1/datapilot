"use client";

import { useQuery } from "@tanstack/react-query";
import { queryApi } from "@/lib/api/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ChartRenderer from "@/components/visualizations/ChartRenderer";
import type { DashboardWidget } from "@/types/dashboard";
import type { ChartType } from "@/types/query";
import { Type, AlertCircle, Loader2 } from "lucide-react";

interface WidgetCardProps {
  widget: DashboardWidget;
  isEditing?: boolean;
}

export default function WidgetCard({ widget, isEditing }: WidgetCardProps) {
  const queryId = widget.query_id;
  const chartType = (widget.config?.chart_type as ChartType) || "bar";
  const title = (widget.config?.title as string) || "";

  const {
    data: queryResult,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["widget-data", queryId],
    queryFn: async () => {
      if (!queryId) return null;
      return queryApi.execute(queryId, { limit: 500 });
    },
    enabled: !!queryId && (widget.widget_type === "chart" || widget.widget_type === "kpi"),
    staleTime: 60_000,
  });

  if (widget.widget_type === "text") {
    const content = (widget.config?.content as string) || "";
    return (
      <Card className="h-full">
        {title && (
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex h-full items-center p-4">
          <div className="text-sm whitespace-pre-wrap">{content}</div>
        </CardContent>
      </Card>
    );
  }

  if (!queryId) {
    return (
      <Card className="h-full">
        {title && (
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex h-full items-center justify-center text-muted-foreground">
          <div className="text-center text-xs">
            <AlertCircle className="mx-auto mb-1 h-5 w-5" />
            No data source configured
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="h-full">
        {title && (
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !queryResult) {
    return (
      <Card className="h-full">
        {title && (
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="flex h-full items-center justify-center text-destructive">
          <div className="text-center text-xs">
            <AlertCircle className="mx-auto mb-1 h-5 w-5" />
            Failed to load data
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden">
      {title && (
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-2">
        <ChartRenderer
          data={{
            columns: queryResult.columns,
            rows: queryResult.rows,
          }}
          config={{
            type: chartType,
            title: undefined,
            dimensions: widget.config?.dimensions as string[] | undefined,
            metrics: widget.config?.metrics as string[] | undefined,
          }}
          height={Math.max((widget.height || 3) * 50, 150)}
        />
      </CardContent>
    </Card>
  );
}
