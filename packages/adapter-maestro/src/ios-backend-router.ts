import type { IosExecutionBackend, BackendProbeResult, BackendProbeSummary } from "./ios-backend-types.js";
import { SimctlSimulatorBackend } from "./ios-backend-simctl.js";
import { AxeSimulatorBackend } from "./ios-backend-axe.js";
import { DevicectlPhysicalBackend } from "./ios-backend-devicectl.js";
import { isIosPhysicalDeviceId } from "./device-runtime.js";
import { executeRunnerWithTestHooks } from "./runtime-shared.js";

// -- Test hooks --

let _testBackend: IosExecutionBackend | null = null;

/** Override the backend returned by selectBackend() for testing. */
export function setBackendForTesting(backend: IosExecutionBackend): void {
  _testBackend = backend;
}

/** Clear the test override so production routing is restored. */
export function resetForTesting(): void {
  _testBackend = null;
}

// -- Router class --

type BackendId = "simctl" | "devicectl" | "maestro" | "idb" | "axe";

const VALID_BACKENDS = new Set<BackendId>(["simctl", "devicectl", "maestro", "idb", "axe"]);

function isValidBackendId(value: string): value is BackendId {
  return VALID_BACKENDS.has(value as BackendId);
}

export class IosBackendRouter {
  private axeBackend = new AxeSimulatorBackend();
  private simctlBackend = new SimctlSimulatorBackend();
  private devicectlBackend = new DevicectlPhysicalBackend();

  /**
   * Select the appropriate iOS execution backend for the given device.
   *
   * Priority:
   * 1. Test override (setBackendForTesting)
   * 2. Explicit IOS_EXECUTION_BACKEND environment variable
   * 3. Auto-detect by device type (physical UDID -> devicectl, simulator UDID -> axe)
   */
  selectBackend(deviceId: string, env: NodeJS.ProcessEnv = process.env): IosExecutionBackend {
    // Test override
    if (_testBackend) {
      return _testBackend;
    }

    // 1. Explicit environment variable override
    const envBackend = env.IOS_EXECUTION_BACKEND?.trim().toLowerCase();
    if (envBackend) {
      if (!isValidBackendId(envBackend)) {
        throw new Error(
          `Invalid IOS_EXECUTION_BACKEND: "${envBackend}". Valid values: ${[...VALID_BACKENDS].join(", ")}`,
        );
      }
      if (envBackend === "idb") {
        // Deprecated but acknowledged
        console.error(
          "WARNING: idb backend is deprecated and will be removed in a future version. " +
          "Migrate to simctl or devicectl. See docs/architecture/adapters-ios.md",
        );
      }
      return this.resolveBackendById(envBackend, deviceId);
    }

    // 2. Auto-detect by device type
    if (isIosPhysicalDeviceId(deviceId)) {
      return this.devicectlBackend;
    }
    return this.axeBackend;
  }

  /**
   * Probe all candidate backends and return a summary.
   * Used for doctor checks and fallback-chain diagnostics.
   */
  async probeAllBackends(repoRoot: string): Promise<BackendProbeSummary> {
    const [axe, simctl, devicectl, maestro] = await Promise.all([
      this.axeBackend.probeAvailability(repoRoot),
      this.simctlBackend.probeAvailability(repoRoot),
      this.probeDevicectlAvailability(repoRoot),
      this.probeMaestroAvailability(repoRoot),
    ]);

    return { axe, simctl, devicectl, maestro };
  }

  // -- Private helpers --

  private resolveBackendById(
    backendId: BackendId,
    _deviceId: string,
  ): IosExecutionBackend {
    switch (backendId) {
      case "axe":
        return this.axeBackend;
      case "simctl":
        return this.simctlBackend;
      case "devicectl":
        return this.devicectlBackend;
      case "maestro":
        throw new Error(
          'Backend "maestro" is not yet implemented in this phase. ' +
          "Use simctl or devicectl for now.",
        );
      case "idb":
        throw new Error(
          'Backend "idb" is deprecated and not implemented in this phase. ' +
          "Migrate to simctl or devicectl.",
        );
      default: {
        const _exhaustive: never = backendId;
        throw new Error(`Unknown backend: ${String(_exhaustive)}`);
      }
    }
  }

  private async probeDevicectlAvailability(repoRoot: string): Promise<BackendProbeResult> {
    try {
      return await this.devicectlBackend.probeAvailability(repoRoot);
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async probeMaestroAvailability(repoRoot: string): Promise<BackendProbeResult> {
    try {
      const result = await executeRunnerWithTestHooks(["maestro", "--version"], repoRoot, process.env);
      if (result.exitCode !== 0) {
        return { available: false, error: `maestro --version failed: ${result.stderr.trim()}` };
      }
      const version = result.stdout.trim().match(/([\d.]+)/)?.[1];
      return { available: true, version };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// -- Factory function --

let _routerInstance: IosBackendRouter | null = null;

/** Get the shared IosBackendRouter singleton. */
export function getIosBackendRouter(): IosBackendRouter {
  if (!_routerInstance) {
    _routerInstance = new IosBackendRouter();
  }
  return _routerInstance;
}
