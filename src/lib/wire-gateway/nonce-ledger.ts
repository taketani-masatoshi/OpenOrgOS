import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface NonceLedgerEntry {
  sender: string;
  nonce: string;
  seen_at: string;
}

export interface NonceLedgerStore {
  entries: NonceLedgerEntry[];
}

export class NonceLedger {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  private load(): NonceLedgerStore {
    if (!existsSync(this.path)) {
      return { entries: [] };
    }
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf-8")) as NonceLedgerStore;
      return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
    } catch {
      return { entries: [] };
    }
  }

  private save(store: NonceLedgerStore): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(store, null, 2), "utf-8");
  }

  private prune(store: NonceLedgerStore, ttlSec: number): NonceLedgerStore {
    const cutoff = Date.now() - ttlSec * 1000;
    return {
      entries: store.entries.filter((e) => new Date(e.seen_at).getTime() >= cutoff),
    };
  }

  /** Returns false when (sender, nonce) was already seen within ttl. */
  checkAndRecord(sender: string, nonce: string, ttlSec: number): { ok: boolean; reason?: string } {
    const store = this.prune(this.load(), ttlSec);
    const key = `${sender}:${nonce}`;
    const duplicate = store.entries.some((e) => `${e.sender}:${e.nonce}` === key);
    if (duplicate) {
      return { ok: false, reason: "replay" };
    }
    store.entries.push({
      sender,
      nonce,
      seen_at: new Date().toISOString(),
    });
    this.save(store);
    return { ok: true };
  }
}
