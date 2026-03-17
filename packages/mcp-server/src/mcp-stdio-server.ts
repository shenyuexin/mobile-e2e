import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./index.js";
import { buildToolList } from "./stdio-server.js";

async function main(): Promise<void> {
  const runtime = createServer();
  const server = new Server(
    {
      name: "mobile-e2e-mcp",
      version: "0.1.4",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = buildToolList().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
    }));
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const result = await runtime.invoke(name as never, args as never);
    const payload = JSON.stringify(result, null, 2);

    return {
      content: [
        {
          type: "text",
          text: payload,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
