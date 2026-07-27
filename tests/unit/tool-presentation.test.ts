import { describe, expect, it } from "vitest";
import { getVisibleToolStatus, getVisibleVersionStatus } from "@/lib/tools/presentation";

describe("tool publication presentation", () => {
  it("collapses technical tool states into the five public states", () => {
    expect(getVisibleToolStatus("CONFIGURATION_INCOMPLETE")).toBe("Borrador");
    expect(getVisibleToolStatus("APPROVED")).toBe("En revisión");
    expect(getVisibleToolStatus("PUBLISHED")).toBe("Publicada");
    expect(getVisibleToolStatus("SUSPENDED")).toBe("Pausada");
    expect(getVisibleToolStatus("ARCHIVED")).toBe("Archivada");
  });

  it("uses the same public vocabulary for versions", () => {
    expect(getVisibleVersionStatus("TESTING")).toBe("Borrador");
    expect(getVisibleVersionStatus("SCHEDULED")).toBe("En revisión");
    expect(getVisibleVersionStatus("SUPERSEDED")).toBe("Archivada");
  });
});
