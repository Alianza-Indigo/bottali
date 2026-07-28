"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  BriefcaseBusiness,
  ChevronLeft,
  CircleHelp,
  ClipboardCheck,
  Database,
  FileClock,
  Gauge,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LogoutButton } from "./LogoutButton";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/admin", label: "Resumen", icon: Gauge },
  { href: "/admin/tools", label: "Herramientas", icon: Bot },
  { href: "/admin/users", label: "Usuarios", icon: Users },
  { href: "/admin/groups", label: "Grupos", icon: Boxes },
  { href: "/admin/conversations", label: "Conversaciones", icon: MessageSquare },
  { href: "/admin/analytics", label: "Analítica", icon: BarChart3 },
];

const OPERATIONS_NAV: NavItem[] = [
  { href: "/admin/providers", label: "Proveedores", icon: Database },
  { href: "/admin/evaluations", label: "Evaluaciones", icon: ClipboardCheck },
  { href: "/admin/jobs", label: "Trabajos", icon: BriefcaseBusiness },
  { href: "/admin/security", label: "Seguridad", icon: ShieldCheck },
  { href: "/admin/audit", label: "Auditoría", icon: FileClock },
  { href: "/admin/roles", label: "Roles", icon: Users },
  { href: "/admin/settings", label: "Configuración", icon: Settings },
];

function isActivePath(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

function NavGroup({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-teal-700 text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col bg-[#071a23] text-white">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-500 text-[#071a23]">
          <Boxes className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold">Bottali</p>
          <p className="truncate text-[11px] text-slate-400">Consola administrativa</p>
        </div>
      </div>

      <nav aria-label="Navegación administrativa" className="flex-1 overflow-y-auto px-3 py-4">
        <NavGroup items={PRIMARY_NAV} pathname={pathname} onNavigate={onNavigate} />
        <div className="my-4 border-t border-white/10" />
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase text-slate-500">Operación</p>
        <NavGroup items={OPERATIONS_NAV} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link href="/accessibility" className="flex min-h-9 items-center gap-3 rounded-md px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white">
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
          Accesibilidad y ayuda
        </Link>
        <Link href="/admin/security" className="mt-1 flex min-h-9 items-center gap-3 rounded-md px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white">
          <Activity className="h-4 w-4" aria-hidden="true" />
          Salud y dependencias
        </Link>
        <Link href="/dashboard" className="mt-1 flex min-h-9 items-center gap-3 rounded-md px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Volver a la aplicación
        </Link>
      </div>
    </div>
  );
}

export function AdminShell({
  children,
  user,
}: {
  children: ReactNode;
  user: { email: string; displayName: string | null };
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = user.displayName || user.email.split("@")[0] || "Administrador";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-surface-subtle">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">
        <Sidebar pathname={pathname} onNavigate={() => undefined} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Cerrar navegación"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[min(19rem,86vw)] shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <Sidebar pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface-raised/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold text-ink sm:hidden">Bottali</span>
            <div className="hidden border-l border-border pl-4 sm:block lg:border-l-0 lg:pl-0">
              <p className="text-[11px] text-ink-faint">Organización</p>
              <p className="text-sm font-medium text-ink">Bottali</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink"
              aria-label="Notificaciones"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <div className="hidden h-8 border-l border-border sm:block" />
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">{initials}</span>
              <div className="hidden min-w-0 md:block">
                <p className="max-w-36 truncate text-sm font-medium text-ink">{displayName}</p>
                <p className="text-[11px] text-ink-faint">Administrador</p>
              </div>
            </div>
            <LogoutButton />
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
