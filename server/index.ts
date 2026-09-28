import express from "express";
import cors from "cors";
import { pathToFileURL } from "node:url";
import { ENV } from "./env.js";
import { regionsRouter } from "./routes/regions.js";
import { stateOverviewRouter } from "./routes/stateOverview.js";
import { loadProfileRouter } from "./routes/loadProfile.js";
import { peakDaysRouter } from "./routes/peakDays.js";
import { sourceStatusRouter } from "./routes/sourceStatus.js";
import { demandStackRouter } from "./routes/demandStack.js";
import { rateSchedulesRouter } from "./routes/rateSchedules.js";
import { diagnosticsRouter } from "./routes/diagnostics.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Very small in-memory rate limiter: caps requests per IP per minute so a
  // runaway client can't hammer the EIA upstream through this server.
  const hits = new Map<string, { count: number; resetAt: number }>();
  app.use("/api/energy", (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + 60_000 });
    } else {
      entry.count++;
      if (entry.count > 120) {
        res.status(429).json({ error: "rate_limited", retryAfterMs: entry.resetAt - now });
        return;
      }
    }
    next();
  });

  app.use("/api/energy", regionsRouter);
  app.use("/api/energy", stateOverviewRouter);
  app.use("/api/energy", loadProfileRouter);
  app.use("/api/energy", peakDaysRouter);
  app.use("/api/energy", sourceStatusRouter);
  app.use("/api/energy", demandStackRouter);
  app.use("/api/energy", rateSchedulesRouter);

  if (ENV.NODE_ENV !== "production") {
    app.use("/api/energy/dev", diagnosticsRouter);
  }

  // Centralized error handler: never leak stack traces or the API key.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

// Compare via pathToFileURL rather than a naive `file://${...}` template --
// the latter doesn't percent-encode characters like spaces, so it silently
// mismatches (and this entrypoint guard silently never fires, no error) for
// any project checked out under a path containing a space, e.g.
// ".../Demand Stack Simulator/server/index.ts". Confirmed via live testing.
const isDirectlyExecuted =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectlyExecuted) {
  const app = createApp();
  app.listen(ENV.PORT, () => {
    console.log(`Demand Stack Simulator API listening on :${ENV.PORT} (adapter=${ENV.ENERGY_DATA_ADAPTER})`);
  });
}
