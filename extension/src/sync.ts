import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL, LEGAL_DOCUMENT_VERSION } from "./projectConfig";
import { defaultWidgetSizes, nowIso, observeIsoTimestamp, uid } from "./defaultState";
import type { AppState, Countdown, Note, Settings, Shortcut, ShortcutFolder, ShortcutGroup, Todo, WidgetKey } from "./types";
import { compareVersions } from "./updates";
import { APP_VERSION, DATA_SCHEMA_VERSION, MIN_SUPPORTED_APP_VERSION } from "./version";

export { nowIso };

export type SyncStatus = {
  user?: User | null;
  message: string;
  syncing: boolean;
  lastSyncedAt?: string;
  autoSync?: boolean;
};

let supabaseModulePromise: Promise<typeof import("@supabase/supabase-js")> | undefined;
const clientPromises = new Map<string, Promise<SupabaseClient>>();
const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const PASSWORD_SAFETY_TIMEOUT_MS = 8_000;
const MAX_PWNED_PASSWORD_RESPONSE_CHARS = 256_000;

const sha1Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
};

export async function assertPasswordNotKnownLeaked(password: string) {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  let response: Response;
  try {
    response = await fetch(`${PWNED_PASSWORDS_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true" },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(PASSWORD_SAFETY_TIMEOUT_MS)
    });
  } catch {
    throw new Error("暂时无法完成密码泄露检查，请检查网络后重试");
  }
  if (!response.ok) throw new Error("暂时无法完成密码泄露检查，请稍后重试");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_PWNED_PASSWORD_RESPONSE_CHARS) {
    throw new Error("密码安全服务返回异常，请稍后重试");
  }
  const body = await response.text();
  if (body.length > MAX_PWNED_PASSWORD_RESPONSE_CHARS) {
    throw new Error("密码安全服务返回异常，请稍后重试");
  }
  const leaked = body.split(/\r?\n/).some((line) => {
    const [candidateSuffix, count] = line.split(":");
    return candidateSuffix === suffix && Number(count) > 0;
  });
  if (leaked) {
    throw new Error("此密码已出现在已知数据泄露中，请使用密码管理器生成新的唯一密码");
  }
}

export async function getSupabase(url?: string, anonKey?: string) {
  if (!url || !anonKey) return undefined;
  const key = `${url}::${anonKey}`;
  const existing = clientPromises.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const modulePromise = supabaseModulePromise || import("@supabase/supabase-js");
    supabaseModulePromise = modulePromise;
    try {
      const { createClient } = await modulePromise;
      return createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
    } catch (error) {
      if (supabaseModulePromise === modulePromise) supabaseModulePromise = undefined;
      clientPromises.delete(key);
      throw error;
    }
  })();
  clientPromises.set(key, pending);
  return pending;
}

async function getEphemeralSupabase(url: string, anonKey: string) {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export async function getUser(url?: string, anonKey?: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getCachedUser(url?: string, anonKey?: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user || null;
}

export function isTerminalAuthError(error: unknown) {
  const detail = error && typeof error === "object"
    ? error as { status?: unknown; code?: unknown; name?: unknown; message?: unknown }
    : {};
  const status = typeof detail.status === "number" ? detail.status : undefined;
  const code = String(detail.code || "").toLowerCase();
  const name = String(detail.name || "").toLowerCase();
  const message = String(detail.message || error || "").toLowerCase();
  if (status === 401 || status === 403) return true;
  if (name.includes("authsessionmissing")) return true;
  if ([
    "refresh_token_not_found",
    "refresh_token_already_used",
    "session_not_found",
    "user_not_found",
    "bad_jwt"
  ].includes(code)) return true;
  return [
    "auth session missing",
    "invalid refresh token",
    "refresh token not found",
    "session not found",
    "user not found",
    "jwt expired",
    "whynavo session revoked",
    "whynavo session expired",
    "whynavo session inactive"
  ].some((fragment) => message.includes(fragment));
}

export async function signIn(url: string, anonKey: string, email: string, password: string, captchaToken?: string) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const result = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined
  });
  if (result.error) throw result.error;
  let passwordSafetyWarning: string | undefined;
  try {
    await assertPasswordNotKnownLeaked(password);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    passwordSafetyWarning = message.includes("已出现在已知数据泄露")
      ? "登录成功，但当前密码已出现在已知数据泄露中，请立即在本页更换为唯一密码。"
      : "登录成功，但暂时无法完成泄露密码检查；请勿在其他网站复用此密码。";
  }
  return {
    user: result.data.user,
    passwordSafetyWarning
  };
}

export async function signUp(
  url: string,
  anonKey: string,
  email: string,
  password: string,
  emailRedirectTo?: string,
  captchaToken?: string
) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  await assertPasswordNotKnownLeaked(password);
  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      ...(captchaToken ? { captchaToken } : {}),
      data: {
        terms_version: LEGAL_DOCUMENT_VERSION,
        privacy_version: LEGAL_DOCUMENT_VERSION,
        consented_at: new Date().toISOString()
      }
    }
  });
  if (result.error) throw result.error;
  return result.data as { user: User | null; session: Session | null };
}

export async function resendSignupConfirmation(
  url: string,
  anonKey: string,
  email: string,
  emailRedirectTo?: string,
  captchaToken?: string
) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      ...(captchaToken ? { captchaToken } : {})
    }
  });
  if (error) throw error;
}

export async function signOut(url?: string, anonKey?: string) {
  let supabase: SupabaseClient | undefined;
  try {
    supabase = await getSupabase(url, anonKey);
    if (!supabase) {
      clearLocalAuthSession(url);
      return true;
    }
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    return true;
  } catch {
    clearLocalAuthSession(url);
    await supabase?.auth.signOut({ scope: "local" }).catch(() => undefined);
    return false;
  }
}

export async function signOutEverywhere(url?: string, anonKey?: string) {
  let supabase: SupabaseClient | undefined;
  try {
    supabase = await getSupabase(url, anonKey);
    if (!supabase) {
      clearLocalAuthSession(url);
      return true;
    }
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) throw error;
    return true;
  } catch {
    clearLocalAuthSession(url);
    await supabase?.auth.signOut({ scope: "local" }).catch(() => undefined);
    return false;
  }
}

function clearLocalAuthSession(url?: string) {
  if (!url || typeof localStorage === "undefined") return;
  try {
    const projectRef = new URL(url).hostname.split(".")[0];
    if (!/^[a-z0-9-]+$/i.test(projectRef)) return;
    const storageKey = `sb-${projectRef}-auth-token`;
    localStorage.removeItem(storageKey);
    localStorage.removeItem(`${storageKey}-code-verifier`);
  } catch {
    // The following local sign-out call remains the authoritative fallback.
  }
}

export async function requestPasswordReset(
  url: string,
  anonKey: string,
  email: string,
  redirectTo?: string,
  captchaToken?: string
) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("同步服务暂未配置，请稍后再试");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    ...(redirectTo ? { redirectTo } : {}),
    ...(captchaToken ? { captchaToken } : {})
  });
  if (error) throw error;
}

export async function updatePassword(
  url: string,
  anonKey: string,
  password: string,
  currentPassword?: string,
  captchaToken?: string
) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("同步服务暂未配置，请稍后再试");
  await assertPasswordNotKnownLeaked(password);
  let updateClient = supabase;
  let expectedUserId: string | undefined;
  let verificationClient: SupabaseClient | undefined;
  try {
    if (currentPassword) {
      if (!captchaToken) throw new Error("请先完成安全验证");
      const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser();
      if (currentUserError) throw currentUserError;
      if (!currentUserData.user?.email) throw new Error("当前账号没有可验证的邮箱");
      expectedUserId = currentUserData.user.id;
      verificationClient = await getEphemeralSupabase(url, anonKey);
      const { data: verificationData, error: verificationError } = await verificationClient.auth.signInWithPassword({
        email: currentUserData.user.email,
        password: currentPassword,
        options: { captchaToken }
      });
      if (verificationError) throw verificationError;
      if (verificationData.user?.id !== currentUserData.user.id) throw new AuthAccountChangedError();
      const { data: confirmedUserData, error: confirmedUserError } = await supabase.auth.getUser();
      if (confirmedUserError) throw confirmedUserError;
      if (confirmedUserData.user?.id !== currentUserData.user.id) throw new AuthAccountChangedError();
      updateClient = verificationClient;
    }
    const { data, error } = await updateClient.auth.updateUser({
      password,
      ...(currentPassword ? { current_password: currentPassword } : {})
    });
    if (error) throw error;
    if (expectedUserId && data.user?.id !== expectedUserId) throw new AuthAccountChangedError();
    if (expectedUserId) {
      const { data: confirmedUserData, error: confirmedUserError } = await supabase.auth.getUser();
      if (confirmedUserError) throw confirmedUserError;
      if (confirmedUserData.user?.id !== expectedUserId) throw new AuthAccountChangedError();
    }
  } finally {
    await verificationClient?.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}

export async function deleteAccount(
  url: string,
  anonKey: string,
  expectedUserId: string,
  password: string,
  captchaToken: string
) {
  const supabase = await getSupabase(url, anonKey);
  if (!supabase) throw new Error("同步服务暂未配置，请稍后再试");
  if (!expectedUserId) throw new AuthAccountChangedError();
  const { data, error } = await supabase.functions.invoke("delete-account", {
    method: "POST",
    body: { expectedUserId, password, captchaToken }
  });
  if (error) {
    const status = typeof (error as { context?: { status?: unknown } }).context?.status === "number"
      ? (error as { context: { status: number } }).context.status
      : undefined;
    if (status !== undefined && status >= 400 && status < 500) {
      throw new AccountDeletionRejectedError(error.message);
    }
    throw new AccountDeletionOutcomeUnknownError();
  }
  if (!data || typeof data !== "object" || (data as { deleted?: unknown }).deleted !== true) {
    throw new AccountDeletionOutcomeUnknownError();
  }
}

export class SyncConflictError extends Error {
  constructor() {
    super("云端数据刚刚发生变化，正在重新合并");
    this.name = "SyncConflictError";
  }
}

export class AuthAccountChangedError extends Error {
  constructor() {
    super("登录账号已变化，本次数据操作已取消");
    this.name = "AuthAccountChangedError";
  }
}

export class AccountDeletionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeletionRejectedError";
  }
}

export class AccountDeletionOutcomeUnknownError extends Error {
  constructor() {
    super("删除请求结果暂时无法确认，联网后会自动核验；在确认前请勿继续编辑此账号数据。");
    this.name = "AccountDeletionOutcomeUnknownError";
  }
}

const isLocalImage = (value?: string) => Boolean(value?.startsWith("data:") || value?.startsWith("blob:"));
const MAX_CLOUD_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_STATE_RECORDS_PER_COLLECTION = 5000;
const MAX_STATE_ID_LENGTH = 200;
const MAX_STATE_TEXT_LENGTH = 500_000;
const MAX_STATE_URL_LENGTH = 8192;
const MAX_REMOTE_IMAGE_URL_LENGTH = 8192;
const CLOUD_NEUTRAL_WEATHER_CITY = "Shanghai";
const WIDGET_KEYS = new Set<WidgetKey>([
  "weather",
  "calendar",
  "countdowns",
  "todos",
  "notes",
  "rates",
  "quote",
  "focus",
  "clock",
  "memo",
  "year",
  "calculator"
]);
const SETTINGS_KEYS = new Set([
  "theme",
  "wallpaper",
  "wallpaperPreset",
  "wallpaperRotation",
  "customWallpapers",
  "wallpaperCollection",
  "quickNote",
  "iconPresentation",
  "photoFrameImage",
  "photoFrameTitle",
  "dateTimeColor",
  "widgetAccentColor",
  "glass",
  "iconSize",
  "gridDensity",
  "dockPosition",
  "city",
  "weatherUseLocation",
  "searchEngine",
  "calendarRecords",
  "visualRefreshVersion",
  "widgets",
  "widgetOrder",
  "widgetSizes",
  "customNavPages",
  "hiddenNavPages",
  "navigationDisplay",
  "navigationSide",
  "remoteIconLookup",
  "timeZone",
  "supabaseUrl",
  "supabaseAnonKey",
  "fieldUpdatedAt",
  "updatedAt"
]);
const SETTINGS_METADATA_KEYS = new Set(["fieldUpdatedAt", "updatedAt"]);
const SETTINGS_VALUE_KEYS = new Set([...SETTINGS_KEYS].filter((key) => !SETTINGS_METADATA_KEYS.has(key)));
const CUSTOM_NAV_PAGE_ICONS = new Set(["star", "briefcase", "book", "code", "heart", "plane"]);

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasOnlyKeys = (value: UnknownRecord, allowed: ReadonlySet<string>) => (
  Object.keys(value).every((key) => allowed.has(key))
);
const validOptionalString = (value: unknown, maxLength = MAX_STATE_TEXT_LENGTH) => (
  value === undefined || (typeof value === "string" && value.length <= maxLength)
);
const validRequiredString = (value: unknown, maxLength = MAX_STATE_TEXT_LENGTH) => (
  typeof value === "string" && value.length <= maxLength
);
const validTimestamp = (value: unknown) => {
  if (typeof value !== "string" || value.length > 80) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && timestamp >= Date.UTC(2020, 0, 1)
    && timestamp <= Date.UTC(2100, 0, 1);
};
const validVersion = (value: unknown) => (
  value === undefined || (typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value))
);
const validDateKey = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const validOptionalTimestamp = (value: unknown) => value === undefined || validTimestamp(value);
const validOptionalNumber = (value: unknown) => value === undefined || (typeof value === "number" && Number.isFinite(value));
const validOptionalNumberInRange = (value: unknown, minimum: number, maximum: number) => (
  value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum)
);
const validOptionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";
const validTimeZone = (value: unknown) => {
  if (typeof value !== "string" || !value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
};
const validHttpUrl = (value: unknown) => {
  if (typeof value !== "string" || !value || value.length > MAX_STATE_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
};
const validColor = (value: unknown) => (
  typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)
);
const validOptionalColor = (value: unknown) => value === undefined || validColor(value);
const validRasterDataUrl = (value: unknown, maxLength = 4 * 1024 * 1024) => (
  typeof value === "string"
  && value.length <= maxLength
  && /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value)
);
const validImageReference = (value: unknown, maxLength = 4 * 1024 * 1024) => {
  if (value === undefined) return true;
  if (typeof value !== "string" || !value || value.length > maxLength) return false;
  if (/^whynavo-icon:[a-z0-9-]{1,80}$/i.test(value)) return true;
  if (validRasterDataUrl(value, maxLength)) return true;
  if (value.length > MAX_REMOTE_IMAGE_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
};
const normalizeStoredImageReference = (value: unknown, allowBuiltIn = false) => {
  if (typeof value !== "string" || !value || value.length > 4 * 1024 * 1024) return undefined;
  if (allowBuiltIn && /^whynavo-icon:[a-z0-9-]{1,80}$/i.test(value)) return value;
  if (validRasterDataUrl(value)) return value;
  if (value.length > MAX_REMOTE_IMAGE_URL_LENGTH) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const validateEntityArray = (
  value: unknown,
  fields: Record<string, "string" | "number" | "boolean">,
  optionalFields: string[] = [],
  optional = false
) => {
  if (optional && value === undefined) return true;
  if (!Array.isArray(value) || value.length > MAX_STATE_RECORDS_PER_COLLECTION) return false;
  const allowedKeys = new Set(["id", "updatedAt", "deletedAt", ...Object.keys(fields), ...optionalFields]);
  const seenIds = new Set<string>();
  return value.every((entry) => {
    if (
      !isRecord(entry)
      || !hasOnlyKeys(entry, allowedKeys)
      || !validRequiredString(entry.id, MAX_STATE_ID_LENGTH)
      || !(entry.id as string).length
      || seenIds.has(entry.id as string)
      || !validTimestamp(entry.updatedAt)
    ) return false;
    seenIds.add(entry.id as string);
    if (
      !validOptionalTimestamp(entry.deletedAt)
      || (optionalFields.includes("iconUrl") && !validImageReference(entry.iconUrl))
      || (optionalFields.includes("iconColor") && !validOptionalColor(entry.iconColor))
      || (optionalFields.includes("color") && !validOptionalColor(entry.color))
      || (optionalFields.includes("groupId") && !validOptionalString(entry.groupId, MAX_STATE_ID_LENGTH))
      || (optionalFields.includes("folderId") && !validOptionalString(entry.folderId, MAX_STATE_ID_LENGTH))
      || (optionalFields.includes("conflictBody") && !validOptionalString(entry.conflictBody))
    ) return false;
    return Object.entries(fields).every(([key, type]) => {
      const field = entry[key];
      if (type === "string") {
        if (key === "date") return validDateKey(field);
        if (key === "url") return validRequiredString(field, MAX_STATE_URL_LENGTH);
        const maxLength = key === "body"
          ? MAX_STATE_TEXT_LENGTH
          : key === "text"
            ? 10_000
            : key === "color" || key === "iconColor"
              ? 100
              : 1000;
        return validRequiredString(field, maxLength);
      }
      if (type === "number") {
        return typeof field === "number"
          && Number.isSafeInteger(field)
          && field >= -1_000_000
          && field <= 1_000_000;
      }
      return typeof field === "boolean";
    });
  });
};

const validateStringRecord = (
  value: unknown,
  maxEntries = MAX_STATE_RECORDS_PER_COLLECTION,
  maxValueLength = MAX_STATE_TEXT_LENGTH
) => (
  isRecord(value)
  && Object.keys(value).length <= maxEntries
  && Object.keys(value).every((key) => key.length > 0 && key.length <= 200)
  && Object.values(value).every((entry) => typeof entry === "string" && entry.length <= maxValueLength)
);

export function validateAppStatePayload(value: unknown, label = "数据"): asserts value is AppState {
  if (!isRecord(value)) throw new Error(`${label}格式无效：根节点必须是对象`);

  const state = value;
  if (!hasOnlyKeys(state, new Set([
    "version",
    "dataSchemaVersion",
    "clientVersion",
    "minimumClientVersion",
    "shortcuts",
    "shortcutFolders",
    "shortcutGroups",
    "todos",
    "notes",
    "countdowns",
    "settings",
    "sync",
    "updatedAt"
  ]))) throw new Error(`${label}格式无效：包含未知的顶层字段`);
  if (
    state.version !== 1
    || !validTimestamp(state.updatedAt)
    || !validVersion(state.clientVersion)
    || !validVersion(state.minimumClientVersion)
    || !validOptionalNumberInRange(state.dataSchemaVersion, 1, 1000)
    || (state.dataSchemaVersion !== undefined && !Number.isSafeInteger(state.dataSchemaVersion))
  ) throw new Error(`${label}格式无效：版本或更新时间异常`);

  const validCollections = validateEntityArray(state.shortcuts, {
    title: "string",
    url: "string",
    pinned: "boolean",
    order: "number"
  }, [
    "iconUrl",
    "iconColor",
    "groupId",
    "folderId"
  ]) && validateEntityArray(state.shortcutFolders, {
    name: "string",
    order: "number"
  }, [
    "iconUrl",
    "iconColor",
    "groupId"
  ], true) && validateEntityArray(state.shortcutGroups, {
    name: "string",
    order: "number"
  }, [
    "color"
  ]) && validateEntityArray(state.todos, {
    text: "string",
    done: "boolean",
    order: "number"
  }) && validateEntityArray(state.notes, {
    title: "string",
    body: "string"
  }, [
    "conflictBody"
  ]) && validateEntityArray(state.countdowns, {
    title: "string",
    date: "string"
  });
  if (!validCollections) throw new Error(`${label}格式无效：记录字段、数量或文本长度异常`);
  if ((state.shortcuts as UnknownRecord[]).some((entry) => !validHttpUrl(entry.url))) {
    throw new Error(`${label}格式无效：网站地址只支持 HTTP 或 HTTPS`);
  }

  if (!isRecord(state.settings) || !isRecord(state.sync)) {
    throw new Error(`${label}格式无效：缺少设置或同步元数据`);
  }

  const settings = state.settings;
  if (!hasOnlyKeys(settings, SETTINGS_KEYS)) throw new Error(`${label}格式无效：包含未知的设置字段`);
  const stringSettings = [
    "wallpaperPreset",
    "photoFrameTitle",
    "iconPresentation",
    "dateTimeColor",
    "widgetAccentColor",
    "gridDensity",
    "dockPosition",
    "city",
    "searchEngine",
    "navigationDisplay",
    "navigationSide",
    "timeZone",
    "supabaseUrl",
    "supabaseAnonKey",
    "updatedAt"
  ];
  if (
    !["light", "dark"].includes(String(settings.theme))
    || !validImageReference(settings.wallpaper)
    || !validImageReference(settings.photoFrameImage)
    || !validOptionalString(settings.quickNote)
    || stringSettings.some((key) => key === "updatedAt"
      ? !validOptionalTimestamp(settings[key])
      : !validOptionalString(settings[key], key === "supabaseAnonKey" ? 4096 : 500))
    || !validOptionalColor(settings.dateTimeColor)
    || !validOptionalColor(settings.widgetAccentColor)
    || !validOptionalNumberInRange(settings.glass, 0, 100)
    || settings.glass === undefined
    || !validOptionalNumberInRange(settings.iconSize, 16, 256)
    || settings.iconSize === undefined
    || !validOptionalNumberInRange(settings.visualRefreshVersion, 0, 1000)
    || (settings.visualRefreshVersion !== undefined && !Number.isSafeInteger(settings.visualRefreshVersion))
    || !validOptionalBoolean(settings.wallpaperRotation)
    || !validOptionalBoolean(settings.weatherUseLocation)
    || !validOptionalBoolean(settings.remoteIconLookup)
    || (settings.iconPresentation !== undefined && !["original", "soft", "minimal"].includes(String(settings.iconPresentation)))
    || !["comfortable", "compact"].includes(String(settings.gridDensity))
    || !["top", "bottom"].includes(String(settings.dockPosition))
    || typeof settings.city !== "string"
    || settings.city.length > 500
    || (settings.searchEngine !== undefined && !["baidu", "google"].includes(String(settings.searchEngine)))
    || (settings.navigationDisplay !== undefined && !["always", "auto", "hidden"].includes(String(settings.navigationDisplay)))
    || (settings.navigationSide !== undefined && !["left", "right"].includes(String(settings.navigationSide)))
    || (settings.timeZone !== undefined && !validTimeZone(settings.timeZone))
  ) {
    throw new Error(`${label}格式无效：设置字段类型或大小异常`);
  }

  const validStringArray = (entry: unknown, maxEntries = MAX_STATE_RECORDS_PER_COLLECTION) => (
    entry === undefined
    || (
      Array.isArray(entry)
      && entry.length <= maxEntries
      && entry.every((item) => validRequiredString(item, 500))
    )
  );
  const validUniqueStringArray = (
    entry: unknown,
    allowed?: ReadonlySet<string>,
    maxEntries = MAX_STATE_RECORDS_PER_COLLECTION
  ) => (
    validStringArray(entry, maxEntries)
    && (
      entry === undefined
      || (
        new Set(entry as string[]).size === (entry as string[]).length
        && (!allowed || (entry as string[]).every((item) => allowed.has(item)))
      )
    )
  );
  if (
    !validUniqueStringArray(settings.widgetOrder, WIDGET_KEYS, WIDGET_KEYS.size)
    || !validUniqueStringArray(settings.hiddenNavPages, new Set(["shortcuts", "tools"]), 2)
    || !validUniqueStringArray(settings.wallpaperCollection, undefined, 500)
  ) throw new Error(`${label}格式无效：设置列表异常`);

  const widgetSettings = isRecord(settings.widgets) ? settings.widgets : undefined;
  if (
    !widgetSettings
    || Object.keys(widgetSettings).some((key) => !WIDGET_KEYS.has(key as WidgetKey))
    || Object.values(widgetSettings).some((entry) => typeof entry !== "boolean")
  ) throw new Error(`${label}格式无效：小组件开关异常`);

  if (settings.widgetSizes !== undefined && (
    !isRecord(settings.widgetSizes)
    || Object.keys(settings.widgetSizes).some((key) => !WIDGET_KEYS.has(key as WidgetKey))
    || Object.values(settings.widgetSizes).some((entry) => !["small", "medium", "wide"].includes(String(entry)))
  )) throw new Error(`${label}格式无效：小组件尺寸异常`);

  if (settings.calendarRecords !== undefined && (
    !validateStringRecord(settings.calendarRecords, MAX_STATE_RECORDS_PER_COLLECTION, 10_000)
    || Object.keys(settings.calendarRecords as UnknownRecord).some((key) => !validDateKey(key))
  )) {
    throw new Error(`${label}格式无效：日历记录异常`);
  }
  if (settings.fieldUpdatedAt !== undefined) {
    const validFieldClockKey = (key: string) => {
      if (SETTINGS_VALUE_KEYS.has(key)) return true;
      const [parent, child, ...rest] = key.split(".");
      if (rest.length || !child) return false;
      if (parent === "widgets" || parent === "widgetSizes") return WIDGET_KEYS.has(child as WidgetKey);
      return parent === "calendarRecords" && validDateKey(child);
    };
    if (
      !validateStringRecord(settings.fieldUpdatedAt)
      || !isRecord(settings.fieldUpdatedAt)
      || Object.keys(settings.fieldUpdatedAt).some((key) => !validFieldClockKey(key))
      || Object.values(settings.fieldUpdatedAt).some((entry) => !validTimestamp(entry))
    ) throw new Error(`${label}格式无效：设置时间戳异常`);
  }

  if (settings.customWallpapers !== undefined) {
    const wallpaperIds = new Set<string>();
    if (
      !Array.isArray(settings.customWallpapers)
      || settings.customWallpapers.length > 12
      || settings.customWallpapers.some((entry) => {
        if (
          !isRecord(entry)
          || !hasOnlyKeys(entry, new Set(["id", "name", "dataUrl", "createdAt"]))
          || !validRequiredString(entry.id, MAX_STATE_ID_LENGTH)
          || !(entry.id as string).length
          || !validRequiredString(entry.name, 500)
          || !(entry.name as string).trim()
          || !validRasterDataUrl(entry.dataUrl)
          || !validTimestamp(entry.createdAt)
          || wallpaperIds.has(entry.id as string)
        ) return true;
        wallpaperIds.add(entry.id as string);
        return false;
      })
    ) throw new Error(`${label}格式无效：自定义壁纸异常`);
  }

  if (settings.customNavPages !== undefined && !validateEntityArray(settings.customNavPages, {
    name: "string",
    groupId: "string",
    icon: "string",
    order: "number"
  })) throw new Error(`${label}格式无效：自定义页面异常`);
  if (
    Array.isArray(settings.customNavPages)
    && settings.customNavPages.some((page) => (
      !isRecord(page)
      || !CUSTOM_NAV_PAGE_ICONS.has(String(page.icon))
      || !validRequiredString(page.groupId, MAX_STATE_ID_LENGTH)
      || !(page.groupId as string).length
      || !validRequiredString(page.name, 500)
      || !(page.name as string).trim()
    ))
  ) throw new Error(`${label}格式无效：自定义页面图标异常`);

  const sync = state.sync;
  if (!hasOnlyKeys(sync, new Set([
    "deviceId",
    "autoSync",
    "intervalSeconds",
    "lastPulledAt",
    "lastPushedAt",
    "lastRemoteUpdatedAt",
    "remoteRevision"
  ]))) throw new Error(`${label}格式无效：包含未知的同步字段`);
  if (
    !validRequiredString(sync.deviceId, MAX_STATE_ID_LENGTH)
    || !(sync.deviceId as string).length
    || typeof sync.autoSync !== "boolean"
    || !validOptionalNumberInRange(sync.intervalSeconds, 30, 3600)
    || sync.intervalSeconds === undefined
    || !validOptionalNumberInRange(sync.remoteRevision, 0, Number.MAX_SAFE_INTEGER)
    || (sync.remoteRevision !== undefined && !Number.isSafeInteger(sync.remoteRevision))
    || !validOptionalTimestamp(sync.lastPulledAt)
    || !validOptionalTimestamp(sync.lastPushedAt)
    || !validOptionalTimestamp(sync.lastRemoteUpdatedAt)
  ) throw new Error(`${label}格式无效：同步元数据异常`);
}

export function prepareCloudState(state: AppState): AppState {
  const normalized = normalizeState(state);
  const customIds = new Set((normalized.settings.customWallpapers || []).map((item) => item.id));
  const fieldUpdatedAt = { ...(normalized.settings.fieldUpdatedAt || {}) };
  [
    "photoFrameImage",
    "photoFrameTitle",
    "customWallpapers",
    "city",
    "weatherUseLocation",
    "supabaseUrl",
    "supabaseAnonKey"
  ].forEach((key) => {
    delete fieldUpdatedAt[key];
  });
  if (isLocalImage(normalized.settings.wallpaper)) delete fieldUpdatedAt.wallpaper;
  return {
    ...normalized,
    shortcuts: normalized.shortcuts.map((shortcut) => (
      isLocalImage(shortcut.iconUrl) ? { ...shortcut, iconUrl: undefined } : shortcut
    )),
    shortcutFolders: normalized.shortcutFolders.map((folder) => (
      isLocalImage(folder.iconUrl) ? { ...folder, iconUrl: undefined } : folder
    )),
    settings: {
      ...normalized.settings,
      photoFrameImage: undefined,
      photoFrameTitle: undefined,
      customWallpapers: [],
      city: CLOUD_NEUTRAL_WEATHER_CITY,
      weatherUseLocation: false,
      wallpaper: isLocalImage(normalized.settings.wallpaper) ? undefined : normalized.settings.wallpaper,
      wallpaperPreset: customIds.has(normalized.settings.wallpaperPreset || "") ? "aurora-lake" : normalized.settings.wallpaperPreset,
      wallpaperCollection: (normalized.settings.wallpaperCollection || []).filter((id) => !customIds.has(id)),
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      fieldUpdatedAt
    },
    sync: {
      deviceId: "cloud",
      autoSync: true,
      intervalSeconds: 60,
      remoteRevision: 0
    }
  };
}

export function prepareCompleteBackupState(state: AppState): AppState {
  const normalized = normalizeState(state);
  const fieldUpdatedAt = { ...(normalized.settings.fieldUpdatedAt || {}) };
  delete fieldUpdatedAt.city;
  delete fieldUpdatedAt.weatherUseLocation;
  return {
    ...normalized,
    settings: {
      ...normalized.settings,
      city: CLOUD_NEUTRAL_WEATHER_CITY,
      weatherUseLocation: false,
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      fieldUpdatedAt
    },
    sync: {
      ...normalized.sync,
      deviceId: "backup",
      lastPulledAt: undefined,
      lastPushedAt: undefined,
      lastRemoteUpdatedAt: undefined,
      remoteRevision: 0
    }
  };
}

export function restoreCompleteBackupForDevice(backup: AppState, current: AppState): AppState {
  const normalizedBackup = normalizeState(backup);
  const normalizedCurrent = normalizeState(current);
  return normalizeState({
    ...normalizedBackup,
    settings: {
      ...normalizedBackup.settings,
      city: normalizedCurrent.settings.city,
      weatherUseLocation: normalizedCurrent.settings.weatherUseLocation,
      supabaseUrl: normalizedCurrent.settings.supabaseUrl,
      supabaseAnonKey: normalizedCurrent.settings.supabaseAnonKey,
      fieldUpdatedAt: {
        ...(normalizedBackup.settings.fieldUpdatedAt || {}),
        city: normalizedCurrent.settings.fieldUpdatedAt?.city
          || normalizedCurrent.settings.updatedAt
          || normalizedCurrent.updatedAt,
        weatherUseLocation: normalizedCurrent.settings.fieldUpdatedAt?.weatherUseLocation
          || normalizedCurrent.settings.updatedAt
          || normalizedCurrent.updatedAt
      }
    },
    sync: normalizedCurrent.sync
  });
}

export async function pushSnapshot(state: AppState, expectedUserId: string): Promise<number> {
  const supabase = await getSupabase(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  if (!expectedUserId) throw new AuthAccountChangedError();

  const payload = prepareCloudState(state);
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (payloadBytes > MAX_CLOUD_SNAPSHOT_BYTES) {
    throw new Error("同步数据超过 2 MB，请删除部分较大的文字内容后重试");
  }

  const { data, error } = await supabase.rpc("push_sync_snapshot_for_user", {
    p_user_id: expectedUserId,
    p_name: "primary",
    p_payload: payload,
    p_expected_revision: state.sync?.remoteRevision || 0
  });
  if (error) throw error;
  const result = (Array.isArray(data) ? data[0] : data) as { applied?: boolean; next_revision?: number } | null;
  if (!result?.applied && Number(result?.next_revision) === -1) {
    throw new Error("同步操作过于频繁，请稍后再试");
  }
  if (!result?.applied) throw new SyncConflictError();
  const revision = Number(result.next_revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("云端返回了无效的同步修订号");
  }
  return revision;
}

export async function pullSnapshot(state: AppState, expectedUserId: string): Promise<AppState | undefined> {
  const supabase = await getSupabase(state.settings.supabaseUrl, state.settings.supabaseAnonKey);
  if (!supabase) throw new Error("Supabase 配置不完整");
  if (!expectedUserId) throw new AuthAccountChangedError();

  const { data, error } = await supabase.rpc("pull_sync_snapshot_for_user", {
    p_user_id: expectedUserId,
    p_name: "primary"
  });
  if (error) throw error;
  const snapshot = (Array.isArray(data) ? data[0] : data) as {
    user_id?: string;
    payload?: AppState;
    updated_at?: string;
    revision?: number;
  } | null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (authData.user?.id !== expectedUserId) throw new AuthAccountChangedError();
  if (snapshot && snapshot.user_id !== expectedUserId) throw new AuthAccountChangedError();
  const payload = snapshot?.payload;
  if (!payload) return undefined;
  validateAppStatePayload(payload, "云端数据");
  ensureRemoteCompatible(payload);
  return {
    ...payload,
    sync: {
      ...payload.sync,
      remoteRevision: Number(snapshot?.revision || 0),
      lastRemoteUpdatedAt: snapshot?.updated_at || payload.sync?.lastRemoteUpdatedAt
    }
  };
}

type SyncRecord = {
  id: string;
  updatedAt: string;
  deletedAt?: string;
};


const defaultWidgetOrder: WidgetKey[] = ["weather", "calendar", "todos", "countdowns", "focus", "notes", "rates", "quote", "clock", "memo", "year", "calculator"];

const defaultWidgets: Record<WidgetKey, boolean> = {
  weather: true,
  calendar: true,
  countdowns: true,
  todos: true,
  notes: true,
  rates: true,
  quote: true,
  focus: true,
  clock: false,
  memo: false,
  year: false,
  calculator: false
};

const normalizeWidgetOrder = (order?: WidgetKey[]) => {
  const valid = new Set(defaultWidgetOrder);
  const result = (order || []).filter((key, index, list) => valid.has(key) && list.indexOf(key) === index);
  defaultWidgetOrder.forEach((key) => {
    if (!result.includes(key)) result.push(key);
  });
  return result;
};

const time = (value?: string) => (value ? new Date(value).getTime() || 0 : 0);
const stableValue = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
    .join(",")}}`;
};
const comparableCloudState = (state: AppState) => {
  const prepared = prepareCloudState(state);
  return {
    ...prepared,
    updatedAt: "",
    settings: {
      ...prepared.settings,
      updatedAt: ""
    }
  };
};
export const cloudStatesEquivalent = (left: AppState, right: AppState) => (
  stableValue(comparableCloudState(left)) === stableValue(comparableCloudState(right))
);
const shouldUseRemote = (localClock: string, remoteClock: string, localValue: unknown, remoteValue: unknown) => {
  const localTime = time(localClock);
  const remoteTime = time(remoteClock);
  if (remoteTime !== localTime) return remoteTime > localTime;
  return stableValue(remoteValue) >= stableValue(localValue);
};
const settingsMetadataKeys = new Set(["fieldUpdatedAt", "updatedAt"]);
const nestedRecordSettingKeys = new Set(["widgets", "widgetSizes", "calendarRecords"]);
const settingsKeys = (settings: Settings) => Object.keys(settings).filter((key) => !settingsMetadataKeys.has(key));
const settingRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

const normalizeSettingsFieldUpdatedAt = (settings: Settings, fallback: string) => {
  const current = settings.fieldUpdatedAt || {};
  return {
    ...current,
    ...Object.fromEntries(settingsKeys(settings).map((key) => [key, current[key] || fallback]))
  };
};

export function stampSettingsChanges(current: Settings, next: Settings, updatedAt: string): Settings {
  const keys = new Set([...settingsKeys(current), ...settingsKeys(next)]);
  const fieldUpdatedAt = { ...(current.fieldUpdatedAt || {}), ...(next.fieldUpdatedAt || {}) };
  let changed = false;

  keys.forEach((key) => {
    if (nestedRecordSettingKeys.has(key)) {
      const currentRecord = settingRecord((current as unknown as Record<string, unknown>)[key]);
      const nextRecord = settingRecord((next as unknown as Record<string, unknown>)[key]);
      const childKeys = new Set([...Object.keys(currentRecord), ...Object.keys(nextRecord)]);
      let nestedChanged = false;
      childKeys.forEach((childKey) => {
        if (Object.is(currentRecord[childKey], nextRecord[childKey])) return;
        fieldUpdatedAt[`${key}.${childKey}`] = updatedAt;
        nestedChanged = true;
      });
      if (nestedChanged) {
        changed = true;
      }
      return;
    }
    if (Object.is(current[key as keyof Settings], next[key as keyof Settings])) return;
    fieldUpdatedAt[key] = updatedAt;
    changed = true;
  });

  if (!changed) return { ...next, fieldUpdatedAt };
  return { ...next, fieldUpdatedAt, updatedAt };
}

const mergeSettings = (local: Settings, remote: Settings): Settings => {
  const localFieldUpdatedAt = normalizeSettingsFieldUpdatedAt(local, local.updatedAt || "");
  const remoteFieldUpdatedAt = normalizeSettingsFieldUpdatedAt(remote, remote.updatedAt || "");
  const keys = new Set([...settingsKeys(local), ...settingsKeys(remote)]);
  const merged = { ...local } as Settings;
  const fieldUpdatedAt: Record<string, string> = {};

  keys.forEach((key) => {
    const localClock = localFieldUpdatedAt[key] || "";
    const remoteClock = remoteFieldUpdatedAt[key] || "";
    if (nestedRecordSettingKeys.has(key)) {
      const localRecord = settingRecord((local as unknown as Record<string, unknown>)[key]);
      const remoteRecord = settingRecord((remote as unknown as Record<string, unknown>)[key]);
      const childKeys = new Set([...Object.keys(localRecord), ...Object.keys(remoteRecord)].sort());
      const mergedRecord: Record<string, unknown> = {};
      childKeys.forEach((childKey) => {
        const path = `${key}.${childKey}`;
        const localChildClock = localFieldUpdatedAt[path] || localClock;
        const remoteChildClock = remoteFieldUpdatedAt[path] || remoteClock;
        const useRemoteChild = shouldUseRemote(
          localChildClock,
          remoteChildClock,
          localRecord[childKey],
          remoteRecord[childKey]
        );
        const value = useRemoteChild ? remoteRecord[childKey] : localRecord[childKey];
        if (value !== undefined) mergedRecord[childKey] = value;
        fieldUpdatedAt[path] = useRemoteChild ? remoteChildClock : localChildClock;
      });
      (merged as unknown as Record<string, unknown>)[key] = mergedRecord;
      fieldUpdatedAt[key] = shouldUseRemote(localClock, remoteClock, localRecord, remoteRecord) ? remoteClock : localClock;
      return;
    }
    if (key === "customNavPages") {
      const pages = new Map<string, NonNullable<Settings["customNavPages"]>[number]>();
      [...(local.customNavPages || []), ...(remote.customNavPages || [])].forEach((page) => {
        const current = pages.get(page.id);
        if (!current || shouldUseRemote(
          current.deletedAt || current.updatedAt,
          page.deletedAt || page.updatedAt,
          current,
          page
        )) {
          pages.set(page.id, page);
        }
      });
      merged.customNavPages = [...pages.values()].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
      fieldUpdatedAt[key] = shouldUseRemote(
        localClock,
        remoteClock,
        local.customNavPages,
        remote.customNavPages
      ) ? remoteClock : localClock;
      return;
    }
    const localValue = (local as unknown as Record<string, unknown>)[key];
    const remoteValue = (remote as unknown as Record<string, unknown>)[key];
    const useRemote = shouldUseRemote(localClock, remoteClock, localValue, remoteValue);
    (merged as Record<string, unknown>)[key] = useRemote
      ? remoteValue
      : localValue;
    fieldUpdatedAt[key] = useRemote ? remoteClock : localClock;
  });

  return {
    ...merged,
    fieldUpdatedAt,
    updatedAt: time(remote.updatedAt) >= time(local.updatedAt) ? remote.updatedAt : local.updatedAt
  };
};

const stripRecordClocks = <T extends SyncRecord>(record: T) => {
  const { updatedAt: _updatedAt, deletedAt: _deletedAt, ...content } = record;
  return content;
};

const recordContentChanged = <T extends SyncRecord>(left: T, right: T) => (
  JSON.stringify(stripRecordClocks(left)) !== JSON.stringify(stripRecordClocks(right))
  || Boolean(left.deletedAt) !== Boolean(right.deletedAt)
);

const stampRecordSet = <T extends SyncRecord>(current: T[], target: T[], updatedAt: string) => {
  const currentById = new Map(current.map((record) => [record.id, record]));
  const targetIds = new Set(target.map((record) => record.id));
  const stamped = target.map((record) => {
    const previous = currentById.get(record.id);
    if (previous && !recordContentChanged(previous, record)) return record;
    return {
      ...record,
      updatedAt,
      deletedAt: record.deletedAt ? updatedAt : undefined
    };
  });

  current.forEach((record) => {
    if (!targetIds.has(record.id)) {
      stamped.push({
        ...record,
        updatedAt,
        deletedAt: updatedAt
      });
    }
  });
  return stamped;
};

export function stampStateSnapshot(current: AppState, target: AppState, updatedAt: string): AppState {
  const settings = stampSettingsChanges(current.settings, target.settings, updatedAt);
  settings.customNavPages = stampRecordSet(
    current.settings.customNavPages || [],
    target.settings.customNavPages || [],
    updatedAt
  );
  settings.fieldUpdatedAt = {
    ...(settings.fieldUpdatedAt || {}),
    customNavPages: updatedAt
  };

  return {
    ...target,
    shortcutGroups: stampRecordSet(current.shortcutGroups, target.shortcutGroups, updatedAt),
    shortcutFolders: stampRecordSet(current.shortcutFolders || [], target.shortcutFolders || [], updatedAt),
    shortcuts: stampRecordSet(current.shortcuts, target.shortcuts, updatedAt),
    todos: stampRecordSet(current.todos, target.todos, updatedAt),
    notes: stampRecordSet(current.notes, target.notes, updatedAt),
    countdowns: stampRecordSet(current.countdowns, target.countdowns, updatedAt),
    settings,
    updatedAt
  };
}

const schemaVersion = (state?: Partial<AppState>) => state?.dataSchemaVersion || state?.version || 1;

function ensureRemoteCompatible(remote: AppState) {
  if (schemaVersion(remote) > DATA_SCHEMA_VERSION) {
    throw new Error("云端数据来自更新版本，请先升级 WhyNavo 再同步");
  }
  if (remote.minimumClientVersion && compareVersions(APP_VERSION, remote.minimumClientVersion) < 0) {
    throw new Error("当前版本过旧，请先升级 WhyNavo 再同步");
  }
}

const mergeRecords = <T extends SyncRecord>(local: T[], remote: T[]) => {
  const map = new Map<string, T>();
  [...local, ...remote].forEach((record) => {
    const current = map.get(record.id);
    if (!current) {
      map.set(record.id, record);
      return;
    }
    const latest = shouldUseRemote(
      current.deletedAt || current.updatedAt,
      record.deletedAt || record.updatedAt,
      current,
      record
    ) ? record : current;
    map.set(record.id, latest);
  });
  return [...map.values()].sort((a, b) => {
    const orderA = "order" in a && typeof a.order === "number" ? a.order : 0;
    const orderB = "order" in b && typeof b.order === "number" ? b.order : 0;
    return orderA - orderB || a.id.localeCompare(b.id);
  });
};

const conflictArchiveId = (noteId: string, body: string) => {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < body.length; index += 1) {
    const code = body.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  const hash = `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
  return `${noteId.slice(0, 160)}-conflict-${hash}`;
};

const mergeNotes = (local: Note[], remote: Note[], lastRemoteUpdatedAt?: string) => {
  const baselineTime = time(lastRemoteUpdatedAt);
  const map = new Map<string, Note>();
  [...local, ...remote].forEach((note) => {
    const current = map.get(note.id);
    if (!current) {
      map.set(note.id, note);
      return;
    }

    const latest = shouldUseRemote(
      current.deletedAt || current.updatedAt,
      note.deletedAt || note.updatedAt,
      current,
      note
    ) ? note : current;
    const older = latest === note ? current : note;

    const bothChangedSinceBaseline = baselineTime === 0 || (
      time(current.updatedAt) > baselineTime
      && time(note.updatedAt) > baselineTime
    );
    if (
      !latest.deletedAt
      && !older.deletedAt
      && latest.body !== older.body
      && bothChangedSinceBaseline
    ) {
      const alternatives = [latest.conflictBody, older.body, older.conflictBody]
        .filter((body): body is string => Boolean(body && body !== latest.body));
      const separator = "\n\n----- 另一份同步冲突内容 -----\n\n";
      let conflictBody = "";
      const archivedBodies: string[] = [];
      [...new Set(alternatives)].forEach((body) => {
        const combined = conflictBody ? `${conflictBody}${separator}${body}` : body;
        if (combined.length <= MAX_STATE_TEXT_LENGTH) {
          conflictBody = combined;
        } else {
          archivedBodies.push(body);
        }
      });
      map.set(latest.id, {
        ...latest,
        conflictBody: conflictBody || undefined
      });
      archivedBodies.forEach((body) => {
        const id = conflictArchiveId(latest.id, body);
        if (map.has(id)) return;
        map.set(id, {
          id,
          title: `${latest.title.slice(0, 980)}（同步冲突副本）`,
          body,
          updatedAt: older.updatedAt
        });
      });
      return;
    }
    map.set(latest.id, latest);
  });
  return [...map.values()].sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || a.id.localeCompare(b.id));
};

const preserveLocalIcons = <T extends { id: string; iconUrl?: string }>(merged: T[], local: T[]) => {
  const localIcons = new Map(
    local
      .filter((record) => isLocalImage(record.iconUrl))
      .map((record) => [record.id, record.iconUrl] as const)
  );
  return merged.map((record) => {
    const iconUrl = localIcons.get(record.id);
    return iconUrl ? { ...record, iconUrl } : record;
  });
};

export function normalizeState(state: AppState): AppState {
  observeIsoTimestamp(state.updatedAt);
  [
    state.shortcuts,
    state.shortcutFolders,
    state.shortcutGroups,
    state.todos,
    state.notes,
    state.countdowns,
    state.settings.customNavPages || []
  ].forEach((records) => records?.forEach((record) => {
    observeIsoTimestamp(record.updatedAt);
    observeIsoTimestamp(record.deletedAt);
  }));
  observeIsoTimestamp(state.settings.updatedAt);
  Object.values(state.settings.fieldUpdatedAt || {}).forEach(observeIsoTimestamp);
  observeIsoTimestamp(state.sync?.lastPulledAt);
  observeIsoTimestamp(state.sync?.lastPushedAt);
  observeIsoTimestamp(state.sync?.lastRemoteUpdatedAt);

  const updatedAt = state.updatedAt || new Date().toISOString();
  const visualVersion = state.settings.visualRefreshVersion || 0;
  const normalizedWidgets = { ...defaultWidgets, ...(state.settings.widgets || {}) };
  const normalizedWidgetSizes = { ...defaultWidgetSizes, ...(state.settings.widgetSizes || {}) };
  if (visualVersion < 6) {
    (["clock", "memo", "year", "calculator"] as WidgetKey[]).forEach((key) => {
      normalizedWidgets[key] = false;
    });
  }
  const settings: Settings = {
    ...state.settings,
    wallpaper: visualVersion < 5 ? undefined : normalizeStoredImageReference(state.settings.wallpaper),
    wallpaperPreset: visualVersion < 5 ? "aurora-lake" : state.settings.wallpaperPreset || "aurora-lake",
    wallpaperRotation: visualVersion < 5 ? false : state.settings.wallpaperRotation ?? false,
    visualRefreshVersion: 11,
    iconSize: Math.min(80, Math.max(48, visualVersion < 8 && state.settings.iconSize === 64 ? 58 : state.settings.iconSize || 58)),
    glass: Math.min(88, Math.max(28, state.settings.glass || 42)),
    customWallpapers: state.settings.customWallpapers || [],
    wallpaperCollection: state.settings.wallpaperCollection || ["coastal-glass", "neon-rain", "aurora-lake", "ocean-cliff"],
    quickNote: state.settings.quickNote || "",
    photoFrameImage: normalizeStoredImageReference(state.settings.photoFrameImage),
    iconPresentation: state.settings.iconPresentation || "original",
    widgets: normalizedWidgets,
    widgetOrder: normalizeWidgetOrder(state.settings.widgetOrder),
    widgetSizes: normalizedWidgetSizes,
    customNavPages: (state.settings.customNavPages || []).filter((page, index, pages) => (
      Boolean(page?.id && page.name?.trim() && page.groupId)
      && pages.findIndex((candidate) => candidate.id === page.id) === index
    )),
    hiddenNavPages: Array.from(new Set((state.settings.hiddenNavPages || []).filter((page) => page === "shortcuts" || page === "tools"))),
    navigationDisplay: state.settings.navigationDisplay === "auto" || state.settings.navigationDisplay === "hidden"
      ? state.settings.navigationDisplay
      : "always",
    navigationSide: state.settings.navigationSide === "right" ? "right" : "left",
    remoteIconLookup: state.settings.remoteIconLookup ?? true,
    timeZone: validTimeZone(state.settings.timeZone) ? state.settings.timeZone : "Asia/Shanghai",
    dateTimeColor: state.settings.dateTimeColor || "#ffffff",
    widgetAccentColor: state.settings.widgetAccentColor || "#2dd4bf",
    weatherUseLocation: state.settings.weatherUseLocation ?? false,
    searchEngine: state.settings.searchEngine || "baidu",
    calendarRecords: state.settings.calendarRecords || {},
    supabaseUrl: DEFAULT_SUPABASE_URL,
    supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
    updatedAt: state.settings.updatedAt || updatedAt
  };
  settings.fieldUpdatedAt = normalizeSettingsFieldUpdatedAt(settings, settings.updatedAt || updatedAt);

  return {
    ...state,
    version: 1,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    clientVersion: APP_VERSION,
    minimumClientVersion: MIN_SUPPORTED_APP_VERSION,
    updatedAt,
    shortcuts: (state.shortcuts || []).map((shortcut) => ({
      ...shortcut,
      iconUrl: normalizeStoredImageReference(shortcut.iconUrl, true)
    })),
    shortcutFolders: (state.shortcutFolders || []).map((folder) => ({
      ...folder,
      iconUrl: normalizeStoredImageReference(folder.iconUrl, true)
    })),
    shortcutGroups: state.shortcutGroups || [],
    todos: state.todos || [],
    notes: state.notes || [],
    countdowns: state.countdowns || [],
    settings,
    sync: {
      deviceId: state.sync?.deviceId || uid(),
      autoSync: state.sync?.autoSync ?? true,
      intervalSeconds: Math.min(3600, Math.max(30, Math.floor(state.sync?.intervalSeconds || 60))),
      lastPulledAt: state.sync?.lastPulledAt,
      lastPushedAt: state.sync?.lastPushedAt,
      lastRemoteUpdatedAt: state.sync?.lastRemoteUpdatedAt,
      remoteRevision: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(state.sync?.remoteRevision || 0)))
    }
  };
}

export function adoptPortableStateForAccount(portable: AppState, accountBase: AppState): AppState {
  return normalizeState({
    ...portable,
    settings: {
      ...portable.settings,
      supabaseUrl: accountBase.settings.supabaseUrl,
      supabaseAnonKey: accountBase.settings.supabaseAnonKey
    },
    sync: {
      ...portable.sync,
      deviceId: accountBase.sync.deviceId,
      autoSync: accountBase.sync.autoSync,
      intervalSeconds: accountBase.sync.intervalSeconds,
      lastPulledAt: accountBase.sync.lastPulledAt,
      lastPushedAt: accountBase.sync.lastPushedAt,
      lastRemoteUpdatedAt: accountBase.sync.lastRemoteUpdatedAt,
      remoteRevision: accountBase.sync.remoteRevision
    }
  });
}

export function mergePortableStateIntoAccount(account: AppState, portable: AppState): AppState {
  const normalizedAccount = normalizeState(account);
  const normalizedPortable = normalizeState(portable);
  const mergedDeviceWeather = mergeSettings(normalizedAccount.settings, normalizedPortable.settings);
  const merged = mergeRemote(normalizedAccount, {
    ...normalizedPortable,
    sync: normalizedAccount.sync
  });
  const customWallpapers = new Map(
    (normalizedAccount.settings.customWallpapers || []).map((wallpaper) => [wallpaper.id, wallpaper])
  );
  (normalizedPortable.settings.customWallpapers || []).forEach((wallpaper) => customWallpapers.set(wallpaper.id, wallpaper));
  const portableUsesCustomWallpaper = normalizedPortable.settings.wallpaper?.startsWith("data:")
    || customWallpapers.has(normalizedPortable.settings.wallpaperPreset || "");

  return normalizeState({
    ...merged,
    settings: {
      ...merged.settings,
      photoFrameImage: normalizedPortable.settings.photoFrameImage || normalizedAccount.settings.photoFrameImage,
      photoFrameTitle: normalizedPortable.settings.photoFrameImage
        ? normalizedPortable.settings.photoFrameTitle
        : normalizedAccount.settings.photoFrameTitle,
      customWallpapers: [...customWallpapers.values()],
      wallpaper: portableUsesCustomWallpaper ? normalizedPortable.settings.wallpaper : normalizedAccount.settings.wallpaper,
      wallpaperPreset: portableUsesCustomWallpaper ? normalizedPortable.settings.wallpaperPreset : normalizedAccount.settings.wallpaperPreset,
      wallpaperCollection: Array.from(new Set([
        ...(normalizedAccount.settings.wallpaperCollection || []),
        ...(normalizedPortable.settings.customWallpapers || []).map((wallpaper) => wallpaper.id)
      ])),
      city: mergedDeviceWeather.city,
      weatherUseLocation: mergedDeviceWeather.weatherUseLocation,
      supabaseUrl: normalizedAccount.settings.supabaseUrl,
      supabaseAnonKey: normalizedAccount.settings.supabaseAnonKey,
      fieldUpdatedAt: {
        ...(merged.settings.fieldUpdatedAt || {}),
        city: mergedDeviceWeather.fieldUpdatedAt?.city || mergedDeviceWeather.updatedAt || normalizedPortable.updatedAt,
        weatherUseLocation: mergedDeviceWeather.fieldUpdatedAt?.weatherUseLocation
          || mergedDeviceWeather.updatedAt
          || normalizedPortable.updatedAt
      }
    },
    sync: normalizedAccount.sync
  });
}

export function mergeRemote(local: AppState, remote?: AppState): AppState {
  const normalizedLocal = normalizeState(local);
  if (!remote) return normalizedLocal;

  ensureRemoteCompatible(remote);
  const normalizedRemote = normalizeState(remote);
  const settings = mergeSettings(normalizedLocal.settings, normalizedRemote.settings);
  const mergedFolders = preserveLocalIcons(
    mergeRecords<ShortcutFolder>(normalizedLocal.shortcutFolders, normalizedRemote.shortcutFolders),
    normalizedLocal.shortcutFolders
  );
  const mergedShortcuts = preserveLocalIcons(
    mergeRecords<Shortcut>(normalizedLocal.shortcuts, normalizedRemote.shortcuts),
    normalizedLocal.shortcuts
  );
  const merged: AppState = {
    version: 1,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    clientVersion: APP_VERSION,
    minimumClientVersion: MIN_SUPPORTED_APP_VERSION,
    shortcutGroups: mergeRecords<ShortcutGroup>(normalizedLocal.shortcutGroups, normalizedRemote.shortcutGroups),
    shortcutFolders: mergedFolders,
    shortcuts: mergedShortcuts,
    todos: mergeRecords<Todo>(normalizedLocal.todos, normalizedRemote.todos),
    notes: mergeNotes(
      normalizedLocal.notes,
      normalizedRemote.notes,
      normalizedLocal.sync.lastRemoteUpdatedAt
    ),
    countdowns: mergeRecords<Countdown>(normalizedLocal.countdowns, normalizedRemote.countdowns),
    settings: {
      ...settings,
      photoFrameImage: normalizedLocal.settings.photoFrameImage,
      photoFrameTitle: normalizedLocal.settings.photoFrameTitle,
      customWallpapers: normalizedLocal.settings.customWallpapers || [],
      wallpaper: isLocalImage(normalizedLocal.settings.wallpaper) ? normalizedLocal.settings.wallpaper : settings.wallpaper,
      wallpaperPreset: (normalizedLocal.settings.customWallpapers || []).some((item) => item.id === normalizedLocal.settings.wallpaperPreset)
        ? normalizedLocal.settings.wallpaperPreset
        : settings.wallpaperPreset,
      wallpaperCollection: Array.from(new Set([
        ...(settings.wallpaperCollection || []),
        ...(normalizedLocal.settings.customWallpapers || []).map((item) => item.id)
      ])),
      city: normalizedLocal.settings.city,
      weatherUseLocation: normalizedLocal.settings.weatherUseLocation,
      supabaseUrl: normalizedLocal.settings.supabaseUrl || normalizedRemote.settings.supabaseUrl,
      supabaseAnonKey: normalizedLocal.settings.supabaseAnonKey || normalizedRemote.settings.supabaseAnonKey,
      fieldUpdatedAt: {
        ...(settings.fieldUpdatedAt || {}),
        city: normalizedLocal.settings.fieldUpdatedAt?.city || normalizedLocal.settings.updatedAt || normalizedLocal.updatedAt,
        weatherUseLocation: normalizedLocal.settings.fieldUpdatedAt?.weatherUseLocation
          || normalizedLocal.settings.updatedAt
          || normalizedLocal.updatedAt
      }
    },
    sync: {
      ...normalizedLocal.sync,
      lastPulledAt: new Date().toISOString(),
      lastRemoteUpdatedAt: normalizedRemote.sync.lastRemoteUpdatedAt || normalizedRemote.updatedAt,
      remoteRevision: normalizedRemote.sync?.remoteRevision || normalizedLocal.sync?.remoteRevision || 0
    },
    updatedAt: new Date(Math.max(time(normalizedLocal.updatedAt), time(normalizedRemote.updatedAt))).toISOString()
  };
  return merged;
}

export function mergeLocalPeerState(local: AppState, peer: AppState): AppState {
  const normalizedLocal = normalizeState(local);
  ensureRemoteCompatible(peer);
  const normalizedPeer = normalizeState(peer);
  const settings = mergeSettings(normalizedLocal.settings, normalizedPeer.settings);
  const localSyncPreferences = {
    deviceId: normalizedLocal.sync.deviceId,
    autoSync: normalizedLocal.sync.autoSync,
    intervalSeconds: normalizedLocal.sync.intervalSeconds
  };
  const peerSyncPreferences = {
    deviceId: normalizedPeer.sync.deviceId,
    autoSync: normalizedPeer.sync.autoSync,
    intervalSeconds: normalizedPeer.sync.intervalSeconds
  };
  const usePeerSyncPreferences = shouldUseRemote(
    normalizedLocal.updatedAt,
    normalizedPeer.updatedAt,
    localSyncPreferences,
    peerSyncPreferences
  );
  const latestTimestamp = (left?: string, right?: string) => (
    time(right) > time(left) ? right : left
  );

  return normalizeState({
    version: 1,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    clientVersion: APP_VERSION,
    minimumClientVersion: MIN_SUPPORTED_APP_VERSION,
    shortcutGroups: mergeRecords<ShortcutGroup>(normalizedLocal.shortcutGroups, normalizedPeer.shortcutGroups),
    shortcutFolders: mergeRecords<ShortcutFolder>(normalizedLocal.shortcutFolders, normalizedPeer.shortcutFolders),
    shortcuts: mergeRecords<Shortcut>(normalizedLocal.shortcuts, normalizedPeer.shortcuts),
    todos: mergeRecords<Todo>(normalizedLocal.todos, normalizedPeer.todos),
    notes: mergeNotes(
      normalizedLocal.notes,
      normalizedPeer.notes,
      latestTimestamp(normalizedLocal.sync.lastRemoteUpdatedAt, normalizedPeer.sync.lastRemoteUpdatedAt)
    ),
    countdowns: mergeRecords<Countdown>(normalizedLocal.countdowns, normalizedPeer.countdowns),
    settings: {
      ...settings,
      supabaseUrl: normalizedLocal.settings.supabaseUrl,
      supabaseAnonKey: normalizedLocal.settings.supabaseAnonKey
    },
    sync: {
      ...normalizedLocal.sync,
      deviceId: usePeerSyncPreferences ? normalizedPeer.sync.deviceId : normalizedLocal.sync.deviceId,
      autoSync: usePeerSyncPreferences ? normalizedPeer.sync.autoSync : normalizedLocal.sync.autoSync,
      intervalSeconds: usePeerSyncPreferences
        ? normalizedPeer.sync.intervalSeconds
        : normalizedLocal.sync.intervalSeconds,
      lastPulledAt: latestTimestamp(normalizedLocal.sync.lastPulledAt, normalizedPeer.sync.lastPulledAt),
      lastPushedAt: latestTimestamp(normalizedLocal.sync.lastPushedAt, normalizedPeer.sync.lastPushedAt),
      lastRemoteUpdatedAt: latestTimestamp(
        normalizedLocal.sync.lastRemoteUpdatedAt,
        normalizedPeer.sync.lastRemoteUpdatedAt
      ),
      remoteRevision: Math.max(
        normalizedLocal.sync.remoteRevision || 0,
        normalizedPeer.sync.remoteRevision || 0
      )
    },
    updatedAt: latestTimestamp(normalizedLocal.updatedAt, normalizedPeer.updatedAt) || normalizedLocal.updatedAt
  });
}

export const localStatesEquivalent = (left: AppState, right: AppState) => (
  stableValue(normalizeState(left)) === stableValue(normalizeState(right))
);

export function markPulled(state: AppState, remote?: AppState): AppState {
  const normalized = normalizeState(state);
  return {
    ...normalized,
    sync: {
      ...normalized.sync,
      lastPulledAt: new Date().toISOString(),
      lastRemoteUpdatedAt: remote?.updatedAt || normalized.sync.lastRemoteUpdatedAt,
      remoteRevision: remote?.sync?.remoteRevision ?? normalized.sync.remoteRevision
    }
  };
}

export function markPushed(state: AppState, remoteRevision = state.sync?.remoteRevision || 0): AppState {
  const normalized = normalizeState(state);
  return {
    ...normalized,
    sync: {
      ...normalized.sync,
      lastPushedAt: new Date().toISOString(),
      lastRemoteUpdatedAt: normalized.updatedAt,
      remoteRevision
    }
  };
}

export function reconcileCompletedSync(started: AppState, completed: AppState, current: AppState): AppState {
  if (current.updatedAt === started.updatedAt) return completed;
  return mergeRemote(current, completed);
}

export async function synchronizeSnapshot(
  state: AppState,
  expectedUserId: string,
  attempts = 3,
  onBeforeRemoteMerge?: (remote: AppState) => Promise<void>
): Promise<AppState> {
  let candidate = state;
  let remoteBackupCreated = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remote = await pullSnapshot(candidate, expectedUserId);
    if (
      remote
      && !remoteBackupCreated
      && !cloudStatesEquivalent(candidate, remote)
      && onBeforeRemoteMerge
    ) {
      await onBeforeRemoteMerge(remote);
      remoteBackupCreated = true;
    }
    candidate = mergeRemote(candidate, remote);
    if (remote && cloudStatesEquivalent(candidate, remote)) {
      return markPulled(candidate, remote);
    }
    if (!remote) {
      candidate = {
        ...candidate,
        sync: {
          ...candidate.sync,
          remoteRevision: 0
        }
      };
    }
    try {
      const revision = await pushSnapshot(candidate, expectedUserId);
      return markPushed(candidate, revision);
    } catch (error) {
      if (!(error instanceof SyncConflictError) || attempt === attempts - 1) throw error;
    }
  }
  throw new Error("同步重试次数已用尽");
}
