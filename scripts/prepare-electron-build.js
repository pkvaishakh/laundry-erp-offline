// `next build` with output: "standalone" produces a self-contained server in
// .next/standalone, but (per Next's own docs) it does NOT copy the public/
// folder or .next/static assets into it automatically — the app would come
// up with no CSS/JS/images without this step. Run after `next build`, before
// packaging with electron-builder.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.error('.next/standalone not found — run "npm run build" first.');
  process.exit(1);
}

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standaloneDir, "public"), { recursive: true });
}
fs.cpSync(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"), { recursive: true });
// SQL migrations, read from disk by src/db/index.ts when the database opens.
fs.cpSync(path.join(root, "drizzle"), path.join(standaloneDir, "drizzle"), { recursive: true });

// The standalone server must never ship a database or old JSON store from
// this machine — the client's own data folder is the only source of data.
for (const stray of fs.readdirSync(standaloneDir)) {
  if (/\.(db|db-wal|db-shm)$/.test(stray) || stray === ".offline-data.json") {
    fs.rmSync(path.join(standaloneDir, stray), { force: true });
  }
}

console.log("Copied public/, .next/static/ and drizzle/ into .next/standalone for the Electron build.");
