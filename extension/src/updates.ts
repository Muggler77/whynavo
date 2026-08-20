import { APP_VERSION, DATA_SCHEMA_VERSION, MIN_SUPPORTED_APP_VERSION, UPDATE_CHECK_URL, UPDATE_TARGET_URL } from "./version";

export type UpdateSeverity = "normal" | "important" | "critical";

export type VersionManifest = {
  latestVersion: string;
  minimumSupportedVersion: string;
  dataSchemaVersion: number;
  severity?: UpdateSeverity;
  releaseNotesUrl?: string;
  updateUrl?: string;
};

export type UpdateCheckResult =
  | { status: "idle"; checkedAt?: string }
  | { status: "checking"; checkedAt?: string }
  | { status: "current"; manifest: VersionManifest; checkedAt: string }
  | { status: "available"; manifest: VersionManifest; checkedAt: string; critical: boolean }
  | { status: "unsupported"; manifest: VersionManifest; checkedAt: string }
  | { status: "error"; message: string; checkedAt: string };

type ChromeUpdateRuntime = {
  id?: string;
  requestUpdateCheck?: () => Promise<{ status: string; version?: string }>;
  onUpdateAvailable?: {
    addListener: (listener: (details: { version?: string }) => void) => void;
    removeListener?: (listener: (details: { version?: string }) => void) => void;
  };
  reload?: () => void;
};

export type ChromeWebStoreUpdateResult =
  | { status: "unavailable" }
  | { status: "no_update"; checkedAt: string }
  | { status: "update_available"; checkedAt: string; version?: string }
  | { status: "update_ready"; checkedAt: string; version?: string }
  | { status: "throttled"; checkedAt: string }
  | { status: "error"; checkedAt: string; message: string };

export type ChromeWebStoreUpdateState = ChromeWebStoreUpdateResult
  | { status: "idle" }
  | { status: "checking" }
  | { status: "installing"; version?: string };

