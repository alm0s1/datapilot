"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuthStore } from "@/lib/stores/authStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Database,
  Search,
  FolderOpen,
  Settings,
  Users,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { key: "dashboards", href: "/dashboard", icon: LayoutDashboard },
  { key: "queries", href: "/query", icon: Search },
  { key: "datasets", href: "/datasets", icon: FileSpreadsheet },
  { key: "collections", href: "/collections", icon: FolderOpen },
  { key: "databases", href: "/databases", icon: Database },
] as const;

const adminItems = [
  { key: "users", href: "/admin/users", icon: Users },
  { key: "settings", href: "/admin/settings", icon: Settings },
] as const;

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-e bg-card transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        {sidebarOpen && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold text-primary">{t.common.appName}</span>
          </Link>
        )}
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="shrink-0">
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const label = t.nav[item.key];
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title={!sidebarOpen ? label : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Admin Section */}
        {user?.is_superuser && (
          <>
            {sidebarOpen && (
              <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase text-muted-foreground">
                {t.nav.admin}
              </div>
            )}
            {adminItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const label = t.nav[item.key];
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  title={!sidebarOpen ? label : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {sidebarOpen && <span>{label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User Info */}
      {sidebarOpen && user && (
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              {(user.full_name || user.username).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.full_name || user.username}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
