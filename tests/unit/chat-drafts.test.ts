import { describe, expect, it } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "@/lib/chat/drafts";

/**
 * The unit test environment has no IndexedDB (environment: "node" in vitest.config.ts) —
 * this verifies the module's documented behavior for exactly that case: every operation is
 * best-effort and must never throw, never hang, and must resolve loadDraft to "" rather than
 * reject. Browser behavior (a real IndexedDB) is exercised for real in tests/e2e.
 */
describe("chat draft persistence (§22/§36) — IndexedDB-unavailable fallback", () => {
  it("loadDraft resolves to an empty string instead of rejecting", async () => {
    await expect(loadDraft("some-conversation")).resolves.toBe("");
  });

  it("saveDraft resolves without throwing", async () => {
    await expect(saveDraft("some-conversation", "borrador en progreso")).resolves.toBeUndefined();
  });

  it("clearDraft resolves without throwing", async () => {
    await expect(clearDraft("some-conversation")).resolves.toBeUndefined();
  });
});
