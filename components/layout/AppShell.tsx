import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Panel" },
  { href: "/tools", label: "Catálogo" },
  { href: "/conversations", label: "Conversaciones" },
  { href: "/files", label: "Archivos" },
  { href: "/notifications", label: "Notificaciones" },
];

export function AppShell({ children, displayName }: { children: React.ReactNode; displayName: string | null }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-sm font-semibold text-ink">
            Plataforma de Herramientas
          </Link>
          <nav aria-label="Navegación principal" className="hidden gap-4 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-ink-muted hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/profile" className="text-sm text-ink-muted hover:text-ink">
              {displayName ?? "Mi perfil"}
            </Link>
            <LogoutButton />
          </div>
        </div>
        <nav aria-label="Navegación principal móvil" className="flex gap-3 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap text-sm text-ink-muted hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
      <InstallPrompt />
    </div>
  );
}
