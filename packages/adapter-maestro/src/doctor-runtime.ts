import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type {
	DeviceInfo,
	DoctorCheck,
	DoctorInput,
	ReasonCode,
	RunnerProfile,
	ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
	collectHarnessChecks,
	getInstallArtifactSpec,
	listAvailableDevices as listAvailableDevicesRuntime,
	resolveInstallArtifactPath,
	summarizeInfoCheck,
} from "./device-runtime.js";
import {
	buildDoctorGuidance,
	type DoctorGuidanceItem,
} from "./doctor-guidance.js";
import {
	DEFAULT_ANDROID_DEVICE_ID,
	DEFAULT_IOS_SIMULATOR_UDID,
	resolveRepoPath,
} from "./harness-config.js";
import { WdaRealDeviceBackend } from "./ios-backend-wda.js";
import {
	resolveAndroidPerformancePlanStrategy,
	resolveTraceProcessorPath,
} from "./performance-runtime.js";
import {
	type CommandExecution,
	executeRunner,
	shellEscape,
} from "./runtime-shared.js";
import {
	buildIdbCommand,
	resolveIdbCliPath,
	resolveIdbCompanionPath,
} from "./ui-runtime.js";

const DEFAULT_DEVICE_COMMAND_TIMEOUT_MS = 5000;

type DoctorToolData = {
	checks: DoctorCheck[];
	devices: { android: DeviceInfo[]; ios: DeviceInfo[] };
	guidance: DoctorGuidanceItem[];
};

function summarizeDeviceCheck(name: string, count: number): DoctorCheck {
	if (count > 0) {
		return {
			name,
			status: "pass",
			detail: `${String(count)} available device(s) detected.`,
		};
	}

	return {
		name,
		status: "warn",
		detail: "No available devices detected.",
	};
}

async function checkCommandVersion(
	repoRoot: string,
	command: string,
	args: string[],
	label: string,
): Promise<DoctorCheck> {
	try {
		const result = await executeRunner(
			[command, ...args],
			repoRoot,
			process.env,
		);
		return result.exitCode === 0
			? summarizeInfoCheck(
					label,
					"pass",
					result.stdout.trim() || `${label} is available.`,
				)
			: summarizeInfoCheck(
					label,
					"fail",
					result.stderr.trim() ||
						`${label} returned exit code ${String(result.exitCode)}.`,
				);
	} catch (error) {
		return summarizeInfoCheck(
			label,
			"fail",
			error instanceof Error ? error.message : String(error),
		);
	}
}

export async function checkTcpReachability(
	label: string,
	host: string,
	port: number,
): Promise<DoctorCheck> {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host, port });
		const timeoutMs = 1500;

		const finish = (status: DoctorCheck["status"], detail: string) => {
			socket.destroy();
			resolve(summarizeInfoCheck(label, status, detail));
		};

		socket.setTimeout(timeoutMs);
		socket.once("connect", () =>
			finish("pass", `${host}:${String(port)} is reachable.`),
		);
		socket.once("timeout", () =>
			finish(
				"warn",
				`${host}:${String(port)} did not respond within ${String(timeoutMs)}ms.`,
			),
		);
		socket.once("error", (error) => finish("warn", error.message));
	});
}

export async function checkAdbReverseMappings(
	label: string,
	deviceId: string,
	mappings: string[],
	repoRoot: string,
): Promise<DoctorCheck> {
	if (mappings.length === 0) {
		return summarizeInfoCheck(
			label,
			"pass",
			"No adb reverse mappings configured.",
		);
	}

	try {
		const result = await executeRunner(
			["adb", "-s", deviceId, "reverse", "--list"],
			repoRoot,
			process.env,
		);
		if (result.exitCode !== 0) {
			return summarizeInfoCheck(
				label,
				"warn",
				"adb reverse mappings could not be inspected.",
			);
		}

		const lines = result.stdout
			.replaceAll(String.fromCharCode(13), "")
			.split(String.fromCharCode(10))
			.filter(Boolean);

		const missing = mappings.filter((mapping) => {
			const parts = mapping.split(/\s+/).filter(Boolean);
			return !lines.some((line) => parts.every((part) => line.includes(part)));
		});

		return missing.length === 0
			? summarizeInfoCheck(
					label,
					"pass",
					`Configured adb reverse mappings are active for ${deviceId}.`,
				)
			: summarizeInfoCheck(
					label,
					"warn",
					`Missing adb reverse mapping(s) for ${deviceId}: ${missing.join(", ")}`,
				);
	} catch {
		return summarizeInfoCheck(
			label,
			"warn",
			"adb reverse mappings could not be inspected.",
		);
	}
}

