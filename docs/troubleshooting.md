# Troubleshooting

## Diagnostics

PixelAid keeps source assets immutable during import, fix, and export operations. Failed operations should leave the imported source available so you can adjust settings and retry.

Use **Diagnostics** in the Console panel to export a sanitized JSON report. The report includes app version, route, recent logs, current settings, asset dimensions, fix metrics, warnings, and the last recoverable operation error.

Diagnostic reports redact likely API keys, bearer tokens, passwords, secrets, and prompt-like fields before export. Review the file before sharing it if your workflow includes private filenames or project-specific metadata.

## Common Recovery Paths

If import fails, confirm the file is a readable image format and try importing again.

If Auto Suggest fails, select the asset again or re-import it before rerunning analysis.

If Fix fails, try Auto Suggest, lower the target size or palette budget, or disable advanced cleanup options before retrying.

If export fails, run Fix again or export with a different destination/name. In the web app, the fixed preview remains available after an export failure.

If the editor shows the recovery screen, reload PixelAid and re-import the source asset. Use the recovery screen's diagnostics button before reloading if you want a crash report.
