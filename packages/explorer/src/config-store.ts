/**
 * File-based config store for the explorer.
 *
 * Supports project-local (.explorer-config.json) and global
 * (~/.config/mobile-e2e-mcp/explorer.json) config paths.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync } from "fs";
import { homedir, platform } from "os";
import { join, dirname } from "path";
import type { ExplorerConfig } from "./types.js";

const PROJECT_CONFIG = ".explorer-config.json";
const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

function globalConfigPath(): string {
  const home = homedir();
  if (platform() === "win32") {
    return join(home, "AppData", "Local", "mobile-e2e-mcp", "explorer.json");
  }
  return join(home, ".config", "mobile-e2e-mcp", "explorer.json");
}

/**
 * ConfigStore manages persistence of ExplorerConfig.
 *
 * Resolution order: explicit path > project-local > global.
 */
export class ConfigStore {
  private _explicitPath: string | undefined;

  constructor(explicitPath?: string) {
    this._explicitPath = explicitPath;
  }

  /** Resolve the effective config path. */
  resolvePath(): string {
    if (this._explicitPath) return this._explicitPath;
    if (existsSync(PROJECT_CONFIG)) return PROJECT_CONFIG;
    return globalConfigPath();
  }

  /** Load config from the effective path. Returns null if not found or invalid. */
  load(): ExplorerConfig | null {
    const target = this.resolvePath();
    if (!existsSync(target)) return null;
    try {
      const raw = readFileSync(target, "utf-8");
      return JSON.parse(raw) as ExplorerConfig;
    } catch {
      return null;
    }
  }

  /** Save config to the effective path. Creates parent directories if needed. */
  save(config: ExplorerConfig): void {
    const target = this.resolvePath();
    const dir = dirname(target);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(target, JSON.stringify(config, null, 2), "utf-8");
  }

  /** Delete the config file at the effective path. */
  clear(): void {
    const target = this.resolvePath();
    if (existsSync(target)) {
      unlinkSync(target);
    }
  }

  /** Check if config exists at the effective path. */
  exists(): boolean {
    return existsSync(this.resolvePath());
  }

  /** Check if the config at the effective path is recent (< 24 hours). */
  isRecent(): boolean {
    const target = this.resolvePath();
    if (!existsSync(target)) return false;
    try {
      const stat = statSync(target);
      return Date.now() - stat.mtimeMs < RECENT_THRESHOLD_MS;
    } catch {
      return false;
    }
  }

  /** Check if a project-local config exists and is recent. */
  static projectConfigExists(): boolean {
    if (!existsSync(PROJECT_CONFIG)) return false;
    try {
      const stat = statSync(PROJECT_CONFIG);
      return Date.now() - stat.mtimeMs < RECENT_THRESHOLD_MS;
    } catch {
      return false;
    }
  }
}