export function summarizeFileCheck(
	name: string,
	filePath: string,
): DoctorCheck {
	const exists = existsSync(filePath);
	return {
		name,
		status: exists ? "pass" : "fail",
		detail: exists ? `${filePath} exists.` : `${filePath} is missing.`,
	};
}

function summarizeOptionalArtifactCheck(
	name: string,
	artifactPath: string,
	kind: "file" | "directory",
): DoctorCheck {
	const exists =
		kind === "directory" ? existsSync(artifactPath) : existsSync(artifactPath);
	return {
		name,
		status: exists ? "pass" : "warn",
		detail: exists
			? `${artifactPath} is available for installation.`
			: `${artifactPath} is not present. The runner can still proceed if the app is already installed or an override env is provided.`,
	};
}

function collectArtifactChecks(repoRoot: string): DoctorCheck[] {
	return (
		["native_android", "native_ios", "flutter_android"] as RunnerProfile[]
	).map((profile) => {
		const spec = getInstallArtifactSpec(profile);
		const artifactPath = resolveInstallArtifactPath(repoRoot, profile);
		return summarizeOptionalArtifactCheck(
			`${profile} artifact`,
			artifactPath ?? `No artifact path configured for ${profile}`,
			spec?.kind ?? "file",
		);
	});
}

async function collectRuntimeStateChecks(
	repoRoot: string,
): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];

	try {
		const androidState = await executeRunner(
			[
				"adb",
				"-s",
				process.env.DEVICE_ID ?? DEFAULT_ANDROID_DEVICE_ID,
				"get-state",
			],
			repoRoot,
			process.env,
		);
		checks.push(
			summarizeInfoCheck(
				"android target state",
				androidState.exitCode === 0 && androidState.stdout.trim() === "device"
					? "pass"
					: "warn",
				androidState.exitCode === 0
					? `Android target state: ${androidState.stdout.trim() || "unknown"}`
					: "Android target state could not be confirmed.",
			),
		);
	} catch {
		checks.push(
			summarizeInfoCheck(
				"android target state",
				"warn",
				"Android target state could not be confirmed.",
			),
		);
	}

	try {
		const iosBoot = await executeRunner(
			[
				"xcrun",
				"simctl",
				"bootstatus",
				process.env.SIM_UDID ?? DEFAULT_IOS_SIMULATOR_UDID,
				"-b",
			],
			repoRoot,
			process.env,
		);
		checks.push(
			summarizeInfoCheck(
				"ios target boot status",
				iosBoot.exitCode === 0 ? "pass" : "warn",
				iosBoot.exitCode === 0
					? "Selected iOS simulator is booted."
					: "Selected iOS simulator is not booted.",
			),
		);
	} catch {
		checks.push(
			summarizeInfoCheck(
				"ios target boot status",
				"warn",
				"Selected iOS simulator is not booted.",
			),
		);
	}

	return checks;
}

