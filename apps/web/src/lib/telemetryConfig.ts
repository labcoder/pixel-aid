export type TelemetryProvider = "none" | "posthog";

export type TelemetryBuildChannel = "dev" | "release";

export type TelemetryConfig = {
  enabled: boolean;
  provider: TelemetryProvider;
  posthogHost: string;
  posthogProjectKey: string;
  buildChannel: TelemetryBuildChannel;
  distribution: string;
};

export type TelemetryBuildEnv = Record<string, string | boolean | undefined>;

type TelemetryGlobal = {
  __PIXELAID_TELEMETRY_CONFIG__?: unknown;
};

const defaultTelemetryConfig: TelemetryConfig = {
  enabled: false,
  provider: "none",
  posthogHost: "",
  posthogProjectKey: "",
  buildChannel: "dev",
  distribution: "web_dev"
};

function enabledFromEnv(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return value === "1" || value?.toLowerCase() === "true";
}

function stringFromEnv(value: string | boolean | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHost(value: string): string {
  return value.replace(/\/+$/u, "");
}

function normalizeBuildChannel(value: string): TelemetryBuildChannel {
  return value === "release" ? "release" : "dev";
}

function isTelemetryConfig(value: unknown): value is TelemetryConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<TelemetryConfig>;
  return (
    typeof candidate.enabled === "boolean" &&
    (candidate.provider === "none" || candidate.provider === "posthog") &&
    typeof candidate.posthogHost === "string" &&
    typeof candidate.posthogProjectKey === "string" &&
    (candidate.buildChannel === "dev" || candidate.buildChannel === "release") &&
    typeof candidate.distribution === "string"
  );
}

export function createTelemetryBuildConfig(env: TelemetryBuildEnv): TelemetryConfig {
  const requestedProvider = stringFromEnv(env.TELEMETRY_PROVIDER).toLowerCase();
  const posthogProjectKey = stringFromEnv(env.TELEMETRY_POSTHOG_PROJECT_KEY);
  const posthogHost = normalizeHost(stringFromEnv(env.TELEMETRY_POSTHOG_HOST));
  const enabled = enabledFromEnv(env.TELEMETRY_ENABLED);
  const provider: TelemetryProvider = enabled && requestedProvider === "posthog" && posthogProjectKey && posthogHost ? "posthog" : "none";

  return {
    enabled: provider !== "none",
    provider,
    posthogHost: provider === "posthog" ? posthogHost : "",
    posthogProjectKey: provider === "posthog" ? posthogProjectKey : "",
    buildChannel: normalizeBuildChannel(stringFromEnv(env.TELEMETRY_BUILD_CHANNEL)),
    distribution: stringFromEnv(env.TELEMETRY_DISTRIBUTION) || "web_dev"
  };
}

export function getTelemetryConfig(globalObject: TelemetryGlobal = globalThis as TelemetryGlobal): TelemetryConfig {
  const config = Object.prototype.hasOwnProperty.call(globalObject, "__PIXELAID_TELEMETRY_CONFIG__")
    ? globalObject.__PIXELAID_TELEMETRY_CONFIG__
    : typeof __PIXELAID_TELEMETRY_CONFIG__ === "undefined"
      ? undefined
      : __PIXELAID_TELEMETRY_CONFIG__;
  return isTelemetryConfig(config) ? config : defaultTelemetryConfig;
}
