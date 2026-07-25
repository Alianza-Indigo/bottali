import { AccessibilitySettingsForm } from "@/components/accessibility/AccessibilitySettingsForm";

export const metadata = { title: "Accesibilidad" };

export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold text-ink">Preferencias de accesibilidad</h1>
      <AccessibilitySettingsForm />
    </div>
  );
}
