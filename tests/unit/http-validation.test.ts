import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseOptionalJsonBody } from "@/lib/validation/http";

const schema = z.object({ reason: z.string().max(20).optional() });

describe("parseOptionalJsonBody", () => {
  it("accepts an empty body when the schema accepts an empty object", async () => {
    const request = new Request("http://localhost/request-access", { method: "POST" });
    await expect(parseOptionalJsonBody(request, schema)).resolves.toEqual({});
  });

  it("parses a valid optional JSON body", async () => {
    const request = new Request("http://localhost/request-access", {
      method: "POST",
      body: JSON.stringify({ reason: "Necesito acceso" }),
    });
    await expect(parseOptionalJsonBody(request, schema)).resolves.toEqual({
      reason: "Necesito acceso",
    });
  });

  it("rejects malformed JSON instead of silently treating it as an empty body", async () => {
    const request = new Request("http://localhost/request-access", {
      method: "POST",
      body: "{invalid",
    });
    await expect(parseOptionalJsonBody(request, schema)).rejects.toMatchObject({
      code: "INVALID_JSON",
      httpStatus: 400,
    });
  });
});
