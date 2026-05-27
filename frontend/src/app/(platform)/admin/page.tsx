"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuthStore } from "@/lib/stores/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Search, Database, FolderOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboards";
import { queryApi } from "@/lib/api/queries";
import { databaseApi } from "@/lib/api/databases";

export default function AdminPage() {
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);

  const { data: dashboards } = useQuery({ queryKey: ["dashboards"], queryFn: () => dashboardApi.list() });
  const { data: queries } = useQuery({ queryKey: ["queries"], queryFn: () => queryApi.list() });
  const { data: databases } = useQuery({ queryKey: ["databases"], queryFn: () => databaseApi.list() });

  const stats = [
    { label: t.nav.dashboards, value: dashboards?.length ?? 0, icon: LayoutDashboard },
    { label: t.nav.queries, value: queries?.length ?? 0, icon: Search },
    { label: t.nav.databases, value: databases?.length ?? 0, icon: Database },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t.nav.admin}</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
