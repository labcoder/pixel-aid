import type { AppMetadata } from "./appMetadata";
import type { TelemetryConfig } from "./telemetryConfig";
import type { TelemetryEventName, TelemetryProperties } from "./telemetryEvents";

type TelemetryFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type TelemetryClient = {
  capture: (event: TelemetryEventName, properties?: TelemetryProperties) => Promise<boolean>;
  isAvailable: () => boolean;
  hasConsent: () => boolean;
  setConsent: (consent: boolean) => void;
};

const telemetrySchemaVersion = 1;

function createSessionRunId(): string {
  const cryptoLike = globalThis.crypto;
  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDefaultFetcher(): TelemetryFetcher {
  return (input, init) => fetch(input, init);
}

function sanitizeProperties(properties: TelemetryProperties = {}): Record<string, boolean | number | string | null> {
  const sanitized: Record<string, boolean | number | string | null> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "boolean" || typeof value === "number" || typeof value === "string" || value === null) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function createSharedProperties({
  appMetadata,
  config,
  sessionRunId
}: {
  appMetadata: AppMetadata;
  config: TelemetryConfig;
  sessionRunId: string;
}): Record<string, boolean | number | string> {
  return {
    $process_person_profile: false,
    app_name: appMetadata.name,
    app_version: appMetadata.version,
    runtime: appMetadata.runtime,
    platform: appMetadata.platform,
    arch: "unknown",
    build_channel: config.buildChannel,
    distribution: config.distribution,
    session_run_id: sessionRunId,
    telemetry_schema: telemetrySchemaVersion
  };
}

export function createTelemetryClient({
  appMetadata,
  config,
  consent,
  fetcher = getDefaultFetcher(),
  sessionRunId = createSessionRunId()
}: {
  appMetadata: AppMetadata;
  config: TelemetryConfig;
  consent: boolean;
  fetcher?: TelemetryFetcher;
  sessionRunId?: string;
}): TelemetryClient {
  let hasUserConsent = consent;

  return {
    isAvailable() {
      return config.enabled && config.provider === "posthog";
    },
    hasConsent() {
      return hasUserConsent;
    },
    setConsent(nextConsent) {
      hasUserConsent = nextConsent;
    },
    async capture(event, properties = {}) {
      if (!this.isAvailable() || !hasUserConsent) {
        return false;
      }

      try {
        await fetcher(`${config.posthogHost}/capture/`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          keepalive: true,
          body: JSON.stringify({
            api_key: config.posthogProjectKey,
            event,
            distinct_id: sessionRunId,
            properties: {
              ...createSharedProperties({ appMetadata, config, sessionRunId }),
              ...sanitizeProperties(properties)
            }
          })
        });
        return true;
      } catch {
        return false;
      }
    }
  };
}
