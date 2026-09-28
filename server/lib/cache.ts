import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Replaceable cache interface. Ships with a dev-only filesystem
 * implementation; swap `FileCache` for a Postgres/Supabase/Redis-backed
 * implementation of the same interface in production (see
 * docs/ARCHITECTURE.md "Cache behavior"). Never store secrets in the cache.
 */
export interface CacheEntry<T> {
  value: T;
  retrievedAt: string;
  expiresAt: string;
  requestParams: Record<string, unknown>;
  sourceKey: string;
}

export type CacheLookupStatus = "fresh" | "stale" | "miss";

export interface CacheLookupResult<T> {
  status: CacheLookupStatus;
  entry?: CacheEntry<T>;
}

export interface EnergyCache {
  get<T>(key: string): Promise<CacheLookupResult<T>>;
  set<T>(key: string, value: T, ttlMs: number, requestParams: Record<string, unknown>, sourceKey: string): Promise<void>;
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** Builds a cache key from a dataset name + sorted request params, so identical requests always collide correctly. */
export function buildCacheKey(dataset: string, params: Record<string, unknown>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${k}=${JSON.stringify(params[k])}`)
    .join("&");
  return `${dataset}::${sortedParams}`;
}

export class FileCache implements EnergyCache {
  constructor(private readonly dir: string) {}

  private fileFor(key: string): string {
    return path.join(this.dir, `${hashKey(key)}.json`);
  }

  async get<T>(key: string): Promise<CacheLookupResult<T>> {
    const file = this.fileFor(key);
    if (!existsSync(file)) return { status: "miss" };
    try {
      const raw = await readFile(file, "utf-8");
      const entry = JSON.parse(raw) as CacheEntry<T>;
      const fresh = new Date(entry.expiresAt).getTime() > Date.now();
      return { status: fresh ? "fresh" : "stale", entry };
    } catch {
      return { status: "miss" };
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlMs: number,
    requestParams: Record<string, unknown>,
    sourceKey: string
  ): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const entry: CacheEntry<T> = {
      value,
      retrievedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      requestParams,
      sourceKey
    };
    await writeFile(this.fileFor(key), JSON.stringify(entry), "utf-8");
  }
}

/** In-memory cache, used by tests and as a fallback when the filesystem isn't writable. */
export class MemoryCache implements EnergyCache {
  private store = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<CacheLookupResult<T>> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return { status: "miss" };
    const fresh = new Date(entry.expiresAt).getTime() > Date.now();
    return { status: fresh ? "fresh" : "stale", entry };
  }

  async set<T>(
    key: string,
    value: T,
    ttlMs: number,
    requestParams: Record<string, unknown>,
    sourceKey: string
  ): Promise<void> {
    this.store.set(key, {
      value,
      retrievedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      requestParams,
      sourceKey
    });
  }
}
