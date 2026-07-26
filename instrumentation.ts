/**
 * Next.js 15 instrumentation hook — runs once when the server process starts, before any
 * request is handled. §35 "trazas": only ever initializes OpenTelemetry when
 * OTEL_EXPORTER_OTLP_ENDPOINT is actually configured, and only in the Node runtime (this
 * same hook also runs on the Edge runtime, which the Node trace SDK doesn't support).
 *
 * Deliberately built from the minimal trace-only packages (sdk-trace-node +
 * exporter-trace-otlp-http + two targeted instrumentations) rather than the
 * @opentelemetry/sdk-node meta-package: sdk-node's own dependency tree pulls in gRPC,
 * Prometheus, and logs exporters this app never uses, all of which require Node built-ins
 * (fs, zlib, http as bare specifiers) that Next's webpack bundling of server code can't
 * resolve — the minimal set avoids that entirely.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  const { NodeTracerProvider, BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { HttpInstrumentation } = await import("@opentelemetry/instrumentation-http");
  const { PgInstrumentation } = await import("@opentelemetry/instrumentation-pg");
  const { registerInstrumentations } = await import("@opentelemetry/instrumentation");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "crisis-platform" }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }))],
  });
  provider.register();

  registerInstrumentations({ instrumentations: [new HttpInstrumentation(), new PgInstrumentation()] });
}
