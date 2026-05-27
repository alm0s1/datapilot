"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryApi } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { X, BarChart3, FileText, Type, Hash } from "lucide-react";
import type { WidgetType } from "@/types/dashboard";
import type { ChartType } from "@/types/query";

interface AddWidgetDialogProps {
  onAdd: (config: {
    widget_type: WidgetType;
    query_id?: string;
    config: Record<string, unknown>;
  }) => void;
  onClose: () => void;
}

const chartTypes: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Bar Chart" },
  { value: "line", label: "Line Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "donut", label: "Donut Chart" },
  { value: "area", label: "Area Chart" },
  { value: "scatter", label: "Scatter Plot" },
  { value: "radar", label: "Radar Chart" },
  { value: "combo", label: "Combo Chart" },
  { value: "table", label: "Data Table" },
  { value: "kpi", label: "KPI Number" },
];

const widgetTypes: {
  type: WidgetType;
  label: string;
  icon: typeof BarChart3;
  description: string;
}[] = [
  {
    type: "chart",
    label: "Chart",
    icon: BarChart3,
    description: "Visualize query results as charts",
  },
  {
    type: "kpi",
    label: "KPI Metric",
    icon: Hash,
    description: "Show a single number metric",
  },
  {
    type: "text",
    label: "Text",
    icon: Type,
    description: "Add markdown or plain text",
  },
];

export default function AddWidgetDialog({ onAdd, onClose }: AddWidgetDialogProps) {
  const [step, setStep] = useState<"type" | "config">("type");
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null);
  const [selectedQueryId, setSelectedQueryId] = useState<string>("");
  const [selectedChartType, setSelectedChartType] = useState<ChartType>("bar");
  const [textContent, setTextContent] = useState("");
  const [widgetTitle, setWidgetTitle] = useState("");

  const { data: queries } = useQuery({
    queryKey: ["queries"],
    queryFn: () => queryApi.list(),
    enabled: selectedType === "chart" || selectedType === "kpi",
  });

  const handleSelectType = (type: WidgetType) => {
    setSelectedType(type);
    if (type === "text") {
      setStep("config");
    } else {
      setStep("config");
    }
  };

  const handleAdd = () => {
    if (!selectedType) return;

    if (selectedType === "text") {
      onAdd({
        widget_type: "text",
        config: { content: textContent, title: widgetTitle },
      });
    } else if (selectedType === "chart") {
      onAdd({
        widget_type: "chart",
        query_id: selectedQueryId || undefined,
        config: {
          chart_type: selectedChartType,
          title: widgetTitle,
        },
      });
    } else if (selectedType === "kpi") {
      onAdd({
        widget_type: "kpi",
        query_id: selectedQueryId || undefined,
        config: {
          chart_type: "kpi",
          title: widgetTitle,
        },
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between shrink-0">
          <CardTitle>
            {step === "type" ? "Add Widget" : `Configure ${selectedType} Widget`}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          {step === "type" && (
            <div className="grid grid-cols-1 gap-3">
              {widgetTypes.map((wt) => {
                const Icon = wt.icon;
                return (
                  <button
                    key={wt.type}
                    className="flex items-center gap-4 rounded-lg border p-4 text-start transition-colors hover:bg-muted"
                    onClick={() => handleSelectType(wt.type)}
                  >
                    <div className="rounded-lg bg-primary/10 p-3">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{wt.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {wt.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step === "config" && selectedType === "text" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Title</label>
                <Input
                  value={widgetTitle}
                  onChange={(e) => setWidgetTitle(e.target.value)}
                  placeholder="Widget title"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Content
                </label>
                <textarea
                  className="w-full rounded-md border p-3 text-sm"
                  rows={4}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Enter text content..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep("type")}>
                  Back
                </Button>
                <Button onClick={handleAdd}>Add Widget</Button>
              </div>
            </div>
          )}

          {step === "config" &&
            (selectedType === "chart" || selectedType === "kpi") && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Title
                  </label>
                  <Input
                    value={widgetTitle}
                    onChange={(e) => setWidgetTitle(e.target.value)}
                    placeholder="Widget title"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Data Source (Query)
                  </label>
                  <select
                    className="w-full rounded-md border p-2 text-sm"
                    value={selectedQueryId}
                    onChange={(e) => setSelectedQueryId(e.target.value)}
                  >
                    <option value="">Select a saved query...</option>
                    {queries?.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                  {queries?.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No saved queries yet. Create a query in the SQL Editor
                      first.
                    </p>
                  )}
                </div>
                {selectedType === "chart" && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Chart Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {chartTypes.map((ct) => (
                        <button
                          key={ct.value}
                          className={`rounded-md border p-2 text-xs text-start transition-colors ${
                            selectedChartType === ct.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "hover:bg-muted"
                          }`}
                          onClick={() => setSelectedChartType(ct.value)}
                        >
                          {ct.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep("type")}>
                    Back
                  </Button>
                  <Button onClick={handleAdd}>Add Widget</Button>
                </div>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
