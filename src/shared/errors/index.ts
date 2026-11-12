/**
 * Custom error hierarchy for scholaris-mcp.
 * Every module uses these; bare Error throws are forbidden.
 */

/** Base error for all scholaris errors. Carries context for debugging. */
export class ScholarisError extends Error {
  constructor(
    message: string,
    public readonly context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ScholarisError";
  }
}

/** Thrown when a requested venue profile is not found. */
export class VenueNotFoundError extends ScholarisError {
  constructor(venueId: string) {
    super(`Venue profile not found: '${venueId}'`, { venueId });
    this.name = "VenueNotFoundError";
  }
}

/** Thrown when a requested review profile is not found. */
export class ProfileNotFoundError extends ScholarisError {
  constructor(profileId: string) {
    super(`Review profile not found: '${profileId}'`, { profileId });
    this.name = "ProfileNotFoundError";
  }
}

/** Thrown when a required parameter is missing from a tool call. */
export class MissingParameterError extends ScholarisError {
  constructor(paramName: string, toolName: string) {
    super(`Required parameter '${paramName}' missing for tool '${toolName}'`, {
      paramName,
      toolName,
    });
    this.name = "MissingParameterError";
  }
}

/** Thrown when input paper text cannot be parsed into sections. */
export class PaperParseError extends ScholarisError {
  constructor(reason: string, excerpt?: string) {
    super(`Failed to parse paper: ${reason}`, { reason, excerpt });
    this.name = "PaperParseError";
  }
}

/** Thrown when a YAML template file is malformed. */
export class TemplateLoadError extends ScholarisError {
  constructor(templatePath: string, cause: string) {
    super(`Failed to load template '${templatePath}': ${cause}`, {
      templatePath,
      cause,
    });
    this.name = "TemplateLoadError";
  }
}
