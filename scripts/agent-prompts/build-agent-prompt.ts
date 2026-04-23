import { buildAgentPrompt, parseBuildPromptCliOptions, repoRootFromScript } from "./build-agent-prompt-lib.ts";

async function main(): Promise<void> {
  const cliOptions = parseBuildPromptCliOptions(process.argv.slice(2));
  const result = await buildAgentPrompt({
    agent: cliOptions.agent,
    outPath: cliOptions.outPath,
    policy: cliOptions.policy,
    repoRoot: repoRootFromScript(import.meta.url),
  });

  if (cliOptions.outPath) {
    const label = cliOptions.agent ?? cliOptions.policy;
    console.log(`Built ${label} agent prompt at ${cliOptions.outPath}.`);
    return;
  }

  process.stdout.write(`${result.prompt}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
