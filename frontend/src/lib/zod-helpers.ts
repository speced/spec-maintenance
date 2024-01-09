import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export const checkInstant = z.string().refine(val => {
    try { Temporal.Instant.from(val); return true; } catch { return false; }
});
export const checkDuration = z.string().refine(val => {
    try { Temporal.Duration.from(val); return true; } catch { return false; }
});
export const duration = z.string().transform(val => Temporal.Duration.from(val));
export const instant = z.string().transform(val => Temporal.Instant.from(val));
