import { Router } from "express";
import { z } from "zod";
import { simulateDemandStack } from "../lib/demandStackEngine.js";

export const demandStackRouter = Router();

const assumptionsSchema = z.object({
  efficiency: z.object({ enabled: z.boolean(), reductionPercent: z.number().min(0).max(100) }),
  rates: z.object({
    enabled: z.boolean(),
    peakWindowStartHour: z.number().int().min(0).max(23),
    peakWindowEndHour: z.number().int().min(0).max(23),
    shiftPercent: z.number().min(0).max(100),
    conservationEnabled: z.boolean(),
    conservationPercent: z.number().min(0).max(100)
  }),
  demandResponse: z.object({
    enabled: z.boolean(),
    eventStartHour: z.number().int().min(0).max(23),
    durationHours: z.number().int().min(0).max(8),
    participationPercent: z.number().min(0).max(100),
    performancePercent: z.number().min(0).max(100),
    availableCapacityMw: z.number().min(0)
  })
});

const bodySchema = z.object({
  baselineMw: z.array(z.number()).length(24),
  assumptions: assumptionsSchema
});

// This is a pure calculation with no upstream call or secret involved -- it
// is exposed server-side mainly so the browser and any future export job
// share exactly one implementation of the Demand Stack math.
demandStackRouter.post("/demand-stack", (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }
  const results = simulateDemandStack(parsed.data.baselineMw, parsed.data.assumptions);
  res.json({
    data: results,
    quality: { status: "calculated", flags: [] },
    provenance: {
      source: "This application",
      dataset: "Demand Stack calculation engine (v1)",
      sourceUrl: "",
      retrievedAt: new Date().toISOString()
    }
  });
});
