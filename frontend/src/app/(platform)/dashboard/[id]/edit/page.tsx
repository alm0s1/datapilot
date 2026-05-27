"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { dashboardApi } from "@/lib/api/dashboards";
import { useDashboardStore } from "@/lib/stores/dashboardStore";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Save, Eye, X, ArrowLeft, GripVertical } from "lucide-react";
import AddWidgetDialog from "@/components/dashboard/AddWidgetDialog";
import WidgetCard from "@/components/dashboard/WidgetCard";
import type { WidgetType } from "@/types/dashboard";

export default function DashboardEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    widgets,
    setWidgets,
    editMode,
    setEditMode,
    selectedWidgetId,
    setSelectedWidget,
    removeWidget,
    addWidget,
    unsavedChanges,
    markSaved,
  } = useDashboardStore();

  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["dashboards", id],
    queryFn: () => dashboardApi.get(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (dashboard?.widgets) {
      setWidgets(dashboard.widgets);
      setEditMode(true);
    }
    return () => setEditMode(false);
  }, [dashboard, setWidgets, setEditMode]);

  const handleAddWidget = useCallback(
    async (config: {
      widget_type: WidgetType;
      query_id?: string;
      config: Record<string, unknown>;
    }) => {
      try {
        const newWidget = await dashboardApi.addWidget(id, {
          widget_type: config.widget_type,
          query_id: config.query_id,
          position_x: 0,
          position_y: widgets.length * 4,
          width: config.widget_type === "kpi" ? 3 : 6,
          height: config.widget_type === "kpi" ? 2 : 4,
          config: config.config,
        });
        addWidget(newWidget);
        setShowAddDialog(false);
        queryClient.invalidateQueries({ queryKey: ["dashboards", id] });
      } catch {
        // Error handling - widget creation failed
      }
    },
    [id, widgets.length, addWidget, queryClient]
  );

  const handleSave = async () => {
    for (const widget of widgets) {
      await dashboardApi.updateWidget(id, widget.id, {
        position_x: widget.position_x,
        position_y: widget.position_y,
        width: widget.width,
        height: widget.height,
        config: widget.config,
      });
    }
    markSaved();
    queryClient.invalidateQueries({ queryKey: ["dashboards", id] });
  };

  const handleRemoveWidget = async (widgetId: string) => {
    try {
      await dashboardApi.removeWidget(id, widgetId);
      removeWidget(widgetId);
      queryClient.invalidateQueries({ queryKey: ["dashboards", id] });
    } catch {
      // Error
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/dashboard/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{dashboard?.name}</h1>
          {unsavedChanges && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {t.dashboard.unsavedChanges}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/dashboard/${id}`)}
          >
            <Eye className="me-2 h-4 w-4" />
            {t.dashboard.viewMode}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="me-2 h-4 w-4" />
            {t.dashboard.addWidget}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!unsavedChanges}>
            <Save className="me-2 h-4 w-4" />
            {t.common.save}
          </Button>
        </div>
      </div>

      {/* Widget Grid */}
      {widgets.length === 0 ? (
        <Card className="py-16 text-center">
          <CardContent>
            <Plus className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">
              No widgets yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Click &quot;{t.dashboard.addWidget}&quot; to add your first widget
            </p>
            <Button
              className="mt-4"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="me-2 h-4 w-4" />
              {t.dashboard.addWidget}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {widgets.map((widget) => (
            <div
              key={widget.id}
              style={{
                gridColumn: `span ${Math.min(widget.width || 6, 12)}`,
                minHeight: `${(widget.height || 3) * 60}px`,
              }}
              className={`relative cursor-pointer ${
                selectedWidgetId === widget.id ? "ring-2 ring-primary rounded-lg" : ""
              }`}
              onClick={() => setSelectedWidget(widget.id)}
            >
              {/* Edit overlay controls */}
              <div className="absolute top-1 end-1 z-10 flex items-center gap-1">
                <div className="rounded bg-background/80 p-0.5 backdrop-blur-sm">
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveWidget(widget.id);
                  }}
                  className="rounded bg-background/80 p-0.5 backdrop-blur-sm hover:bg-destructive/10"
                >
                  <X className="h-4 w-4 text-destructive" />
                </button>
              </div>
              <WidgetCard widget={widget} isEditing />
            </div>
          ))}
        </div>
      )}

      {showAddDialog && (
        <AddWidgetDialog
          onAdd={handleAddWidget}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
