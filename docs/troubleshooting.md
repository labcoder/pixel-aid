# Troubleshooting

## Diagnostics

PixelAid keeps source assets immutable during import, fix, and export operations. Failed operations should leave the imported source available so you can adjust settings and retry.

Use **Diagnostics** in the Console panel to export a sanitized JSON report. The report includes app version, route, recent logs, current settings, asset dimensions, fix metrics, warnings, and the last recoverable operation error.

Diagnostic reports redact likely API keys, bearer tokens, passwords, secrets, and prompt-like fields before export. Review the file before sharing it if your workflow includes private filenames or project-specific metadata.

## Common Recovery Paths

If import fails, confirm the file is a readable image format and try importing again.

If Auto Suggest fails, select the asset again or re-import it before rerunning analysis.

If Fix fails, try Auto Suggest, lower the target size or palette budget, or disable advanced cleanup options before retrying.

If **Robust requested -> Classic used** appears, Fix succeeded. Guarded safety rejected the Robust geometry and returned the stable Classic reconstruction. Review the reason codes, native dimensions, and output canvas; use manual Native W/H when you know the correct size.

If Robust changes the subject shape or aspect unexpectedly, do not compensate with the output canvas. Switch reconstruction to Classic or provide manual native dimensions. Output canvas, framing, and anchor package the reconstruction but should not repair incorrect native geometry.

If Robust is unavailable, confirm the asset is a single sprite, icon, or a background with full-canvas reconstruction. Sheets, tiles, portraits, and UI assets intentionally remain on Classic during the preview.

Warn and Raw are diagnostic modes. Return to Guarded before routine export unless you have reviewed the proposed geometry manually.

If export fails, run Fix again or export with a different destination/name. In the web app, the fixed preview remains available after an export failure.

If the editor shows the recovery screen, reload PixelAid and re-import the source asset. Use the recovery screen's diagnostics button before reloading if you want a crash report.
