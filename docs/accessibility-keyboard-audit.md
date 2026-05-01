# Accessibility And Keyboard Workflow Audit

MIG-52 audit date: 2026-05-01

PixelAid is an editor with several canvas-heavy surfaces. The launch target is keyboard-operable core workflows, named controls for assistive technology, visible focus, and clear documentation for places where canvas interactions still need follow-up alternatives.

## Keyboard Shortcuts

Global shortcuts do not run while focus is inside text fields, number fields, range controls, selects, textareas, or editable content.

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+O` | Open image import |
| `Ctrl/Cmd+Enter` | Run Fix when an asset is selected |
| `Ctrl/Cmd+Shift+E` | Export the fixed bundle |
| `G` | Toggle the viewport grid |
| `Space` | Play or pause timeline playback |
| `ArrowLeft` / `ArrowRight` | Step the timeline frame selection |
| `Ctrl/Cmd+Z` | Undo frame layout edits |
| `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` | Redo frame layout edits |
| Bottom panel separator: `ArrowUp`, `ArrowDown`, `Home`, `End` | Resize the bottom panel |

## Toolbar

The primary toolbar exposes Import, Fix, Cancel, and Export as native buttons. Import, Fix, and Export include shortcut metadata and browser-visible titles. Disabled states match processing availability so keyboard users cannot start conflicting import, analysis, fix, or export operations.

Manual QA:

- Tab to the toolbar from the top of the page.
- Confirm Import is reachable and opens the picker with `Ctrl/Cmd+O`.
- Confirm Fix is disabled until an asset exists, then starts with `Ctrl/Cmd+Enter`.
- Confirm Export is disabled until a fixed result exists, then starts with `Ctrl/Cmd+Shift+E`.
- Confirm focus remains visible on every toolbar button.

## Asset Browser

The asset browser uses separate buttons for selecting and removing an asset, avoiding nested interactive controls. Imported assets expose their source filename and dimensions in visible text, and remove buttons have asset-specific accessible names.

Manual QA:

- Import at least two assets.
- Tab through each asset select button and each remove button.
- Confirm the active asset is visually distinct.
- Confirm removing an asset chooses a sensible next selection or leaves the browser empty.

## Viewport Controls

Viewport mode controls are native buttons with pressed state. The grid can be toggled from the inspector checkbox or with `G`. The canvas remains the primary visual surface for pan, zoom, frame overlays, rulers, crop previews, and split comparison.

Manual QA:

- Use Tab to reach Input, Compare/Timeline, and Output view buttons.
- Confirm focus is visible and the selected view has a pressed state.
- Press `G` outside form fields and confirm the grid readout changes.
- Confirm `G` typed inside a text input does not toggle the grid.

Remaining limitations:

- Canvas-drawn pixels, frame boxes, rulers, crop guides, and diagnostic overlays are not individually exposed as semantic objects.
- Pointer-first interactions such as pan, wheel zoom, split divider dragging, and direct canvas frame-box resize still need equivalent command controls or a structured object list.
- Screen reader users must rely on surrounding readouts, inspector fields, timeline lists, and export metadata rather than direct canvas inspection.

## Inspector

Inspector groups are native `details` sections with keyboard-focusable summaries. Reorder, docs/help, color, numeric, select, and toggle controls are native form controls or buttons. Icon-only reorder/help actions have accessible names.

Manual QA:

- Tab through each inspector group summary and confirm it can be expanded/collapsed with keyboard input.
- Confirm group reorder buttons announce which group moves up or down.
- Confirm range controls, number controls, palette controls, and export target checkboxes retain visible focus.
- Confirm shortcut keys do not fire while editing inspector fields.

## Timeline And Player

The sprite player uses native controls for clip selection, stepping, play/pause, scrubbing, FPS, direction, duration, loop, normalization, and onion skin. Previous/next frame and play/pause expose shortcut metadata. Timeline rail frames are buttons with frame-specific accessible names.

Manual QA:

- Select a sheet-like asset with frames.
- Tab to Play, Previous, Next, Scrub, FPS, Direction, and Duration controls.
- Press Space outside fields and confirm playback toggles.
- Press ArrowLeft/ArrowRight outside fields and confirm selected frame changes.
- Confirm the same keys inside fields edit the field instead of triggering global playback shortcuts.
- Tab through timeline rail frames and confirm each focused frame is visible and selectable.

Remaining limitations:

- The animated timeline viewport is rendered to canvas and does not expose per-pixel or per-frame visual state beyond the surrounding controls and readouts.
- Onion-skin and pivot markers are visual-only overlays. Their numeric state is available in adjacent metadata fields, but the overlay geometry is not yet independently navigable.

## Dialogs And Export Flows

Browser import and export use platform file picker/download behavior. Desktop import/export routes through Tauri dialogs when running in the desktop shell. Palette import still uses prompt-based text entry, which is usable but should become an in-app dialog with initial focus, escape handling, and return-focus behavior.

Manual QA:

- Trigger import from the toolbar and shortcut.
- Cancel the picker and confirm the app remains responsive.
- Export a fixed asset and confirm the validation summary appears in the Export inspector and logs.
- Check that import, analysis, fix, and export status messages use visible text and live status regions where practical.

Remaining limitations:

- Native file picker accessibility depends on the host browser or desktop shell.
- Prompt-based palette naming/import is not ideal for a polished assistive technology workflow.
- There is no central modal focus trap yet because the launch UI mostly avoids custom modal dialogs.

## Focus And Visual State

Interactive controls use a visible amber focus ring. The bottom resize separator is keyboard focusable and exposes min, max, and current height. Canvas surfaces that can receive focus keep an inset focus outline so it is not clipped by the viewport.

Manual QA:

- Navigate the full editor with Tab and Shift+Tab.
- Confirm no focused element is hidden behind panels or lacks a visible focus indicator.
- Confirm disabled controls are skipped or announced disabled according to native browser behavior.
- Confirm the bottom panel separator resizes with ArrowUp, ArrowDown, Home, and End.

## Release Follow-Ups

- Add a non-canvas frame/object list for source frame boxes, pivots, crop bounds, collision boxes, and diagnostic overlays.
- Add keyboard commands for viewport zoom, pan, fit, and split divider movement.
- Replace prompt-based palette import/name flows with in-app dialogs that manage initial focus, escape, submit, and return focus.
- Add automated browser-level accessibility checks once the app has a stable UI test harness.
- Provide screen-reader-oriented summaries for grid candidates, quality findings, export validation, and timeline playback state.
