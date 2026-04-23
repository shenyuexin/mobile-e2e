import { getPageContextWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type {
	GetPageContextData,
	GetPageContextInput,
	ToolResult,
} from "@mobile-e2e-mcp/contracts";

export async function getPageContext(
	input: GetPageContextInput,
): Promise<ToolResult<GetPageContextData>> {
	return getPageContextWithMaestro(input);
}
