import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server/index.js";

/**
 * Vercel entry point. Vercel doesn't run a long-lived server -- it bundles
 * each file under /api into its own serverless function and calls it per
 * request. An Express app is already a valid (req, res) handler (that's
 * what http.createServer(app) relies on), so the whole existing app mounts
 * here unchanged; no route needs to be rewritten as an individual function.
 *
 * vercel.json rewrites every /api/* request to this function while leaving
 * the original path in req.url, so Express's own routers (mounted at
 * /api/energy/...) still match exactly as they do in local dev.
 */
const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
