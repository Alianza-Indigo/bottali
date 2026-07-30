import { describe, expect, it } from "vitest";
import {
  capabilitiesSchema,
  externalCredentialInputSchema,
} from "@/lib/validation/tools";

describe("tool credential validation", () => {
  it.each(["Host", "Content-Length", "Cookie", "Proxy-Authorization", "Proxy-Custom", "Sec-Fetch-Site"])(
    "rejects reserved API-key header %s",
    (headerName) => {
      const result = externalCredentialInputSchema.safeParse({
        name: "CRM",
        authType: "api_key",
        secret: "secret-value",
        headerName,
      });
      expect(result.success).toBe(false);
    },
  );

  it("accepts a custom API-key header", () => {
    expect(
      externalCredentialInputSchema.safeParse({
        name: "CRM",
        authType: "api_key",
        secret: "secret-value",
        headerName: "X-CRM-Key",
      }).success,
    ).toBe(true);
  });

  it("normalizes an empty endpoint credential to undefined", () => {
    const booleans = {
      text: true,
      streaming: true,
      voiceInput: false,
      voiceOutput: false,
      files: false,
      images: false,
      forms: false,
      quickReplies: false,
      menus: false,
      memory: false,
      history: true,
      rag: false,
      exportEnabled: false,
      documentGeneration: false,
      internalTools: false,
      externalApis: true,
      notifications: false,
      evaluations: false,
      escalation: false,
      feedback: false,
      pwa: false,
      deepLinks: false,
    };
    const parsed = capabilitiesSchema.parse({
      ...booleans,
      externalApiEndpoints: [
        {
          name: "create_ticket",
          url: "https://api.example.com/tickets",
          method: "POST",
          credentialId: "",
        },
      ],
    });
    expect(parsed.externalApiEndpoints[0]?.credentialId).toBeUndefined();
  });
});
