/**
 * Interactive CLI interview flow for the explorer.
 *
 * Uses Node.js readline for interactive input (no external deps).
 * Progressive: skips questions if user has prior config.
 */

import * as readline from "readline";
import type { ExplorerConfig } from "./types.js";
import { INTERVIEW_QUESTIONS, buildDefaultConfig } from "./config.js";
import { ConfigStore } from "./config-store.js";

interface Question {
  id: string;
  prompt: string;
  options: { label: string; value: unknown }[];
  defaultValue: unknown;
}

/**
 * Run the interactive interview and return a populated ExplorerConfig.
 *
 * If `priorConfig` is provided and the user chooses to reuse it,
 * the interview is skipped entirely.
 */
export async function runInterview(
  priorConfig?: ExplorerConfig | null,
  overrides: Partial<ExplorerConfig> = {},
): Promise<ExplorerConfig> {
  // Check if we should reuse prior config
  if (priorConfig && ConfigStore.projectConfigExists()) {
    const reuse = await askYesNo("检测到上次配置，是否使用？[Y/n]", true);
    if (reuse) {
      return { ...priorConfig, ...overrides };
    }
  }

  // Build config from defaults + CLI overrides
  let config = buildDefaultConfig(overrides);

  // Run interview for each question
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    for (const question of INTERVIEW_QUESTIONS) {
      const value = await askQuestion(rl, question, config);
      if (value !== undefined) {
        // Apply the answer to the config
        if (question.id === "mode") {
          config = { ...config, mode: value as ExplorerConfig["mode"] };
        } else if (question.id === "auth") {
          config = { ...config, auth: value as ExplorerConfig["auth"] };
        } else if (question.id === "failureStrategy") {
          config = { ...config, failureStrategy: value as ExplorerConfig["failureStrategy"] };
        } else if (question.id === "maxDepth") {
          config = { ...config, maxDepth: value as number };
        } else if (question.id === "compareWith") {
          config = { ...config, compareWith: value as string | null };
        } else if (question.id === "platform") {
          config = { ...config, platform: value as ExplorerConfig["platform"] };
        } else if (question.id === "destructiveActionPolicy") {
          config = { ...config, destructiveActionPolicy: value as ExplorerConfig["destructiveActionPolicy"] };
        }
      }
    }

    // Ask for appId if not provided
    if (!config.appId) {
      const appId = await askText(rl, "请输入应用 Bundle ID / Package Name: ", "com.example.App");
      config = { ...config, appId };
    }
  } finally {
    rl.close();
  }

  // Apply CLI overrides on top (they always win)
  config = { ...config, ...overrides };

  return config;
}

/**
 * Ask a single question with numbered options.
 * Returns the selected value, or the default if input is empty/invalid.
 */
async function askQuestion(
  rl: readline.Interface,
  question: Question,
  currentConfig: ExplorerConfig,
): Promise<unknown> {
  const optionsText = question.options.map((o) => `  ${o.label}`).join("\n");
  const current = getCurrentValue(question, currentConfig);
  const currentLabel = formatValue(question, current);

  console.log(`\n${question.prompt} (当前: ${currentLabel})`);
  console.log(optionsText);

  const answer = await askText(
    rl,
    `请选择 (${question.options.map((_, i) => i + 1).join("/")}, 回车=${currentLabel}): `,
    "",
  );

  // Empty answer = use default
  if (!answer.trim()) {
    return question.defaultValue;
  }

  // Try to parse as number (1-based index)
  const index = parseInt(answer.trim(), 10);
  if (!isNaN(index) && index >= 1 && index <= question.options.length) {
    return question.options[index - 1].value;
  }

  // Try to match by letter (A, B, C, etc.)
  const letter = answer.trim().toUpperCase();
  const letterIndex = letter.charCodeAt(0) - 65; // 'A' = 0
  if (letterIndex >= 0 && letterIndex < question.options.length) {
    return question.options[letterIndex].value;
  }

  // Invalid answer, use default
  console.log("  -> 无效输入，使用默认值");
  return question.defaultValue;
}

function getCurrentValue(question: Question, config: ExplorerConfig): unknown {
  const key = question.id as keyof ExplorerConfig;
  if (key === "auth") return config.auth;
  if (key === "compareWith") return config.compareWith;
  return config[key];
}

function formatValue(question: Question, value: unknown): string {
  const match = question.options.find((o) => JSON.stringify(o.value) === JSON.stringify(value));
  if (match) {
    // Strip the letter prefix (A), B), etc.)
    return match.label.replace(/^[A-Z]\) /, "");
  }
  return String(value);
}

/**
 * Ask a yes/no question. Returns true for Y, false for N.
 */
async function askYesNo(prompt: string, defaultYes: boolean): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const suffix = defaultYes ? "[Y/n]: " : "[y/N]: ";
    const answer = await new Promise<string>((resolve) => {
      rl.question(prompt + suffix, resolve);
    });
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === "") return defaultYes;
    return trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Ask an open text question with a default value.
 */
async function askText(rl: readline.Interface, prompt: string, defaultValue: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const display = defaultValue ? `${prompt}(${defaultValue}): ` : `${prompt}: `;
    rl.question(display, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}