async function runCommandSafely(
	command: string[],
	repoRoot: string,
	timeoutMs = DEFAULT_DEVICE_COMMAND_TIMEOUT_MS,
): Promise<CommandExecution> {
	try {
		return await executeRunner(command, repoRoot, process.env, { timeoutMs });
	} catch (error) {
		return {
			exitCode: null,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}

function isPerfettoVersionProbeAvailable(execution: CommandExecution): boolean {
	const combinedOutput = `${execution.stdout}\n${execution.stderr}`.trim();
	return (
		execution.exitCode === 0 &&
		combinedOutput.toLowerCase().includes("perfetto")
	);
}

function isPerfettoShellProbeAvailable(execution: CommandExecution): boolean {
	const output = execution.stdout.trim();
	return execution.exitCode === 0 && output.length > 0 && output !== "missing";
}

async function resolveAndroidSdkLevel(
	repoRoot: string,
	deviceId: string,
): Promise<number | undefined> {
	const execution = await runCommandSafely(
		["adb", "-s", deviceId, "shell", "getprop", "ro.build.version.sdk"],
		repoRoot,
		DEFAULT_DEVICE_COMMAND_TIMEOUT_MS,
	);
	if (execution.exitCode !== 0) {
		return undefined;
	}
	const parsed = Number.parseInt(execution.stdout.trim(), 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

async function resolveIosSimulatorProcessId(
	repoRoot: string,
	deviceId: string,
	appId: string,
): Promise<string | undefined> {
	const execution = await runCommandSafely(
		["xcrun", "simctl", "spawn", deviceId, "launchctl", "list"],
		repoRoot,
		DEFAULT_DEVICE_COMMAND_TIMEOUT_MS,
	);
	if (execution.exitCode !== 0) {
		return undefined;
	}
	const lines = execution.stdout
		.replaceAll(String.fromCharCode(13), "")
		.split(String.fromCharCode(10));
	const match = lines
		.map((line) => line.trim())
		.filter(Boolean)
		.find((line) => line.includes(appId));
	if (!match) {
		return undefined;
	}
	const pid = match.split(String.fromCharCode(9))[0]?.trim();
	return pid && /^\d+$/.test(pid) ? pid : undefined;
}

async function collectPerformanceEnvironmentChecks(
	repoRoot: string,
	androidDevices: DeviceInfo[],
): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];

	try {
		const resolvedTraceProcessorPath = resolveTraceProcessorPath();
		if (!resolvedTraceProcessorPath) {
			checks.push(
				summarizeInfoCheck(
					"trace_processor path",
					"fail",
					"trace_processor was not found on PATH and no known fallback location was detected.",
				),
			);
		} else {
			checks.push(
				summarizeInfoCheck(
					"trace_processor path",
					"pass",
					`Using trace_processor at ${resolvedTraceProcessorPath}.`,
				),
			);
		}
	} catch (error) {
		checks.push(
			summarizeInfoCheck(
				"trace_processor path",
				"fail",
				error instanceof Error ? error.message : String(error),
			),
		);
	}

	const selectedAndroidDeviceId =
		process.env.DEVICE_ID ??
		androidDevices.find((device) => device.available)?.id;
	if (!selectedAndroidDeviceId) {
		checks.push(
			summarizeInfoCheck(
				"android perfetto",
				"warn",
				"No available Android device is selected, so Perfetto device checks were skipped.",
			),
		);
		return checks;
	}

	const perfettoAvailability = await runCommandSafely(
		[
			"adb",
			"-s",
			selectedAndroidDeviceId,
			"shell",
			"sh",
			"-lc",
			"command -v perfetto || which perfetto || echo missing",
		],
		repoRoot,
	);
	const perfettoPath = perfettoAvailability.stdout.trim();
	const perfettoVersion = await runCommandSafely(
		["adb", "-s", selectedAndroidDeviceId, "shell", "perfetto", "--version"],
		repoRoot,
	);
	const perfettoAvailable =
		isPerfettoShellProbeAvailable(perfettoAvailability) ||
		isPerfettoVersionProbeAvailable(perfettoVersion);
	checks.push(
		summarizeInfoCheck(
			"android perfetto",
			perfettoAvailable ? "pass" : "warn",
			isPerfettoShellProbeAvailable(perfettoAvailability)
				? `Android device ${selectedAndroidDeviceId} exposes perfetto at ${perfettoPath}.`
				: isPerfettoVersionProbeAvailable(perfettoVersion)
					? `Android device ${selectedAndroidDeviceId} runs perfetto successfully, but shell path probing did not return a stable executable path.`
					: `Android device ${selectedAndroidDeviceId} did not expose perfetto through path probing or version execution.`,
		),
	);

	const sdkLevel = await resolveAndroidSdkLevel(
		repoRoot,
		selectedAndroidDeviceId,
	);
	const strategy = resolveAndroidPerformancePlanStrategy(sdkLevel);
	const strategyDetail =
		sdkLevel === undefined
			? `Android SDK level could not be detected; defaulting performance capture strategy to config via ${strategy.configTransport} and trace pull via ${strategy.tracePullMode}.`
			: `Android SDK ${String(sdkLevel)} uses config via ${strategy.configTransport} and trace pull via ${strategy.tracePullMode}.`;
	checks.push(
		summarizeInfoCheck(
			"android perfetto strategy",
			sdkLevel === undefined ? "warn" : "pass",
			strategyDetail,
		),
	);

	if (strategy.configTransport === "remote_file") {
		const configProbe = await runCommandSafely(
			[
				"adb",
				"-s",
				selectedAndroidDeviceId,
				"shell",
				"sh",
				"-lc",
				`touch ${shellEscape("/data/misc/perfetto-configs/.mcp_perfetto_probe")} && rm ${shellEscape("/data/misc/perfetto-configs/.mcp_perfetto_probe")} && printf ready`,
			],
			repoRoot,
		);
		checks.push(
			summarizeInfoCheck(
				"android perfetto config readiness",
				configProbe.exitCode === 0 && configProbe.stdout.includes("ready")
					? "pass"
					: "warn",
				configProbe.exitCode === 0 && configProbe.stdout.includes("ready")
					? "Selected Android device can write to the Perfetto config directory."
					: "Selected Android device could not verify write access to the Perfetto config directory.",
			),
		);
	} else {
		const stdinProbe = await runCommandSafely(
			["sh", "-lc", "printf ready"],
			repoRoot,
		);
		checks.push(
			summarizeInfoCheck(
				"android perfetto config readiness",
				"warn",
				stdinProbe.exitCode === 0 && stdinProbe.stdout.includes("ready")
					? "Host shell can compose stdin-based Perfetto commands, but adb/device-side stdin acceptance is not pre-validated by doctor."
					: "Host shell could not verify even the local precondition for stdin-based Perfetto command composition.",
			),
		);
	}

	if (strategy.tracePullMode === "adb_pull") {
		const traceProbe = await runCommandSafely(
			[
				"adb",
				"-s",
				selectedAndroidDeviceId,
				"shell",
				"sh",
				"-lc",
				`touch ${shellEscape("/data/misc/perfetto-traces/.mcp_perfetto_probe")} && rm ${shellEscape("/data/misc/perfetto-traces/.mcp_perfetto_probe")} && printf ready`,
			],
			repoRoot,
		);
		checks.push(
			summarizeInfoCheck(
				"android perfetto trace transfer",
				traceProbe.exitCode === 0 && traceProbe.stdout.includes("ready")
					? "pass"
					: "warn",
				traceProbe.exitCode === 0 && traceProbe.stdout.includes("ready")
					? "Selected Android device can stage trace files in the expected Perfetto trace directory."
					: "Selected Android device could not verify trace staging in the expected Perfetto trace directory.",
			),
		);
	} else {
		const execOutProbe = await runCommandSafely(
			[
				"adb",
				"-s",
				selectedAndroidDeviceId,
				"exec-out",
				"sh",
				"-lc",
				"printf ready",
			],
			repoRoot,
		);
		checks.push(
			summarizeInfoCheck(
				"android perfetto trace transfer",
				execOutProbe.exitCode === 0 && execOutProbe.stdout.includes("ready")
					? "pass"
					: "warn",
				execOutProbe.exitCode === 0 && execOutProbe.stdout.includes("ready")
					? "Selected Android device supports exec-out style trace extraction."
					: "Selected Android device could not verify exec-out style trace extraction.",
			),
		);
	}

	return checks;
}

async function collectIosPerformanceEnvironmentChecks(
	repoRoot: string,
	iosDevices: DeviceInfo[],
): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];
	const selectedIosDeviceId =
		process.env.SIM_UDID ?? iosDevices.find((device) => device.available)?.id;
	if (!selectedIosDeviceId) {
		checks.push(
			summarizeInfoCheck(
				"ios performance templates",
				"warn",
				"No available iOS simulator is selected, so template-specific performance guidance was skipped.",
			),
		);
		return checks;
	}

	checks.push(
		summarizeInfoCheck(
			"ios performance templates",
			"pass",
			"Time Profiler is real-validated on simulator. Allocations can be real-validated when the target app is attached by pid. Animation Hitches remains platform-limited on the current simulator/runtime and should be treated as device-preferred.",
		),
	);

	checks.push(
		summarizeInfoCheck(
			"ios performance recommendation",
			"pass",
			"Prefer Time Profiler by default on simulator. Prefer Allocations only when you can attach to a running app by pid. Avoid Animation Hitches on simulator unless you are only checking functional wiring; use a physical device for trustworthy hitch analysis.",
		),
	);

	const appId = process.env.IOS_APP_ID;
	if (!appId) {
		checks.push(
			summarizeInfoCheck(
				"ios memory attach readiness",
				"warn",
				"Allocations is most reliable when the target app can be attached by pid. Set IOS_APP_ID (or pass appId at runtime) if you want doctor to preflight that path.",
			),
		);
		return checks;
	}

	const processId = await resolveIosSimulatorProcessId(
		repoRoot,
		selectedIosDeviceId,
		appId,
	);
	checks.push(
		summarizeInfoCheck(
			"ios memory attach readiness",
			processId ? "pass" : "warn",
			processId
				? `Allocations can attach to ${appId} on simulator ${selectedIosDeviceId} using pid ${processId}.`
				: `Allocations could not resolve a running pid for ${appId} on simulator ${selectedIosDeviceId}; the tool will need to launch the app or may fall back to unsupported all-process capture.`,
		),
	);

	return checks;
}

