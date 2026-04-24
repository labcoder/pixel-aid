---
name: license-compliance
description: Use when choosing, adding, updating, or reviewing dependencies; drafting repo license/NOTICE files; evaluating whether a package can be used in an open-source and commercially sold tool; or checking attribution obligations. Applies to npm, Rust, WASM, image-processing libraries, AI SDKs, desktop shells, and embedded assets. Do not use for ordinary coding tasks unless dependency or license risk is involved.
---

# License and Dependency Compliance Skill

## Mission

Protect the project’s ability to be open source, sold commercially, and used in commercial products while preserving the creator’s attribution requirements.

This is a review workflow, not legal advice. When the risk is material, flag that a lawyer should review the final license choice or dependency policy.

## Project licensing goal

The desired project posture is:

- Open source.
- Commercial use allowed.
- The maintainer can sell the tool.
- Commercial users/products must attribute the tool and maintainer.
- External dependencies must not block selling the app or offering alternate commercial terms.

Suggested project strategy:

- Public repo license: attribution-focused open-source license such as CPAL-1.0, or a more permissive license plus a strong NOTICE/trademark attribution policy if broad adoption is prioritized.
- Optional dual licensing: offer separate commercial terms for teams that need different obligations.
- Keep project branding and trademarks separate from source-code license rights.

## Dependency policy

Default acceptable dependency licenses:

- MIT.
- Apache-2.0.
- BSD-2-Clause.
- BSD-3-Clause.
- ISC.
- Zlib/libpng.

Review carefully before accepting:

- MPL-2.0.
- EPL.
- LGPL.
- Polyform variants.
- Commons Clause.
- Source-available but not open-source licenses.
- Dependencies with unclear license metadata.

Reject by default unless explicitly approved:

- GPL.
- AGPL.
- Strong copyleft dependencies linked into the app.
- Non-commercial licenses.
- No-derivatives licenses.
- Custom licenses with field-of-use restrictions.
- Assets/fonts/icons without redistribution rights.

Special caution:

- Some excellent image quantization or compression libraries may be GPL or commercially licensed. Do not add them without confirming whether the project can comply or buy a commercial license.
- Web, desktop, CLI, and WASM linkage can change license implications. Treat native/WASM dependencies as high-review items.

## Dependency review workflow

When adding or changing a dependency:

1. Identify the exact package name, version, and source repository.
2. Read the actual `LICENSE` file from the package/repo, not only npm metadata.
3. Check transitive dependencies if the package is substantial.
4. Confirm whether the package is used in browser, server, desktop, CLI, or build-only code.
5. Confirm whether it will be bundled into distributed artifacts.
6. Record the dependency and license in `THIRD_PARTY_NOTICES.md` or equivalent.
7. Flag any license requiring attribution, source disclosure, copyleft, patent terms, or commercial license.
8. Prefer smaller/permissive alternatives if functionality is not critical.

## Recommended dependency categories

Preferred defaults for this project:

- Vite/React/TypeScript for UI and build.
- Permissively licensed quantization library or in-house quantizer.
- Tauri for desktop if compatible with project needs.
- Three.js for the future 3D sandbox if its license remains suitable.
- Lightweight ZIP library with permissive license.

Avoid adding:

- Heavy UI frameworks that fight custom editor performance.
- GPL/AGPL image-processing libraries.
- Runtime packages whose only benefit is small helper functions.
- Libraries that force a second rendering model unless clearly needed.

## Notices and attribution

Maintain:

```txt
LICENSE
NOTICE or ATTRIBUTION.md
THIRD_PARTY_NOTICES.md
CONTRIBUTING.md
```

`THIRD_PARTY_NOTICES.md` should include:

- Package name.
- Version or version range.
- License.
- Copyright notice.
- Source URL.
- Whether it is runtime, build-time, optional, or dev-only.

Project attribution language should be short, clear, and easy for commercial users to satisfy. For example:

```txt
Built with [Tool Name] by [Maintainer Name].
```

Do not bury critical attribution terms only in marketing copy. Put them in the license/notice files and onboarding docs.

## Review checklist

Before approving a dependency or license change, verify:

- The dependency license allows commercial use.
- The dependency can be distributed in the web/desktop/CLI app.
- The dependency does not impose unwanted copyleft on the whole app.
- Attribution obligations are recorded.
- The dependency is actually necessary.
- There is no lighter in-house or permissive alternative.
- The project’s ability to sell the tool is not undermined.
- Any uncertainty is clearly documented for human/legal review.

## Suggested automation

Add scripts or CI checks later for:

- Listing dependency licenses.
- Failing on GPL/AGPL/non-commercial licenses unless allowlisted.
- Updating third-party notices.
- Checking Rust crate licenses if Tauri/Rust is used.
- Checking bundled fonts/icons/assets.

Keep an allowlist file such as:

```json
{
  "allowed": ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Zlib"],
  "review": ["MPL-2.0", "LGPL-2.1", "LGPL-3.0"],
  "blocked": ["GPL-2.0", "GPL-3.0", "AGPL-3.0", "CC-BY-NC", "CC-BY-ND"]
}
```
