import type { DeviceInfo, DoctorCheck, DoctorInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { runDoctor } from "@mobile-e2e-mcp/adapter-maestro";

export async function doctor(input: DoctorInput): Promise<ToolResult<{ checks: DoctorCheck[]; devices: { android: DeviceInfo[]; ios: DeviceInfo[] } }>> {
  return runDoctor(input);
}
