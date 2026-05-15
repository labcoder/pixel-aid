import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";
import { isDesktopRuntime } from "./desktopBridge";

export const PIXELAID_WEBSITE_URL = "https://oscarsanchez.com";

export type AppRuntime = "web" | "desktop";

export type AppMetadata = {
  name: string;
  version: string;
  runtime: AppRuntime;
  runtimeLabel: string;
  platform: string;
  websiteUrl: string;
};

type NavigatorLike = {
  platform?: unknown;
  userAgentData?: {
    platform?: unknown;
  };
};

export function formatRuntimeLabel(runtime: AppRuntime): string {
  return runtime === "desktop" ? "Desktop" : "Web";
}

function normalizePlatform(platform: unknown): string {
  return typeof platform === "string" && platform.trim().length > 0 ? platform.trim() : "Unknown platform";
}

function readNavigatorPlatform(navigatorLike: NavigatorLike | undefined): string {
  return normalizePlatform(navigatorLike?.userAgentData?.platform ?? navigatorLike?.platform);
}

export function createAppMetadata({
  version = PIXELAID_VERSION,
  desktopRuntime = isDesktopRuntime(),
  platform = readNavigatorPlatform(typeof navigator === "undefined" ? undefined : (navigator as NavigatorLike))
}: {
  version?: string;
  desktopRuntime?: boolean;
  platform?: string;
} = {}): AppMetadata {
  const runtime: AppRuntime = desktopRuntime ? "desktop" : "web";

  return {
    name: PIXELAID_APP_NAME,
    version,
    runtime,
    runtimeLabel: formatRuntimeLabel(runtime),
    platform: normalizePlatform(platform),
    websiteUrl: PIXELAID_WEBSITE_URL
  };
}
