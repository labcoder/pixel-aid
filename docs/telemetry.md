# Telemetry

PixelAid telemetry is opt-in and disabled by default. The app can send curated anonymous usage and reliability events after two conditions are true:

1. The build has telemetry configured.
2. The user enables telemetry in `File -> Privacy & Telemetry`.

Telemetry does not use autocapture, session replay, persisted user identity, filenames, file paths, image data, prompts, or stack traces.

## Local Configuration

Put real values in the ignored repo-root `.env` file:

```sh
TELEMETRY_PROVIDER=posthog
TELEMETRY_POSTHOG_PROJECT_KEY=phc_your_project_key
TELEMETRY_POSTHOG_HOST=https://us.i.posthog.com
TELEMETRY_ENABLED=0
```

Use `TELEMETRY_ENABLED=1` only when intentionally testing telemetry or building a release that should offer opt-in telemetry. The PostHog project key is client-side configuration, but it should still not be printed in logs.

Optional labels:

```sh
TELEMETRY_BUILD_CHANNEL=release
TELEMETRY_DISTRIBUTION=web_standalone
```

Known distribution values:

```txt
web_dev
web_itch
web_standalone
desktop_windows_portable
desktop_macos_app
```

## Initial Events

The first telemetry milestone sends only:

```txt
app_startup
app_ready
about_opened
telemetry_opt_in_changed
```

Every event includes app version, runtime, platform, build channel, distribution, an ephemeral per-launch `session_run_id`, and telemetry schema version. The run id is not persisted between launches.

## Release Behavior

Local development builds should keep telemetry disabled unless explicitly testing. Release workflows can provide telemetry env values during the build. Users still need to opt in inside the app before network telemetry is sent.
