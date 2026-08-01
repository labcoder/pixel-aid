# Web Release Artifacts

PixelAid can produce browser-ready zip artifacts from the Vite editor build. These packages do not publish anything; they only create local files under the ignored `artifacts/web/` directory.

## Commands

```sh
npm run web:package:itch
npm run web:package:standalone
```

Both commands run the web production build with relative asset paths so the output can be moved between static hosts. The generated files are:

```txt
artifacts/web/PixelAid-<version>-web-itch.zip
artifacts/web/PixelAid-<version>-web-standalone.zip
```

## Package Shape

Each zip contains the built web app at the archive root:

```txt
index.html
assets/
brand/
icons/
LICENSE
NOTICE
LICENSES.md
THIRD_PARTY_NOTICES.md
RELEASE_NOTES.md
README.txt
```

The itch package is intended for an HTML5 project upload, where `index.html` must be at the zip root. The standalone package is intended for static hosting and can be uploaded to any host that serves the extracted files as a static site.

## Local Verification

After packaging, inspect the zip and confirm `index.html` is at the root:

```sh
tar -tf artifacts/web/PixelAid-<version>-web-itch.zip
tar -tf artifacts/web/PixelAid-<version>-web-standalone.zip
```

For a browser smoke test, run:

```sh
npm run build -w @pixelaid/web
npm run preview -w @pixelaid/web
```

Then import an image, run a fix, and export a bundle.
