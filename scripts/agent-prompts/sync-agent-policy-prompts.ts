import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSyncAgentPolicyPromptsCliOptions, syncAgentPolicyPrompts } from "./sync-agent-policy-prompts-lib.ts";

function repoRootFromNestedScript(scriptImportMetaUrl: string): string {
  const scriptPath = fileURLToPath(scriptImportMetaUrl);
  return path.resolve(path.dirname(scriptPath), "..", "..");
}

async function main(): Promise<void> {
  const cliOptions = parseSyncAgentPolicyPromptsCliOptions(process.argv.slice(2));
  const result = await syncAgentPolicyPrompts({
    agents: cliOptions.agents,
    check: cliOptions.check,
    configPath: cliOptions.configPath,
    dryRun: cliOptions.dryRun,
    repoRoot: repoRootFromNestedScript(import.meta.url),
  });

  if (cliOptions.check) {
    console.log(`Verified ${String(result.checkedAgents)} runtime agent prompt sync target(s).`);
    return;
  }
  if (cliOptions.dryRun) {
    console.log(`Dry run planned ${String(result.plannedAgents)} runtime agent prompt sync target(s).`);
    return;
  }
  console.log(`Updated ${String(result.updatedAgents)} runtime agent prompt target(s) in ${cliOptions.configPath}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
