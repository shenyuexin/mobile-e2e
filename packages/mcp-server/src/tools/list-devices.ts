import type { ListDevicesData, ListDevicesInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { listAvailableDevices } from "@mobile-e2e-mcp/adapter-maestro";

export async function listDevices(input: ListDevicesInput): Promise<ToolResult<ListDevicesData>> {
  return listAvailableDevices(input);
}
