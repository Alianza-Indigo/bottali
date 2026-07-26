import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

const NAV_ITEMS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/tools", label: "Herramientas" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/groups", label: "Grupos" },
  { href: "/admin/roles", label: "Roles" },
  { href: "/admin/providers", label: "Proveedores" },
  { href: "/admin/knowledge", label: "Conocimiento" },
  { href: "/admin/conversations", label: "Conversaciones" },
  { href: "/admin/evaluations", label: "Evaluaciones" },
  { href: "/admin/jobs", label: "Trabajos" },
  { href: "/admin/analytics", label: "Analítica" },
  { href: "/admin/audit", label: "Auditoría" },
  { href: "/admin/security", label: "Seguridad" },
  { href: "/admin/settings", label: "Configuración" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm font-semibold text-ink">
              Panel administrativo
            </Link>
            <Link href="/dashboard" className="text-xs text-ink-muted underline">
              Volver a la app
            </Link>
          </div>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <nav aria-label="Navegación administrativa" className="w-48 shrink-0">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-surface-subtle hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