async function listArtifacts(
	rootPath: string,
	repoRoot: string,
): Promise<string[]> {
	const directoryEntries = await readdir(rootPath, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of directoryEntries) {
		const entryPath = path.join(rootPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listArtifacts(entryPath, repoRoot)));
		} else {
			files.push(path.relative(repoRoot, entryPath).split(path.sep).join("/"));
		}
	}
	return files;
}

async function collectInstallStateChecks(
	repoRoot: string,
): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];

	try {
		const androidPackage = await executeRunner(
			[
				"adb",
				"-s",
				process.env.DEVICE_ID ?? DEFAULT_ANDROID_DEVICE_ID,
				"shell",
				"pm",
				"path",
				"com.epam.mobitru",
			],
			repoRoot,
			process.env,
		);
		checks.push({
			name: "native_android install state",
			status:
				androidPackage.exitCode === 0 &&
				androidPackage.stdout.includes("package:")
					? "pass"
					: "warn",
			detail:
				androidPackage.exitCode === 0 &&
				androidPackage.stdout.includes("package:")
					? "com.epam.mobitru is installed on the selected Android device."
					: "com.epam.mobitru is not confirmed as installed on the selected Android device.",
		});
	} catch {
		checks.push({
			name: "native_android install state",
			status: "warn",
			detail: "Android install state could not be verified.",
		});
	}

	try {
		const flutterPackage = await executeRunner(
			[
				"adb",
				"-s",
				process.env.DEVICE_ID ?? DEFAULT_ANDROID_DEVICE_ID,
				"shell",
				"pm",
				"path",
				"com.epam.mobitru",
			],
			repoRoot,
			process.env,
		);
		checks.push({
			name: "flutter_android install state",
			status:
				flutterPackage.exitCode === 0 &&
				flutterPackage.stdout.includes("package:")
					? "pass"
					: "warn",
			detail:
				flutterPackage.exitCode === 0 &&
				flutterPackage.stdout.includes("package:")
					? "Flutter Android app id is installed on the selected Android device."
					: "Flutter Android app id is not confirmed as installed on the selected Android device.",
		});
	} catch {
		checks.push({
			name: "flutter_android install state",
			status: "warn",
			detail: "Flutter Android install state could not be verified.",
		});
	}

	try {
		const iosPackage = await executeRunner(
			[
				"xcrun",
				"simctl",
				"get_app_container",
				process.env.SIM_UDID ?? DEFAULT_IOS_SIMULATOR_UDID,
				"com.mobitru.demoapp",
			],
			repoRoot,
			process.env,
		);
		checks.push({
			name: "native_ios install state",
			status: iosPackage.exitCode === 0 ? "pass" : "warn",
			detail:
				iosPackage.exitCode === 0
					? "com.mobitru.demoapp is installed on the selected iOS simulator."
					: "com.mobitru.demoapp is not confirmed as installed on the selected iOS simulator.",
		});
	} catch {
		checks.push({
			name: "native_ios install state",
			status: "warn",
			detail: "iOS install state could not be verified.",
		});
	}

	try {
		const artifactRoot = path.resolve(repoRoot, "artifacts");
		if (existsSync(artifactRoot)) {
			const artifactFiles = await listArtifacts(artifactRoot, repoRoot);
			const errorLogs = artifactFiles.filter((filePath) =>
				filePath.endsWith("command.stderr.log"),
			);
			let detectedConflict = false;

			for (const relativePath of errorLogs) {
				const absolutePath = path.resolve(repoRoot, relativePath);
				const content = (await readFile(absolutePath, "utf8")).toLowerCase();
				if (content.includes("install_failed_version_downgrade")) {
					checks.push({
						name: "android install conflict signal",
						status: "warn",
						detail: `Detected INSTALL_FAILED_VERSION_DOWNGRADE in ${relativePath}. Installed app may be newer than the artifact being deployed.`,
					});
					detectedConflict = true;
					break;
				}
				if (
					content.includes("install_failed_update_incompatible") ||
					content.includes("signatures do not match") ||
					(content.includes("signature") && content.includes("incompatible")) ||
					(content.includes("certificate") && content.includes("mismatch"))
				) {
					checks.push({
						name: "android install conflict signal",
						status: "warn",
						detail: `Detected a signature or certificate install conflict in ${relativePath}. You may need to manually uninstall the existing app before installing a differently signed build.`,
					});
					detectedConflict = true;
					break;
				}
			}

			if (!detectedConflict) {
				checks.push({
					name: "android install conflict signal",
					status: "pass",
					detail:
						"No recent Android install conflict signal was detected in recorded stderr logs.",
				});
			}
		}
	} catch {
		checks.push({
			name: "android install conflict signal",
			status: "warn",
			detail: "Recent Android install conflict logs could not be inspected.",
		});
	}

	return checks;
}

