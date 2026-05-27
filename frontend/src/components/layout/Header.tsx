"use client";

import { useAuthStore } from "@/lib/stores/authStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { Button } from "@/components/ui/button";
import {
  Moon,
  Sun,
  Globe,
  LogOut,
  User,
  Menu,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";

export function Header() {
  const t = useTranslations();
  const { user, logout } = useAuthStore();
  const { locale, setLocale, toggleSidebar } = useUIStore();
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {/* Language Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocale(locale === "en" ? "ar" : "en")}
          title={locale === "en" ? "العربية" : "English"}
        >
          <Globe className="h-5 w-5" />
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Profile */}
        <Link href="/profile">
          <Button variant="ghost" size="icon">
            <User className="h-5 w-5" />
          </Button>
        </Link>

        {/* Logout */}
        <Button variant="ghost" size="icon" onClick={logout} title={t.auth.logout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
