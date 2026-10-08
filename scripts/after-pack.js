// electron-builder's "extraResources" glob-matcher was silently dropping the
// .next/standalone/node_modules folder (the app launched, then instantly
// crashed with "Cannot find module 'next'" — the standalone server bundle
// was there but its own node_modules wasn't). A plain recursive filesystem
// copy in an afterPack hook sidesteps whatever glob/matcher quirk caused
// that, at the cost of being explicit about it here instead of declarative
// in package.json.
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const standaloneSrc = path.join(__dirname, "..", ".next", "standalone");
  const standaloneDest = path.join(context.appOutDir, "resources", "standalone");

  fs.rmSync(standaloneDest, { recursive: true, force: true });
  fs.cpSync(standaloneSrc, standaloneDest, { recursive: true });

  const serverJs = path.join(standaloneDest, "server.js");
  const nextPkg = path.join(standaloneDest, "node_modules", "next");
  const migrations = path.join(standaloneDest, "drizzle", "meta", "_journal.json");
  if (!fs.existsSync(serverJs) || !fs.existsSync(nextPkg) || !fs.existsSync(migrations)) {
    throw new Error(
      `afterPack: standalone copy looks incomplete (server.js: ${fs.existsSync(serverJs)}, node_modules/next: ${fs.existsSync(nextPkg)}, drizzle migrations: ${fs.existsSync(migrations)}) — the packaged app would fail to launch.`
    );
  }
  console.log(`afterPack: copied standalone server (with node_modules) into ${standaloneDest}`);
};
