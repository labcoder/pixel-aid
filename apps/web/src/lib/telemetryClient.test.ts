import { describe, expect, test } from "vitest";
import { createTelemetryClient } from "./telemetryClient";
import type { AppMetadata } from "./appMetadata";
import type { TelemetryConfig } from "./telemetryConfig";

const posthogConfig: TelemetryConfig = {
  enabled: true,
  provider: "posthog",
  posthogHost: "https://us.i.posthog.com",
  posthogProjectKey: "phc_test",
  buildChannel: "release",
  distribution: "web_standalone"
};

const appMetadata: AppMetadata = {
  name: "PixelAid",
  version: "1.2.3",
  runtime: "web",
  runtimeLabel: "Web",
  platform: "MacIntel",
  websiteUrl: "https://example.com"
};

describe("telemetry client", () => {
  test("does not send when build config is disabled", async () => {
    const calls: unknown[] = [];
    const client = createTelemetryClient({
      appMetadata,
      config: { ...posthogConfig, enabled: false },
      consent: true,
      fetcher: async (...args) => {
        calls.push(args);
        return new Response(null, { status: 200 });
      }
    });

    await client.capture("app_startup");

    expect(calls).toEqual([]);
  });

  test("does not send before user consent", async () => {
    const calls: unknown[] = [];
    const client = createTelemetryClient({
      appMetadata,
      config: posthogConfig,
      consent: false,
      fetcher: async (...args) => {
        calls.push(args);
        return new Response(null, { status: 200 });
      }
    });

    await client.capture("app_startup");

    expect(calls).toEqual([]);
  });

  test("sends curated PostHog payloads after consent", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const client = createTelemetryClient({
      appMetadata,
      config: posthogConfig,
      consent: true,
      sessionRunId: "run-1",
      fetcher: async (url, init) => {
        calls.push([String(url), init]);
        return new Response(null, { status: 200 });
      }
    });

    await client.capture("app_ready", { app_ready_ms: 42, unsafe_thing: undefined });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://us.i.posthog.com/capture/");
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      api_key: "phc_test",
      event: "app_ready",
      distinct_id: "run-1",
      properties: {
        $process_person_profile: false,
        app_name: "PixelAid",
        app_version: "1.2.3",
        runtime: "web",
        platform: "MacIntel",
        arch: "unknown",
        build_channel: "release",
        distribution: "web_standalone",
        session_run_id: "run-1",
        telemetry_schema: 1,
        app_ready_ms: 42
      }
    });
  });

  test("stops sending immediately after consent is disabled", async () => {
    const calls: unknown[] = [];
    const client = createTelemetryClient({
      appMetadata,
      config: posthogConfig,
      consent: true,
      fetcher: async (...args) => {
        calls.push(args);
        return new Response(null, { status: 200 });
      }
    });

    client.setConsent(false);
    await client.capture("app_startup");

    expect(calls).toEqual([]);
  });
});
