import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const SOURCE = path.join(projectRoot, "assets", "branding", "watchdeck-logo.png");
const OUT_DIR = path.join(projectRoot, "public", "icons");
const SIZES = [16, 32, 48, 128];
const ALPHA_THRESHOLD = 96;
const PADDING_RATIO = 0;

if (!fs.existsSync(SOURCE)) {
  console.error(`source logo missing at ${path.relative(projectRoot, SOURCE)}`);
  console.error("place a square PNG (>= 128x128, transparent background recommended) at that path and re-run.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

if (process.platform !== "win32") {
  console.error("scripts/generate-icons.mjs uses Windows PowerShell + System.Drawing for resampling.");
  console.error("On non-Windows hosts, install ImageMagick and run:");
  for (const s of SIZES) {
    const out = path.join(OUT_DIR, `icon-${s}.png`);
    console.error(`  magick "${SOURCE}" -trim +repage -resize ${s}x${s} -strip "${out}"`);
  }
  process.exit(1);
}

const psSingle = (s) => "'" + s.replace(/'/g, "''") + "'";

const psBody = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
public class WdBBox {
  public static int[] Compute(byte[] data, int width, int height, int stride, int threshold) {
    int minX = width, maxX = -1, minY = height, maxY = -1;
    for (int y = 0; y < height; y++) {
      int row = y * stride;
      for (int x = 0; x < width; x++) {
        int a = data[row + x*4 + 3];
        if (a > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return new int[] { minX, minY, maxX, maxY };
  }
}
"@

$src = ${psSingle(SOURCE)}
$outDir = ${psSingle(OUT_DIR)}
$sizes = @(${SIZES.join(",")})
$threshold = ${ALPHA_THRESHOLD}
$paddingRatio = ${PADDING_RATIO}

$image = [System.Drawing.Image]::FromFile($src)
try {
  $w = $image.Width
  $h = $image.Height

  $rect = New-Object System.Drawing.Rectangle 0,0,$w,$h
  $locked = $image.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $stride = $locked.Stride
    $bytes = New-Object byte[] ($stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0, $bytes, 0, $bytes.Length)
  } finally {
    $image.UnlockBits($locked)
  }

  $bbox = [WdBBox]::Compute($bytes, $w, $h, $stride, $threshold)
  $minX = $bbox[0]; $minY = $bbox[1]; $maxX = $bbox[2]; $maxY = $bbox[3]
  if ($maxX -lt 0 -or $maxY -lt 0) {
    $minX = 0; $minY = 0; $maxX = $w - 1; $maxY = $h - 1
    Write-Host 'warn: source is fully transparent; using full canvas'
  }
  $cropW = $maxX - $minX + 1
  $cropH = $maxY - $minY + 1
  $side = [Math]::Max($cropW, $cropH)
  $pad = [int][Math]::Round($side * $paddingRatio)
  $side = $side + 2 * $pad
  $cx = ($minX + $maxX) / 2.0
  $cy = ($minY + $maxY) / 2.0
  $sx = [int][Math]::Round($cx - $side / 2.0)
  $sy = [int][Math]::Round($cy - $side / 2.0)
  if ($sx -lt 0) { $sx = 0 }
  if ($sy -lt 0) { $sy = 0 }
  if ($sx + $side -gt $w) { $side = $w - $sx }
  if ($sy + $side -gt $h) { $side = $h - $sy }

  Write-Host ("source " + $w + "x" + $h + ", bbox [" + $minX + "," + $minY + "-" + $maxX + "," + $maxY + "], crop " + $side + "x" + $side + " at (" + $sx + "," + $sy + ")")

  foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $destRect = New-Object System.Drawing.Rectangle 0,0,$s,$s
    $attrs = New-Object System.Drawing.Imaging.ImageAttributes
    $attrs.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $g.DrawImage($image, $destRect, $sx, $sy, $side, $side, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
    $g.Dispose()
    $out = Join-Path $outDir ("icon-" + $s + ".png")
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $bytesOut = (Get-Item $out).Length
    Write-Host ("wrote icons/icon-" + $s + ".png (" + $bytesOut + " bytes)")
  }
} finally {
  $image.Dispose()
}
`;

const result = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psBody],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error("icon resampling failed");
  process.exit(result.status ?? 1);
}
