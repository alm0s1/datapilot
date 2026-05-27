"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuthStore } from "@/lib/stores/authStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfilePage() {
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);
  const { locale, setLocale } = useUIStore();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">{t.nav.profile}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t.nav.profile}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t.auth.fullName}</Label>
            <Input defaultValue={user.full_name || ""} />
          </div>
          <div className="space-y-2">
            <Label>{t.auth.username}</Label>
            <Input defaultValue={user.username} />
          </div>
          <div className="space-y-2">
            <Label>{t.auth.email}</Label>
            <Input defaultValue={user.email} type="email" />
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <div className="flex gap-2">
              <Button
                variant={locale === "en" ? "default" : "outline"}
                size="sm"
                onClick={() => setLocale("en")}
              >
                English
              </Button>
              <Button
                variant={locale === "ar" ? "default" : "outline"}
                size="sm"
                onClick={() => setLocale("ar")}
              >
                العربية
              </Button>
            </div>
          </div>
          <Button>{t.common.save}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
