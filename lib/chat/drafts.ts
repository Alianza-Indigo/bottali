"use client";

/**
 * §22/§36 "borradores locales": persists the chat composer's in-progress text per
 * conversation in IndexedDB (not just component state), so a reload/crash mid-message
 * doesn't lose what the user was typing. Every operation is best-effort — IndexedDB can be
 * unavailable (private browsing, disabled by policy, SSR/test environments) and a lost draft
 * is a UX papercut, never a reason to break sending a message.
 */

const DB_NAME = "crisis-chat-drafts";
const STORE_NAME = "drafts";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no disponible en este entorno."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraft(conversationId: string, text: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      if (text) store.put(text, conversationId);
      else store.delete(conversationId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Best-effort — see module comment.
  }
}

export async function loadDraft(conversationId: string): Promise<string> {
  try {
    const db = await openDb();
    const text = await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(conversationId);
      request.onsuccess = () => resolve(request.result as string | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return text ?? "";
  } catch {
    return "";
  }
}

export function clearDraft(conversationId: string): Promise<void> {
  return saveDraft(conversationId, "");
}
