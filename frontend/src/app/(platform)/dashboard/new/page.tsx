"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { dashboardApi } from "@/lib/api/dashboards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewDashboardPage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () => dashboardApi.create({ name, description: description || undefined }),
    onSuccess: (dashboard) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      router.push(`/dashboard/${dashboard.id}/edit`);
    },
  });

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">{t.dashboard.new}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t.common.create}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Dashboard" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
            {createMutation.isPending ? t.common.loading : t.common.create}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
