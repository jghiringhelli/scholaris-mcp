/**
 * License tier module.
 * Determines Pro/Free status via SCHOLARIS_LICENSE_KEY env var.
 * No network calls — local check only.
 */

import { ProFeatureError } from "../errors/index.js";

/**
 * Returns true if a non-empty SCHOLARIS_LICENSE_KEY is set in the environment.
 */
export function isPro(): boolean {
  const key = process.env["SCHOLARIS_LICENSE_KEY"];
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * Throws ProFeatureError if the current tier is Free.
 *
 * @param feature - Human-readable feature name for the error message.
 * @throws {ProFeatureError} When SCHOLARIS_LICENSE_KEY is not set.
 */
export function requirePro(feature: string): void {
  if (!isPro()) {
    throw new ProFeatureError(feature);
  }
}

/**
 * Returns the list of venue IDs available on the Free tier.
 */
export function freeVenues(): string[] {
  return ["arxiv", "acm", "ieee"];
}

/**
 * Returns the list of review profile IDs available on the Free tier.
 */
export function freeProfiles(): string[] {
  return ["structural", "style"];
}
