import { describe, expect, test } from "vitest";
import { createTelemetryBuildConfig, getTelemetryConfig } from "./telemetryConfig";

describe("telemetry config", () => {
  test("keeps telemetry disabled without an explicit enabled flag and project key", () => {
    expect(createTelemetryBuildConfig({})).toEqual({
      enabled: false,
      provider: "none",
      posthogHost: "",
      posthogProjectKey: "",
      buildChannel: "dev",
      distribution: "web_dev"
    });
  });

  test("creates a PostHog config from clean env names", () => {
    expect(
      createTelemetryBuildConfig({
        TELEMETRY_ENABLED: "1",
        TELEMETRY_PROVIDER: "posthog",
        TELEMETRY_POSTHOG_PROJECT_KEY: "phc_test",
        TELEMETRY_POSTHOG_HOST: "https://us.i.posthog.com/",
        TELEMETRY_BUILD_CHANNEL: "release",
        TELEMETRY_DISTRIBUTION: "web_itch"
      })
    ).toEqual({
      enabled: true,
      provider: "posthog",
      posthogHost: "https://us.i.posthog.com",
      posthogProjectKey: "phc_test",
      buildChannel: "release",
      distribution: "web_itch"
    });
  });

  test("normalizes missing provider to none when enabled data is incomplete", () => {
    expect(
      createTelemetryBuildConfig({
        TELEMETRY_ENABLED: "true",
        TELEMETRY_PROVIDER: "posthog",
        TELEMETRY_POSTHOG_HOST: "https://us.i.posthog.com"
      }).provider
    ).toBe("none");
  });

  test("reads the config injected by the build", () => {
    expect(
      getTelemetryConfig({
        __PIXELAID_TELEMETRY_CONFIG__: {
          enabled: true,
          provider: "posthog",
          posthogHost: "https://us.i.posthog.com",
          posthogProjectKey: "phc_test",
          buildChannel: "release",
          distribution: "desktop_windows_portable"
        }
      })
    ).toEqual({
      enabled: true,
      provider: "posthog",
      posthogHost: "https://us.i.posthog.com",
      posthogProjectKey: "phc_test",
      buildChannel: "release",
      distribution: "desktop_windows_portable"
    });
  });
});
