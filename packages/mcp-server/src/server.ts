export type ToolHandler = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

export type ToolRegistry = Record<string, ToolHandler>;

export class MobileE2EMcpServer {
  constructor(private readonly tools: ToolRegistry) {}

  listTools(): string[] {
    return Object.keys(this.tools);
  }

  async invoke(toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const handler = this.tools[toolName];
    if (!handler) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    return handler(input);
  }
}
