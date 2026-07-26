import { chmod, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname } from "node:path";

const paths = process.argv.slice(2);
if (!paths.length) {
  throw new Error("Pass one or more public JPEG paths to sanitize");
}

const removableMarkers = new Set([
  0xe1, // EXIF and XMP
  0xed, // Photoshop and IPTC
  0xfe // JPEG comments
]);
const removablePngChunks = new Set(["eXIf", "iTXt", "tEXt", "tIME", "zTXt"]);

function sanitizeJpeg(input) {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new Error("invalid JPEG header");
  }

  const parts = [input.subarray(0, 2)];
  let offset = 2;
  while (offset < input.length) {
    const markerStart = offset;
    if (input[offset] !== 0xff) throw new Error("invalid JPEG marker");
    while (input[offset] === 0xff) offset += 1;
    const marker = input[offset];
    offset += 1;

    if (marker === 0xd9) {
      parts.push(input.subarray(markerStart, offset));
      break;
    }
    if (marker === 0xda) {
      parts.push(input.subarray(markerStart));
      offset = input.length;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > input.length) throw new Error("truncated JPEG segment");
    const segmentLength = input.readUInt16BE(offset);
    if (segmentLength < 2) throw new Error("invalid JPEG segment length");
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > input.length) throw new Error("truncated JPEG segment");
    if (!removableMarkers.has(marker)) parts.push(input.subarray(markerStart, segmentEnd));
    offset = segmentEnd;
  }

  if (offset !== input.length) throw new Error("trailing JPEG parser state");
  return Buffer.concat(parts);
}

function sanitizePng(input) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (input.length < 12 || !input.subarray(0, 8).equals(signature)) {
    throw new Error("invalid PNG header");
  }
  const parts = [input.subarray(0, 8)];
  let offset = 8;
  let ended = false;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + 12 + length;
    if (end > input.length) throw new Error("truncated PNG chunk");
    if (!removablePngChunks.has(type)) parts.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended || offset !== input.length) throw new Error("invalid PNG end chunk");
  return Buffer.concat(parts);
}

for (const path of paths) {
  const extension = extname(path).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(extension)) {
    throw new Error(`unsupported image format: ${path}`);
  }
  const original = await readFile(path);
  const sanitized = extension === ".png" ? sanitizePng(original) : sanitizeJpeg(original);
  if (sanitized.equals(original)) continue;
  const mode = (await stat(path)).mode;
  const temporaryPath = `${path}.sanitizing`;
  await writeFile(temporaryPath, sanitized, { mode });
  await rename(temporaryPath, path);
  await chmod(path, mode);
  console.log(`Sanitized metadata from ${path}`);
}
