import type { ToolResult, TypeIntoElementData, TypeIntoElementInput } from "@mobile-e2e-mcp/contracts";
import { typeIntoElementWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function typeIntoElement(input: TypeIntoElementInput): Promise<ToolResult<TypeIntoElementData>> {
  return typeIntoElementWithMaestro(input);
}
