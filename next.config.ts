import type { NextConfig } from "next";

// Next.js dev mode's Fast Refresh relies on eval()-based source maps, which a strict CSP
// blocks — without 'unsafe-eval' in development the client bundle fails to initialize and
// the app silently falls back to non-hydrated static HTML (forms submit as native GETs,
// nothing is interactive, with no visible error except a CSP violation in the console).
// Production builds don't need eval, so the stricter policy only applies there.
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https:${isDev ? " ws:" : ""}`,
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // instrumentation.ts (§35 OpenTelemetry, conditional on OTEL_EXPORTER_OTLP_ENDPOINT) and
  // Sentry (conditional on SENTRY_DSN) are Node-only server code with native dependencies —
  // excluding them from webpack bundling makes Next require() them natively at runtime
  // instead, which is the standard fix for this class of package with Next.js.
  serverExternalPackages: [
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/sdk-trace-base",
    "@opentelemetry/sdk-trace",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/instrumentation-http",
    "@opentelemetry/instrumentation-pg",
    "@opentelemetry/instrumentation",
    "@sentry/node",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
