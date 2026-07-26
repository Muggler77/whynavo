import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const imagePaths = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" }
)
  .split("\0")
  .filter((path) => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(path));

const findings = [];

function inspectJpeg(path, input) {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    findings.push(`${path}: invalid JPEG`);
    return;
  }
  let offset = 2;
  while (offset < input.length) {
    if (input[offset] !== 0xff) {
      findings.push(`${path}: invalid JPEG marker`);
      return;
    }
    while (input[offset] === 0xff) offset += 1;
    const marker = input[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > input.length) {
      findings.push(`${path}: truncated JPEG segment`);
      return;
    }
    const segmentLength = input.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > input.length) {
      findings.push(`${path}: invalid JPEG segment`);
      return;
    }
    if (marker === 0xe1) findings.push(`${path}: EXIF or XMP metadata`);
    if (marker === 0xed) findings.push(`${path}: Photoshop or IPTC metadata`);
    if (marker === 0xfe) findings.push(`${path}: JPEG comment metadata`);
    offset = segmentEnd;
  }
}

function inspectPng(path, input) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (input.length < 12 || !input.subarray(0, 8).equals(signature)) {
    findings.push(`${path}: invalid PNG`);
    return;
  }
  const metadataChunks = new Set(["eXIf", "iTXt", "tEXt", "tIME", "zTXt"]);
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + 12 + length;
    if (end > input.length) {
      findings.push(`${path}: truncated PNG chunk`);
      return;
    }
    if (metadataChunks.has(type)) findings.push(`${path}: PNG ${type} metadata`);
    offset = end;
    if (type === "IEND") return;
  }
  findings.push(`${path}: missing PNG end chunk`);
}

function inspectWebp(path, input) {
  if (
    input.length < 12
    || input.subarray(0, 4).toString("ascii") !== "RIFF"
    || input.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    findings.push(`${path}: invalid WebP`);
    return;
  }
  let offset = 12;
  while (offset + 8 <= input.length) {
    const type = input.subarray(offset, offset + 4).toString("ascii");
    const length = input.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (end > input.length) {
      findings.push(`${path}: truncated WebP chunk`);
      return;
    }
    if (type === "EXIF" || type === "XMP ") findings.push(`${path}: WebP ${type.trim()} metadata`);
    offset = end;
  }
}

function inspectGif(path, input) {
  const signature = input.subarray(0, 6).toString("ascii");
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    findings.push(`${path}: invalid GIF`);
    return;
  }
  for (let index = 0; index + 1 < input.length; index += 1) {
    if (input[index] === 0x21 && input[index + 1] === 0xfe) {
      findings.push(`${path}: GIF comment metadata`);
      return;
    }
  }
}

for (const path of imagePaths) {
  const input = await readFile(path);
  const extension = extname(path).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") inspectJpeg(path, input);
  if (extension === ".png") inspectPng(path, input);
  if (extension === ".webp") inspectWebp(path, input);
  if (extension === ".gif") inspectGif(path, input);
  if (extension === ".avif") findings.push(`${path}: AVIF metadata requires explicit review`);
}

assert.deepEqual(findings, [], `public image metadata findings:\n${findings.join("\n")}`);
console.log(`Public image metadata check passed for ${imagePaths.length} tracked raster images.`);
