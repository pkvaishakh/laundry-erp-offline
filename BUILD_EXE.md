Build a clean, new LaundryPro Windows .exe by following these steps exactly.
Stop and show me the error if any step fails.

1. Stop any `next dev` server or running LaundryPro app. They lock the build
   folders.

2. Run `node -v`. It must be v24 or newer.

3. Delete these old build folders completely, so nothing from an old build is
   reused:
   - the project's `.next` folder
   - `C:\laundrypro-dist`
   - everything inside the project's `release` folder (keep the folder itself)

4. Run `npm run typecheck`.

5. Run `npm run build:electron`.
   The output must end with "Copied public/, .next/static/ and drizzle/ into
   .next/standalone for the Electron build."

6. Run `npx electron-builder -c.directories.output="C:\laundrypro-dist"`.
   The output must contain "afterPack: copied standalone server (with
   node_modules) into ...". If that line is missing, the build is broken.

7. Copy ONLY these two files from `C:\laundrypro-dist` into `release`:
   - LaundryPro-Setup-<version>.exe
   - LaundryPro-Portable-<version>.exe
   Take <version> from "version" in package.json.

8. Check that `release` contains exactly those two .exe files and nothing
   else, both dated today.

9. Report the file names, sizes and build time of the two .exe files, plus any
   warnings from the build.

Rules:
- Don't use `npm run dist`.
- Don't change the version number unless I ask.
- Never delete anything in %APPDATA% (client and shop data lives there).
