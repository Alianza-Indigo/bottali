import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AccessibilityProvider } from "@/components/accessibility/AccessibilityProvider";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: {
    default: "Plataforma de Herramientas Conversacionales",
    template: "%s · Plataforma de Herramientas Conversacionales",
  },
  description: "Crea, configura y opera herramientas conversacionales basadas en inteligencia artificial.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Crisis Platform",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <a href="#main-content" className="skip-link">
          Saltar al contenido principal
        </a>
        <AccessibilityProvider>
          <QueryProvider>{children}</QueryProvider>
        </AccessibilityProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
