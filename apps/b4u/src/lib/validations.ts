import { z } from "zod";

export { parseBody } from "@devkit/validation";

// --- Route validation ---

const routeEntrySchema = z.object({
  path: z
    .string()
    .min(1, "Path is required")
    .max(200, "Path must be under 200 characters")
    .regex(/^\//, "Path must start with /"),
  title: z.string().min(1, "Title is required").max(100, "Title must be under 100 characters"),
  authRequired: z.boolean(),
  description: z.string().max(500, "Description must be under 500 characters").default(""),
});

export const routesArraySchema = z.array(routeEntrySchema).max(50, "Maximum 50 routes allowed");

// --- User flow validation ---

const userFlowSchema = z.object({
  id: z.string().min(1, "Flow ID is required").max(100),
  name: z.string().min(1, "Flow name is required").max(200),
  steps: z
    .array(z.string().min(1).max(200))
    .min(1, "At least one step is required")
    .max(20, "Maximum 20 steps per flow"),
});

export const userFlowsArraySchema = z.array(userFlowSchema).max(20, "Maximum 20 flows allowed");

// --- Auth override / Env config toggle ---

export const togglePatchSchema = z.object({
  id: z.string().min(1, "ID is required").max(100),
  enabled: z.boolean(),
});

// --- Flow scripts validation ---

const scriptStepSchema = z.object({
  id: z.string().min(1).max(100),
  stepNumber: z.number().int().min(1).max(100),
  url: z.string().min(1).max(200),
  action: z.string().min(1).max(500),
  expectedOutcome: z.string().max(500).default(""),
  duration: z.string().min(1).max(20),
});

const flowScriptSchema = z.object({
  flowId: z.string().min(1).max(100),
  flowName: z.string().min(1).max(200),
  steps: z.array(scriptStepSchema).max(50, "Maximum 50 steps per flow"),
});

export const flowScriptsArraySchema = z.array(flowScriptSchema).max(20, "Maximum 20 flow scripts allowed");

// --- Voiceover scripts validation ---

export const voiceoverScriptsSchema = z.record(
  z.string().min(1),
  z.array(z.string().max(5000, "Paragraph must be under 5000 characters")),
);
