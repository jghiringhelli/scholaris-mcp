#!/usr/bin/env node
/**
 * scholaris-mcp entry point.
 * Starts the MCP server and registers the unified scholaris tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dispatch, scholarisMcpSchema } from "./tools/scholaris-router.js";
import { ScholarisError } from "./shared/errors/index.js";
import { logger } from "./shared/logger/index.js";

const MODULE = "index";
const SERVER_NAME = "scholaris-mcp";
const SERVER_VERSION = "0.1.0";

async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.tool(
    "scholaris",
    "Academic paper review and publication preparation tools.\n\n" +
      "Actions:\n" +
      "  review_paper      — Structured review protocol targeting logical, rhetorical, structural, and style dimensions\n" +
      "  check_venue_fit   — Assess paper readiness across multiple publication venues\n" +
      "  diff_audit        — Detect cascade effects after section revisions\n" +
      "  generate_rebuttal — Build structured rebuttal scaffold from reviewer comments",
    scholarisMcpSchema.shape,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args): Promise<any> => {
      try {
        return await dispatch(args);
      } catch (err) {
        if (err instanceof ScholarisError) {
          logger.error(MODULE, "Tool error", { name: err.name, message: err.message, context: err.context });
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
        logger.error(MODULE, "Unexpected error", { err: String(err) });
        return {
          content: [{ type: "text", text: `Unexpected error: ${String(err)}` }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(MODULE, "Scholaris MCP server started", { version: SERVER_VERSION });
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