const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;
export const CHROME_WEB_STORE_EXTENSION_ID = "paepohbilpilnaaobeeadkjbobkldhke";
export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/${CHROME_WEB_STORE_EXTENSION_ID}`;
const UPDATE_READY_TIMEOUT_MS = 15_000;
const UPDATE_SEVERITIES = new Set<UpdateSeverity>(["normal", "important", "critical"]);
const MAX_UPDATE_MANIFEST_BYTES = 64 * 1024;
const requestTimeout = (milliseconds: number) => {
  if (typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(milliseconds), cancel: () => undefined };
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), milliseconds);
  return {
    signal: controller.signal,
    cancel: () => window.clearTimeout(timer)
  };
};
const trustedReleaseUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    const basePath = "/Muggler77/whynavo/releases/";
    if (
      url.protocol !== "https:"
      || url.hostname !== "github.com"
      || !url.pathname.startsWith(basePath)
      || url.username
      || url.password
    ) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
};

const currentChromeRuntime = (): ChromeUpdateRuntime | undefined => (
  typeof chrome === "undefined" ? undefined : chrome.runtime
);

const currentProtocol = () => (typeof location === "undefined" ? "" : location.protocol);

export function isChromeWebStoreInstall(
  runtime: ChromeUpdateRuntime | undefined = currentChromeRuntime(),
  protocol = currentProtocol()
) {
  return protocol === "chrome-extension:"
    && runtime?.id === CHROME_WEB_STORE_EXTENSION_ID
    && typeof runtime.requestUpdateCheck === "function";
}

export async function requestChromeWebStoreUpdate(
  runtime: ChromeUpdateRuntime | undefined = currentChromeRuntime(),
  protocol = currentProtocol(),
  readyTimeoutMs = UPDATE_READY_TIMEOUT_MS
): Promise<ChromeWebStoreUpdateResult> {
  if (!isChromeWebStoreInstall(runtime, protocol) || !runtime?.requestUpdateCheck) {
    return { status: "unavailable" };
  }
  const checkedAt = new Date().toISOString();
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let readyListener: ((details: { version?: string }) => void) | undefined;
  const updateReady = runtime.onUpdateAvailable
    ? new Promise<string | undefined>((resolve) => {
        let settled = false;
        const finish = (version?: string) => {
          if (settled) return;
          settled = true;
          if (readyTimer !== undefined) clearTimeout(readyTimer);
          resolve(version);
        };
        readyListener = (details) => finish(details.version);
        runtime.onUpdateAvailable?.addListener(readyListener);
        readyTimer = setTimeout(() => finish(), Math.max(0, readyTimeoutMs));
      })
    : undefined;
  try {
    const result = await runtime.requestUpdateCheck();
    if (result.status === "no_update" || result.status === "throttled") {
      return { status: result.status, checkedAt };
    }
    if (result.status === "update_available") {
      const version = RELEASE_VERSION.test(String(result.version || "")) ? result.version : undefined;
      const readyVersion = updateReady ? await updateReady : undefined;
      return readyVersion !== undefined
        ? { status: "update_ready", checkedAt, version: RELEASE_VERSION.test(readyVersion) ? readyVersion : version }
        : { status: "update_available", checkedAt, version };
    }
    return { status: "error", checkedAt, message: "Chrome 返回了未知的更新状态" };
  } catch (error) {
    return {
      status: "error",
      checkedAt,
      message: error instanceof Error ? error.message : "Chrome 暂时无法检查商店更新"
    };
  } finally {
    if (readyTimer !== undefined) clearTimeout(readyTimer);
    if (readyListener && runtime.onUpdateAvailable?.removeListener) {
      runtime.onUpdateAvailable.removeListener(readyListener);
    }
  }
}

export function reloadChromeWebStoreExtension(
  runtime: ChromeUpdateRuntime | undefined = currentChromeRuntime(),
  protocol = currentProtocol()
) {
  if (!isChromeWebStoreInstall(runtime, protocol) || typeof runtime?.reload !== "function") return false;
  runtime.reload();
  return true;
}

export function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

const normalizeManifest = (value: unknown): VersionManifest => {
  const manifest = value as Partial<VersionManifest>;
  if (
    !manifest
    || typeof manifest !== "object"
    || !RELEASE_VERSION.test(String(manifest.latestVersion || ""))
    || !RELEASE_VERSION.test(String(manifest.minimumSupportedVersion || ""))
    || (
      manifest.dataSchemaVersion !== undefined
      && (
        !Number.isSafeInteger(manifest.dataSchemaVersion)
        || manifest.dataSchemaVersion < 1
        || manifest.dataSchemaVersion > 1000
      )
    )
    || (manifest.severity !== undefined && !UPDATE_SEVERITIES.has(manifest.severity))
  ) {
    throw new Error("版本清单格式不正确");
  }
  const releaseNotesUrl = trustedReleaseUrl(manifest.releaseNotesUrl);
  const updateUrl = trustedReleaseUrl(manifest.updateUrl);
  return {
    latestVersion: manifest.latestVersion as string,
    minimumSupportedVersion: manifest.minimumSupportedVersion as string,
    dataSchemaVersion: manifest.dataSchemaVersion ?? DATA_SCHEMA_VERSION,
    severity: manifest.severity || "normal",
    releaseNotesUrl,
    updateUrl: updateUrl || releaseNotesUrl || UPDATE_TARGET_URL
  };
};

export async function checkForUpdate(fetcher: typeof fetch = fetch): Promise<UpdateCheckResult> {
  const checkedAt = new Date().toISOString();
  const timeout = requestTimeout(10_000);
  try {
    const response = await fetcher(UPDATE_CHECK_URL, {
      cache: "no-store",
      signal: timeout.signal
    });
    if (!response.ok) throw new Error(`版本检查失败：${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_UPDATE_MANIFEST_BYTES) throw new Error("版本清单响应过大");
    const responseText = await response.text();
    if (new TextEncoder().encode(responseText).byteLength > MAX_UPDATE_MANIFEST_BYTES) {
      throw new Error("版本清单响应过大");
    }
    const manifest = normalizeManifest(JSON.parse(responseText));
    if (compareVersions(APP_VERSION, manifest.minimumSupportedVersion || MIN_SUPPORTED_APP_VERSION) < 0) {
      return { status: "unsupported", manifest, checkedAt };
    }
    if (compareVersions(APP_VERSION, manifest.latestVersion) < 0) {
      return {
        status: "available",
        manifest,
        checkedAt,
        critical: manifest.severity === "critical" || manifest.dataSchemaVersion > DATA_SCHEMA_VERSION
      };
    }
    return { status: "current", manifest, checkedAt };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "无法检查更新", checkedAt };
  } finally {
    timeout.cancel();
  }
}
