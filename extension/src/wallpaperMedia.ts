import type { CustomWallpaper } from "./types";

export const MAX_VIDEO_WALLPAPER_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_WALLPAPER_DURATION_SECONDS = 120;
export const MAX_VIDEO_WALLPAPER_PIXELS = 3840 * 2160;
const MAX_VIDEO_WALLPAPER_DIMENSION = 4096;
const VIDEO_METADATA_TIMEOUT_MS = 15_000;

export const isVideoWallpaper = (wallpaper?: CustomWallpaper): wallpaper is CustomWallpaper & {
  kind: "video";
  posterDataUrl: string;
  mimeType: "video/mp4" | "video/webm";
} => Boolean(
  wallpaper?.kind === "video"
  && wallpaper.posterDataUrl
  && wallpaper.mimeType
);

export const videoWallpaperMimeType = (file: Pick<File, "name" | "type">) => {
  const declaredType = file.type.toLowerCase();
  if (declaredType === "video/mp4" || declaredType === "video/webm") return declaredType;
  if (!declaredType && /\.mp4$/i.test(file.name)) return "video/mp4";
  if (!declaredType && /\.webm$/i.test(file.name)) return "video/webm";
  return undefined;
};

export const isVideoWallpaperFile = (file: Pick<File, "name" | "type">) => Boolean(videoWallpaperMimeType(file));

type VideoWallpaperMessages = {
  unsupported: string;
  tooLarge: string;
  decodeFailed: string;
  tooLong: string;
  tooDetailed: string;
  storageFull: string;
};

const waitForEvent = (target: HTMLVideoElement, eventName: "loadedmetadata" | "seeked", timeoutMessage: string) => new Promise<void>((resolve, reject) => {
  const timeout = window.setTimeout(() => finish(() => reject(new Error(timeoutMessage))), VIDEO_METADATA_TIMEOUT_MS);
  const finish = (callback: () => void) => {
    window.clearTimeout(timeout);
    target.removeEventListener(eventName, onReady);
    target.removeEventListener("error", onError);
    callback();
  };
  const onReady = () => finish(resolve);
  const onError = () => finish(() => reject(new Error(timeoutMessage)));
  target.addEventListener(eventName, onReady, { once: true });
  target.addEventListener("error", onError, { once: true });
});

const capturePoster = (video: HTMLVideoElement) => {
  const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Unable to create video preview");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
};

export async function inspectVideoWallpaper(file: File, messages: VideoWallpaperMessages) {
  const mimeType = videoWallpaperMimeType(file);
  if (!mimeType) throw new Error(messages.unsupported);
  if (file.size > MAX_VIDEO_WALLPAPER_BYTES) throw new Error(messages.tooLarge);

  const storageEstimate = navigator.storage?.estimate
    ? await navigator.storage.estimate().catch(() => undefined)
    : undefined;
  if (
    storageEstimate?.quota !== undefined
    && storageEstimate.usage !== undefined
    && storageEstimate.quota - storageEstimate.usage < file.size + 24 * 1024 * 1024
  ) throw new Error(messages.storageFull);

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    await waitForEvent(video, "loadedmetadata", messages.decodeFailed);
    const durationSeconds = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !width || !height) throw new Error(messages.decodeFailed);
    if (durationSeconds > MAX_VIDEO_WALLPAPER_DURATION_SECONDS) throw new Error(messages.tooLong);
    if (
      width > MAX_VIDEO_WALLPAPER_DIMENSION
      || height > MAX_VIDEO_WALLPAPER_DIMENSION
      || width * height > MAX_VIDEO_WALLPAPER_PIXELS
    ) throw new Error(messages.tooDetailed);

    const seeked = waitForEvent(video, "seeked", messages.decodeFailed);
    video.currentTime = Math.min(Math.max(durationSeconds * 0.12, 0.05), Math.max(0.05, durationSeconds - 0.05));
    await seeked;
    return {
      posterDataUrl: capturePoster(video),
      mimeType,
      sizeBytes: file.size,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      width,
      height
    } as const;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
