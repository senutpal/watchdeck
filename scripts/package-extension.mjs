import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, "dist");
const manifestPath = path.join(distDir, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error("dist/manifest.json missing — run `npm run build` first");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = manifest.version;
const name = (manifest.name || "extension").toLowerCase().replace(/[^a-z0-9]+/g, "-");
const zipPath = path.join(projectRoot, `${name}-${version}.zip`);

function listFilesRecursive(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else if (entry.isFile()) {
      out.push({ full, rel: path.relative(base, full).split(path.sep).join("/") });
    }
  }
  return out;
}

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  return ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
}

function dosDate(date) {
  return (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
}

function buildZip(files) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  const now = new Date();
  const time = dosTime(now);
  const date = dosDate(now);

  for (const f of files) {
    const data = fs.readFileSync(f.full);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = compressed.length < data.length;
    const stored = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);
    const nameBuf = Buffer.from(f.rel, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, nameBuf, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuf);

    offset += local.length + nameBuf.length + stored.length;
  }

  const centralBuf = Buffer.concat(centralChunks);
  const localBuf = Buffer.concat(localChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, eocd]);
}

const files = listFilesRecursive(distDir).sort((a, b) => a.rel.localeCompare(b.rel));
const zipBuf = buildZip(files);
fs.writeFileSync(zipPath, zipBuf);

const sizeKb = (zipBuf.length / 1024).toFixed(1);
console.log(`packaged ${files.length} files into ${path.relative(projectRoot, zipPath)} (${sizeKb} KB)`);
console.log("upload this ZIP to https://chrome.google.com/webstore/devconsole");
