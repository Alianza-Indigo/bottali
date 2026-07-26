import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCatalogItems } from "@/lib/tools/catalog";
import { EmptyState } from "@/components/ui/EmptyState";
import { CatalogCard } from "@/components/catalog/CatalogCard";

export const metadata = { title: "Catálogo" };

export default async function CatalogPage() {
  const user = await requireCurrentUser();
  const catalogItems = await getCatalogItems(user.id);

  const items = catalogItems.map((item) => ({
    id: item.id,
    slug: item.slug,
    category: item.category,
    name: item.name,
    description: item.description,
    iconUrl: item.iconUrl,
    primaryColor: item.primaryColor,
    hasVoice: Boolean(item.capabilities?.voiceInput || item.capabilities?.voiceOutput),
    hasFiles: Boolean(item.capabilities?.files),
    state: item.state,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Catálogo de herramientas</h1>
        <p className="mt-1 text-sm text-ink-muted">Explora y activa las herramientas disponibles para tu cuenta.</p>
      </div>
      {items.length === 0 ? (
        <EmptyState title="No hay herramientas publicadas todavía" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <CatalogCard key={item.id} tool={item} />
          ))}
        </div>
      )}
    </div>
  );
}
