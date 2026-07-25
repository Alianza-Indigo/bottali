"use client";

import { useAccessibility } from "./AccessibilityProvider";
import { Card, CardBody } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";

export function AccessibilitySettingsForm() {
  const { preferences, setPreferences } = useAccessibility();

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div>
          <Label htmlFor="theme">Tema</Label>
          <select
            id="theme"
            value={preferences.theme}
            onChange={(e) => setPreferences({ theme: e.target.value as typeof preferences.theme })}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="system">Automático (según el sistema)</option>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </select>
        </div>

        <div>
          <Label htmlFor="textScale">Tamaño del texto</Label>
          <select
            id="textScale"
            value={preferences.textScale}
            onChange={(e) => setPreferences({ textScale: e.target.value as typeof preferences.textScale })}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="md">Normal</option>
            <option value="lg">Grande</option>
            <option value="xl">Muy grande</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={preferences.reducedMotion}
            onChange={(e) => setPreferences({ reducedMotion: e.target.checked })}
            className="h-4 w-4 rounded border-border-strong"
          />
          Reducir animaciones
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={preferences.highContrast}
            onChange={(e) => setPreferences({ highContrast: e.target.checked })}
            className="h-4 w-4 rounded border-border-strong"
          />
          Alto contraste
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={preferences.lowStimulus}
            onChange={(e) => setPreferences({ lowStimulus: e.target.checked })}
            className="h-4 w-4 rounded border-border-strong"
          />
          Modo de bajo estímulo
        </label>
      </CardBody>
    </Card>
  );
}
