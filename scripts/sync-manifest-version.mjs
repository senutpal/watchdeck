import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const pkgPath = path.join(projectRoot, "package.json");
const manifestPath = path.join(projectRoot, "public", "manifest.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (!pkg.version) {
  console.error("package.json has no version field");
  process.exit(1);
}

if (manifest.version === pkg.version) {
  console.log(`manifest.json already at ${pkg.version}; no change`);
  process.exit(0);
}

const previous = manifest.version;
manifest.version = pkg.version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`bumped public/manifest.json: ${previous} -> ${pkg.version}`);
