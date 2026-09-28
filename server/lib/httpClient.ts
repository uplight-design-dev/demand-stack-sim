/**
 * Fetch wrapper with a timeout and exponential-backoff retry, used only by
 * the EIA adapter. Never logs or returns the request URL verbatim if it
 * contains an api_key -- callers pass the key separately so we can redact it.
 */
export interface FetchWithRetryOptions {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  /**
   * Name of the upstream service, used only in the thrown error's message
   * (e.g. "EIA request failed with 500"). Defaults to "EIA" since that was
   * this function's original and still most common caller; the URDB
   * adapter passes "OpenEI URDB" so a rate-schedule failure doesn't get
   * mislabeled as an EIA failure in logs and in the UI message that's
   * built from it.
   */
  serviceLabel?: string;
}

export class UpstreamError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "UpstreamError";
  }
}

export async function fetchJsonWithRetry(
  url: string,
  opts: FetchWithRetryOptions = {}
): Promise<unknown> {
  const { timeoutMs = 10_000, retries = 3, baseDelayMs = 400, serviceLabel = "EIA" } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) {
          lastError = new UpstreamError(`${serviceLabel} request failed with ${res.status}`, res.status);
          await delay(baseDelayMs * 2 ** attempt);
          continue;
        }
        throw new UpstreamError(`${serviceLabel} request failed with ${res.status}`, res.status);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await delay(baseDelayMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new UpstreamError(`${serviceLabel} request failed`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strips api_key from a URL string, for safe logging. */
export function redactApiKey(url: string): string {
  return url.replace(/([?&]api_key=)[^&]+/i, "$1***");
}

/**
 * Node's built-in fetch collapses the real failure (DNS lookup, connection
 * refused, TLS error, a blocked/misconfigured proxy, ...) into a generic
 * "fetch failed" Error, with the actual detail tucked away in `.cause`.
 * Surfacing it here made a real diagnosis (a restricted network egress
 * policy returning "403 from proxy after CONNECT") legible instead of just
 * "EIA request failed: fetch failed". Any URL-shaped text in the cause is
 * redacted the same way a logged request URL would be.
 */
export function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  const causeMessage =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : undefined;
  const full = causeMessage ? `${err.message} (${causeMessage})` : err.message;
  return redactApiKey(full);
}
