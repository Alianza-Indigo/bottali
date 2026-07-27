import { describe, expect, it } from "vitest";
import { sanitizeReturnPath } from "@/lib/auth/return-path";

describe("sanitizeReturnPath", () => {
  it("keeps an internal path with query and fragment", () => {
    expect(sanitizeReturnPath("/tools?filter=active#results")).toBe(
      "/tools?filter=active#results",
    );
  });

  it.each([
    undefined,
    null,
    "",
    "dashboard",
    "https://attacker.example/path",
    "//attacker.example/path",
  ])("falls back to the dashboard for unsafe value %s", (value) => {
    expect(sanitizeReturnPath(value)).toBe("/dashboard");
  });
});