export function isDoctorCriticalFailure(check: DoctorCheck): boolean {
	return [
		"node",
		"pnpm",
		"python3",
		"adb",
		"xcrun simctl",
		"maestro",
		"sample harness config",
	].includes(check.name);
}

export function classifyDoctorOutcome(checks: DoctorCheck[]): {
	status: ToolResult<{
		checks: DoctorCheck[];
		devices: { android: DeviceInfo[]; ios: DeviceInfo[] };
	}>["status"];
	reasonCode: ReasonCode;
} {
	if (
		checks.some(
			(check) => check.status === "fail" && isDoctorCriticalFailure(check),
		)
	) {
		return { status: "failed", reasonCode: REASON_CODES.configurationError };
	}
	if (checks.some((check) => check.status !== "pass")) {
		return { status: "partial", reasonCode: REASON_CODES.deviceUnavailable };
	}
	return { status: "success", reasonCode: REASON_CODES.ok };
}

export async function runDoctorWithMaestro(
	input: DoctorInput = {},
): Promise<ToolResult<DoctorToolData>> {
	const repoRoot = resolveRepoPath();
	const startTime = Date.now();
	const sessionId = `doctor-${Date.now()}`;
	const checks: DoctorCheck[] = [];

	checks.push(
		await checkCommandVersion(repoRoot, "node", ["--version"], "node"),
	);
	checks.push(
		await checkCommandVersion(repoRoot, "pnpm", ["--version"], "pnpm"),
	);
	checks.push(
		await checkCommandVersion(repoRoot, "python3", ["--version"], "python3"),
	);
	checks.push(await checkCommandVersion(repoRoot, "adb", ["version"], "adb"));
	checks.push(
		await checkCommandVersion(
			repoRoot,
			"xcrun",
			["simctl", "help"],
			"xcrun simctl",
		),
	);
	checks.push(
		await checkCommandVersion(
			repoRoot,
			"xcrun",
			["xctrace", "version"],
			"xcrun xctrace",
		),
	);
	checks.push(
		await checkCommandVersion(
			repoRoot,
			"xcrun",
			["devicectl", "help"],
			"xcrun devicectl",
		),
	);
	checks.push(await checkCommandVersion(repoRoot, "axe", ["--version"], "axe"));

	// iproxy check (needed for WDA port forwarding)
	checks.push(
		await checkCommandVersion(repoRoot, "iproxy", ["--version"], "iproxy"),
	);

	// WDA lightweight pre-flight probe (must stay on /status, not /source hierarchy capture)
	const wdaBackend = new WdaRealDeviceBackend();
	const wdaProbe = await wdaBackend.probePreflightReadiness(
		process.env.DEVICE_ID ?? "doctor",
	);
	checks.push(
		summarizeInfoCheck(
			"wda",
			wdaProbe.available ? "pass" : "warn",
			wdaProbe.available
				? "WDA lightweight pre-flight probe is responding on localhost:8100."
				: (wdaProbe.error ??
						"WDA is not responding on localhost:8100. Run 'iproxy 8100 8100 --udid <udid> &' first."),
		),
	);

	checks.push(
		await checkCommandVersion(repoRoot, "maestro", ["--version"], "maestro"),
	);
	try {
		const resolvedTraceProcessorPath = resolveTraceProcessorPath();
		checks.push(
			resolvedTraceProcessorPath
				? await checkCommandVersion(
						repoRoot,
						resolvedTraceProcessorPath,
						["--help"],
						"trace_processor",
					)
				: summarizeInfoCheck(
						"trace_processor",
						"fail",
						"trace_processor was not found on PATH and no known fallback location was detected.",
					),
		);
	} catch (error) {
		checks.push(
			summarizeInfoCheck(
				"trace_processor",
				"fail",
				error instanceof Error ? error.message : String(error),
			),
		);
	}
	let idbCliPath: string | undefined;
	let idbCompanionPath: string | undefined;
	try {
		idbCliPath = resolveIdbCliPath();
		idbCompanionPath = resolveIdbCompanionPath();
		if (idbCliPath) {
			const idbCheck = await checkCommandVersion(
				repoRoot,
				idbCliPath,
				["--help"],
				"idb (deprecated)",
			);
			if (idbCheck.status === "pass") {
				idbCheck.status = "warn";
				idbCheck.detail =
					"idb is available but deprecated. WARNING: idb is deprecated, migrate to xcrun simctl/devicectl.";
			}
			checks.push(idbCheck);
		} else {
			checks.push(
				summarizeInfoCheck(
					"idb (deprecated)",
					"warn",
					"idb not configured (deprecated - migrate to xcrun simctl/devicectl).",
				),
			);
		}
		checks.push(
			summarizeInfoCheck(
				"idb companion (deprecated)",
				"warn",
				idbCompanionPath
					? "idb_companion available but deprecated."
					: "idb_companion not configured (deprecated).",
			),
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		checks.push(summarizeInfoCheck("idb (deprecated)", "fail", message));
		checks.push(
			summarizeInfoCheck("idb companion (deprecated)", "warn", message),
		);
	}
	try {
		const idbTargetResult = await executeRunner(
			buildIdbCommand(["list-targets"]),
			repoRoot,
			process.env,
		);
		const targetUdid = process.env.SIM_UDID ?? DEFAULT_IOS_SIMULATOR_UDID;
		checks.push(
			summarizeInfoCheck(
				"idb target visibility (deprecated)",
				idbTargetResult.exitCode === 0 &&
					idbTargetResult.stdout.includes(targetUdid)
					? "warn"
					: "warn",
				idbTargetResult.exitCode === 0 &&
					idbTargetResult.stdout.includes(targetUdid)
					? `idb can see target ${targetUdid} (deprecated - migrate to simctl).`
					: `idb could not confirm target ${targetUdid} (deprecated backend).`,
			),
		);
	} catch {
		checks.push(
			summarizeInfoCheck(
				"idb target visibility (deprecated)",
				"warn",
				"idb target visibility check skipped (deprecated backend).",
			),
		);
	}

	checks.push(...(await collectHarnessChecks(repoRoot)));
	checks.push(...collectArtifactChecks(repoRoot));
	checks.push(...(await collectInstallStateChecks(repoRoot)));
	checks.push(...(await collectRuntimeStateChecks(repoRoot)));

	const devices = await listAvailableDevicesRuntime(
		repoRoot,
		input.includeUnavailable ?? false,
	);
	checks.push(
		summarizeDeviceCheck(
			"android devices",
			devices.android.filter((device) => device.available).length,
		),
	);
	checks.push(
		summarizeDeviceCheck(
			"ios simulators",
			devices.ios.filter((device) => device.available).length,
		),
	);
	checks.push(
		...(await collectPerformanceEnvironmentChecks(repoRoot, devices.android)),
	);
	checks.push(
		...(await collectIosPerformanceEnvironmentChecks(repoRoot, devices.ios)),
	);

	const { status, reasonCode } = classifyDoctorOutcome(checks);

	const { guidance, nextSuggestions } = buildDoctorGuidance(checks);

	return {
		status,
		reasonCode,
		sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [],
		data: {
			checks,
			devices: {
				android: devices.android,
				ios: devices.ios,
			},
			guidance,
		},
		nextSuggestions,
	};
}
