import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, "public");
const distDir = path.join(projectRoot, "dist");
const manifestPath = path.join(publicDir, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error("public/manifest.json is required before copying static assets");
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
fs.cpSync(publicDir, distDir, { recursive: true });

for (const name of ["content", "background"]) {
  const generatedPath = path.join(distDir, `${name}.global.js`);
  const finalPath = path.join(distDir, `${name}.js`);

  if (fs.existsSync(generatedPath)) {
    fs.renameSync(generatedPath, finalPath);
  }

  if (!fs.existsSync(finalPath)) {
    console.error(`dist/${name}.js is required after bundling`);
    process.exit(1);
  }
}
