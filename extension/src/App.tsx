import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellOff,
  BookOpen,
  Bot,
  Briefcase,
  Brush,
  Calculator,
  Camera,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Code2,
  CalendarDays,
  Check,
  Clock3,
  Compass,
  Droplets,
  Download,
  FileText,
  Database,
  Gamepad2,
  Edit3,
  Folder,
  FolderPlus,
  Globe2,
  GraduationCap,
  HeartPulse,
  House,
  GripVertical,
  Import,
  Image as ImageIcon,
  KeyRound,
  ListTodo,
  Mail,
  MapPin,
  Music,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  Plane,
  Layers,
  Languages,
  LayoutGrid,
  LogOut,
  Palette,
  Pin,
  PanelLeft,
  PanelRight,
  Eye,
  EyeOff,
  Plus,
  RefreshCcw,
  Repeat2,
  Server,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Shuffle,
  Sparkles,
  Star,
  StickyNote,
  Sun,
  Target,
  Moon,
  Trash2,
  Video,
  TrendingUp,
  Wallet,
  Wrench,
  ShoppingBag,
  Snowflake,
  Upload,
  TimerReset,
  UserCircle,
  Wind,
  X
} from "lucide-react";
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { accountScopedKey, adoptLegacyStateForAccount, clearLocalAccountDeletionPending, clearLocalDeletedAccountMarkerForVerifiedUser, commitAnonymousStateAdoption, deleteKey, deleteLocalAccountData, downloadJson, downloadText, hasLegacyUnscopedState, loadStateForAccount, markLocalAccountDeletionPending, mergeAndSaveStateForAccount, readKey, readPendingLocalAccountDeletionIds, saveStateForAccount, writeKey } from "./db";
import { defaultNavigationOrder, defaultState, defaultWidgetOrder, defaultWidgetSizes, nowIso, uid } from "./defaultState";
import { MAX_IMPORTED_SHORTCUTS, MAX_IMPORT_TEXT_CHARS, colorFor, curatedIconCount, curatedIconFor, fallbackFaviconFor, faviconFor, importedToShortcuts, normalizeIconReference, parseImportText, siteIconCandidatesFor } from "./importers";
import { MIGRATION_BACKUP_KEY, type StateBackup } from "./migrations";
import { fetchRates, getCachedRates } from "./rates";
import { checkWebTaskReminders, isRecurringTodoDueOn, isTodoCompletedForDate, nextTodoCompletion, recurrenceLabel, requestTaskReminderPermission, syncTaskReminders } from "./reminders";
import { CAPTCHA_CONFIGURED, DEFAULT_AUTH_REDIRECT_URL } from "./projectConfig";
import TurnstileChallenge, { type TurnstileChallengeHandle } from "./TurnstileChallenge";
import { fetchWeather, fetchWeatherByCoordinates, getCachedWeather, getDevicePosition, requestDeviceLocationPermission, weatherLabel } from "./weather";
import { checkForUpdate, type UpdateCheckResult } from "./updates";
import { APP_VERSION, DATA_SCHEMA_VERSION, UPDATE_TARGET_URL } from "./version";
import {
  AccountDeletionOutcomeUnknownError,
  AccountDeletionRejectedError,
  adoptPortableStateForAccount,
  AuthAccountChangedError,
  deleteAccount,
  getSupabase,
  getUser,
  getCachedUser,
  isTerminalAuthError,
  localStatesEquivalent,
  markPulled,
  markPushed,
  mergeLocalPeerState,
  mergePortableStateIntoAccount,
  mergeRemote,
  normalizeState,
  prepareCompleteBackupState,
  pullSnapshot,
  pushSnapshot,
  reconcileCompletedSync,
  requestPasswordReset,
  resendSignupConfirmation,
  restoreCompleteBackupForDevice,
  signIn,
  signOut,
  signOutEverywhere,
  signUp,
  SyncConflictError,
  stampSettingsChanges,
  stampStateSnapshot,
  synchronizeSnapshot,
  updatePassword,
  validateAppStatePayload,
  type SyncStatus
} from "./sync";
import type { AppState, Countdown, CustomNavPage, CustomNavPageIcon, Note, RatesState, SearchEngine, Shortcut, ShortcutFolder, SystemNavPage, Todo, UiLanguage, WeatherState, WidgetKey, WidgetSize } from "./types";
import { normalizeHttpUrl, safeHttpHref } from "./urls";

type Dialog = "shortcut" | "folder" | "import" | "library" | "wallpapers" | "pages" | "settings" | "sync" | "timezone" | null;
type ShortcutMenuState = { x: number; y: number; shortcutId: string } | null;
type FolderMenuState = { x: number; y: number; folderId: string } | null;
type PageMenuState = { x: number; y: number } | null;
type WidgetMenuState = { x: number; y: number; widgetKey?: WidgetKey } | null;
type HomePage = SystemNavPage;
type HomeTileRef = `shortcut:${string}` | `folder:${string}`;
type HomeTilePosition = { x: number; y: number };
type SyncMode = "merge" | "push" | "pull";
type AuthResult = { status: "signed-in" | "verification-sent"; message: string };
type ToastAction = { label: string; onClick: () => void };

const friendlyAuthError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  if (!message) return fallback;
  if (/[一-鿿]/u.test(message)) return message;
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "邮箱或密码不正确";
  if (normalized.includes("email not confirmed")) return "邮箱尚未验证，请先打开验证邮件";
  if (normalized.includes("already registered") || normalized.includes("already exists")) return "此邮箱已注册，请直接登录或重置密码";
  if (normalized.includes("captcha") || normalized.includes("challenge")) return "安全验证已失效，请重新完成验证";
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) return "操作过于频繁，请稍后再试";
  if (normalized.includes("password") && normalized.includes("same")) return "新密码不能与当前密码相同";
  if (normalized.includes("current password") || normalized.includes("reauthentication")) return "当前密码不正确或会话需要重新验证";
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("timeout")) return "网络连接失败，请检查网络后重试";
  if (normalized.includes("function") && normalized.includes("status")) return "账号服务暂时不可用，请稍后再试";
  return fallback;
};

const SYNC_RESTORE_KEY = "sync-restore-point";
const PUBLIC_AUTH_REDIRECT_URL = "https://whynavo.pages.dev/";
const HOSTED_APP_ORIGIN = "https://whynavo.pages.dev";
const homePageOrder: HomePage[] = defaultNavigationOrder;
const WEATHER_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const RATES_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const ICON_LOAD_TIMEOUT_MS = 5000;
const ICON_FAILURE_RETRY_MS = 6 * 60 * 60 * 1000;
const MIN_SHARP_ICON_SIZE = 192;
const MIN_COMPACT_ICON_SIZE = 48;
const MIN_COMPACT_RENDER_SIZE = 20;
const SHORTCUT_RENDER_BATCH = 96;
const SHORTCUT_STABLE_RENDER_LIMIT = 360;
const ICON_MANAGER_RENDER_BATCH = 80;
const MAX_CUSTOM_WALLPAPERS = 12;
const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;

const UiLanguageContext = createContext<UiLanguage>("zh-CN");
const localized = (language: UiLanguage, zh: string, en: string) => language === "en-US" ? en : zh;
const useUiLanguage = () => useContext(UiLanguageContext);

const MAX_IMAGE_DATA_URL_LENGTH = 3 * 1024 * 1024;
const MAX_BACKUP_IMPORT_BYTES = 64 * 1024 * 1024;
const MAX_ENTITY_RECORDS = 5000;
const MAX_ENTITY_NAME_CHARS = 1000;
const MAX_TODO_TEXT_CHARS = 10_000;
const MAX_CALENDAR_RECORD_CHARS = 10_000;
const MAX_QUICK_NOTE_CHARS = 500_000;
const MAX_URL_CHARS = 8192;
const MIN_PASSWORD_LENGTH = 12;
const PASSWORD_REQUIREMENT = `至少 ${MIN_PASSWORD_LENGTH} 个字符，并包含大写字母、小写字母和数字`;
const isStrongPassword = (value: string) => (
  value.length >= MIN_PASSWORD_LENGTH
  && /[a-z]/.test(value)
  && /[A-Z]/.test(value)
  && /[0-9]/.test(value)
);
const LEGACY_RESOLVED_ICON_CACHE_PREFIXES = ["whynavo:resolved-icons:v1", "whynavo:resolved-icons:v2", "whynavo:resolved-icons:v3", "whynavo:resolved-icons:v4", "whynavo:resolved-icons:v5"];
const RESOLVED_ICON_CACHE_KEY_PREFIX = "whynavo:resolved-icons:v6";
const LOCAL_STATE_CHANNEL = "whynavo-local-state:v1";
const MAX_RESOLVED_ICON_CACHE_ENTRIES = 300;
const FAILED_ICON_CACHE_PREFIX = "failed:";
let remoteIconLookupEnabled = true;
const SortableWidgetGrid = lazy(() => import("./SortableWidgetGrid"));
const defaultHomeTilePositions: HomeTilePosition[] = [
  { x: 0.18, y: 0.14 },
  { x: 0.57, y: 0.22 },
  { x: 0.82, y: 0.38 },
  { x: 0.32, y: 0.48 },
  { x: 0.68, y: 0.62 },
  { x: 0.14, y: 0.78 },
  { x: 0.48, y: 0.86 },
  { x: 0.86, y: 0.82 },
  { x: 0.45, y: 0.08 },
  { x: 0.08, y: 0.42 },
  { x: 0.88, y: 0.10 },
  { x: 0.42, y: 0.68 }
];
const cssImageUrl = (value: string) => {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n\f]/g, "");
  return `url("${escaped}")`;
};

const hasPasswordRecoveryMarker = () => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  return hash.get("type") === "recovery" || query.get("type") === "recovery";
};

const hasSignupVerificationMarker = () => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  return hash.get("type") === "signup" || query.get("type") === "signup";
};

const clearAuthCallbackUrl = () => {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.hash = "";
  [
    "access_token",
    "code",
    "error",
    "error_code",
    "error_description",
    "expires_at",
    "expires_in",
    "refresh_token",
    "token_type",
    "type"
  ].forEach((key) => cleanUrl.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}`);
};

const lazyIconCallbacks = new WeakMap<Element, () => void>();
let sharedIconObserver: IntersectionObserver | undefined;

const observeLazyIcon = (image: HTMLImageElement, onVisible: () => void) => {
  if (typeof IntersectionObserver === "undefined") {
    onVisible();
    return () => undefined;
  }
  sharedIconObserver ||= new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const callback = lazyIconCallbacks.get(entry.target);
      lazyIconCallbacks.delete(entry.target);
      sharedIconObserver?.unobserve(entry.target);
      callback?.();
    });
  }, { rootMargin: "1600px 0px" });
  lazyIconCallbacks.set(image, onVisible);
  sharedIconObserver.observe(image);
  return () => {
    lazyIconCallbacks.delete(image);
    sharedIconObserver?.unobserve(image);
  };
};

const isFreshCache = (updatedAt?: string, maxAge = WEATHER_CACHE_MAX_AGE_MS) => {
  if (!updatedAt) return false;
  const time = new Date(updatedAt).getTime();
  return Number.isFinite(time) && Date.now() - time < maxAge;
};

const shouldRefreshExternalData = (target: AppState, cachedWeather?: WeatherState, cachedRates?: RatesState) => {
  const lowQualityLocation = target.settings.weatherUseLocation && cachedWeather?.city === "当前位置";
  const needsWeather = !cachedWeather || lowQualityLocation || !isFreshCache(cachedWeather.updatedAt, WEATHER_CACHE_MAX_AGE_MS);
  const ratesConfigured = Boolean(target.settings.supabaseUrl && target.settings.supabaseAnonKey);
  const needsRates = ratesConfigured && (!cachedRates || !isFreshCache(cachedRates.updatedAt, RATES_CACHE_MAX_AGE_MS));
  return needsWeather || needsRates;
};

const getAuthRedirectUrl = () => {
  if (DEFAULT_AUTH_REDIRECT_URL) return DEFAULT_AUTH_REDIRECT_URL;
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return new URL(".", window.location.href).toString();
  }
  return PUBLIC_AUTH_REDIRECT_URL;
};

const widgetNames: Record<WidgetKey, string> = {
  weather: "天气",
  calendar: "日历",
  countdowns: "倒计时",
  todos: "To Do",
  notes: "照片",
  rates: "汇率",
  quote: "每日灵感",
  focus: "专注",
  clock: "世界时钟",
  memo: "便签",
  year: "年度进度",
  calculator: "计算器"
};

const widgetEnglishNames: Record<WidgetKey, string> = {
  weather: "Weather",
  calendar: "Calendar",
  countdowns: "Countdowns",
  todos: "To Do",
  notes: "Photos",
  rates: "Exchange rates",
  quote: "Daily inspiration",
  focus: "Focus",
  clock: "World clock",
  memo: "Memo",
  year: "Year progress",
  calculator: "Calculator"
};

const widgetNameFor = (language: UiLanguage, key: WidgetKey) => (
  language === "en-US" ? widgetEnglishNames[key] : widgetNames[key]
);

const widgetLibraryMeta: Record<WidgetKey, {
  category: "信息" | "效率" | "生活";
  preview: string;
  Icon: typeof CalendarDays;
}> = {
  weather: { category: "信息", preview: "21° 晴", Icon: Globe2 },
  calendar: { category: "效率", preview: "今日 2 日", Icon: CalendarDays },
  countdowns: { category: "生活", preview: "还有 28 天", Icon: Clock3 },
  todos: { category: "效率", preview: "3 项待办", Icon: Check },
  notes: { category: "生活", preview: "照片", Icon: ImageIcon },
  rates: { category: "信息", preview: "USD 7.18", Icon: Wallet },
  quote: { category: "生活", preview: "每日一句", Icon: Sparkles },
  focus: { category: "效率", preview: "25:00", Icon: TimerReset },
  clock: { category: "信息", preview: "13:42", Icon: Clock3 },
  memo: { category: "效率", preview: "记下一点", Icon: FileText },
  year: { category: "生活", preview: "50.1%", Icon: TrendingUp },
  calculator: { category: "效率", preview: "128", Icon: Calculator }
};

const widgetEnglishPreviews: Record<WidgetKey, string> = {
  weather: "21° Clear",
  calendar: "Today 2",
  countdowns: "28 days left",
  todos: "3 tasks",
  notes: "Photos",
  rates: "USD 7.18",
  quote: "Daily quote",
  focus: "25:00",
  clock: "13:42",
  memo: "Write a note",
  year: "50.1%",
  calculator: "128"
};

const widgetPreviewFor = (language: UiLanguage, key: WidgetKey) => (
  language === "en-US" ? widgetEnglishPreviews[key] : widgetLibraryMeta[key].preview
);

const widgetCategoryFor = (language: UiLanguage, category: "信息" | "效率" | "生活") => {
  if (language === "zh-CN") return category;
  return category === "信息" ? "Information" : category === "效率" ? "Productivity" : "Lifestyle";
};

const todoTextFor = (language: UiLanguage, value: string) => (
  value === "添加常用网站快捷方式"
    ? localized(language, "添加常用网站快捷方式", "Add shortcuts for frequently used sites")
    : value
);

const noteTitleFor = (language: UiLanguage, value: string) => (
  value === "随手笔记" || value === "Quick note"
    ? localized(language, "随手笔记", "Quick note")
    : value
);

const noteBodyFor = (language: UiLanguage, value: string) => (
  value === "记录临时想法、链接或待整理的信息。" || value === "Capture temporary ideas, links, or information to organize later."
    ? localized(language, "记录临时想法、链接或待整理的信息。", "Capture temporary ideas, links, or information to organize later.")
    : value
);

const widgetSizeLabels: Record<WidgetSize, string> = {
  small: "紧凑",
  medium: "标准",
  wide: "展开"
};

const widgetSizeDetails: Record<WidgetSize, string> = {
  small: "快速扫一眼",
  medium: "均衡信息量",
  wide: "显示完整内容"
};

const widgetEnglishSizeLabels: Record<WidgetSize, string> = {
  small: "Compact",
  medium: "Standard",
  wide: "Expanded"
};

const widgetEnglishSizeDetails: Record<WidgetSize, string> = {
  small: "Quick glance",
  medium: "Balanced detail",
  wide: "Full content"
};

const allWidgetSizes: WidgetSize[] = ["small", "medium", "wide"];
const widgetSizeOptions: Record<WidgetKey, WidgetSize[]> = {
  weather: allWidgetSizes,
  calendar: allWidgetSizes,
  countdowns: allWidgetSizes,
  todos: allWidgetSizes,
  notes: allWidgetSizes,
  rates: allWidgetSizes,
  quote: allWidgetSizes,
  focus: allWidgetSizes,
  clock: allWidgetSizes,
  memo: allWidgetSizes,
  year: allWidgetSizes,
  calculator: allWidgetSizes
};

const customNavPageIcons: Record<CustomNavPageIcon, { label: string; Icon: typeof CalendarDays }> = {
  star: { label: "收藏", Icon: Star },
  briefcase: { label: "工作", Icon: Briefcase },
  book: { label: "学习", Icon: BookOpen },
  code: { label: "开发", Icon: Code2 },
  heart: { label: "生活", Icon: HeartPulse },
  plane: { label: "旅行", Icon: Plane },
  home: { label: "主页", Icon: House },
  grid: { label: "空间", Icon: LayoutGrid },
  search: { label: "搜索", Icon: Search },
  file: { label: "笔记", Icon: FileText },
  check: { label: "任务", Icon: Check },
  compass: { label: "探索", Icon: Compass },
  calendar: { label: "日程", Icon: CalendarDays },
  sparkles: { label: "灵感", Icon: Sparkles },
  globe: { label: "网络", Icon: Globe2 }
};

const customNavPageIconEnglishLabels: Record<CustomNavPageIcon, string> = {
  star: "Favorites", briefcase: "Work", book: "Learning", code: "Development", heart: "Lifestyle",
  plane: "Travel", home: "Home", grid: "Spaces", search: "Search", file: "Notes", check: "Tasks",
  compass: "Explore", calendar: "Calendar", sparkles: "Inspiration", globe: "Web"
};

const customNavPageIconLabelFor = (language: UiLanguage, key: CustomNavPageIcon) => (
  language === "en-US" ? customNavPageIconEnglishLabels[key] : customNavPageIcons[key].label
);

const systemNavDefaults: Record<SystemNavPage, {
  label: string;
  title: string;
  description: string;
  icon: CustomNavPageIcon;
}> = {
  widgets: { label: "Home", title: "主页", description: "今天最重要的内容与入口", icon: "home" },
  shortcuts: { label: "Spaces", title: "空间", description: "按分类整理你的站点与文件夹", icon: "grid" },
  search: { label: "Search", title: "搜索", description: "查找站点、笔记和任务", icon: "search" },
  notes: { label: "Notes", title: "笔记", description: "记录、整理并继续写作", icon: "file" },
  tasks: { label: "Tasks", title: "任务", description: "专注处理下一件重要的事", icon: "check" },
  tools: { label: "Tools", title: "工具", description: "快速处理日常小任务", icon: "book" }
};

const systemNavEnglishDescriptions: Record<SystemNavPage, string> = {
  widgets: "Your priorities, widgets, and quick access",
  shortcuts: "Organize sites and folders by category",
  search: "Find sites, notes, and tasks",
  notes: "Capture, organize, and continue writing",
  tasks: "Focus on the next important thing",
  tools: "Handle everyday utilities quickly"
};

const comparableUrl = (url: string) => {
  try {
    const parsed = new URL(normalizeHttpUrl(url) || url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
};

const iconUrlMatches = (value: string | undefined, hosts: string[], pathPrefix: string) => {
  const normalized = normalizeIconReference(value);
  if (!normalized || normalized.startsWith("whynavo-icon:")) return false;
  try {
    const parsed = new URL(normalized);
    return hosts.includes(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
};
const isGeneratedFaviconUrl = (url?: string) => (
  iconUrlMatches(url, ["google.com", "www.google.com"], "/s2/favicons")
  || iconUrlMatches(url, ["icons.duckduckgo.com"], "/ip3/")
);
const isSimpleIconsUrl = (url?: string) => iconUrlMatches(url, ["cdn.simpleicons.org"], "/");
const builtInIconPrefix = "whynavo-icon:";
const shortcutIconTextPalette = [
  "#F59E0B", "#22C55E", "#14B8A6", "#3B82F6", "#6366F1",
  "#7C3AED", "#DB2777", "#EF4444", "#FB7185", "#A78BFA",
  "#A16207", "#C08457", "#64748B", "#647D5A", "#4B7B6B",
  "#607D8B", "#4F6FAF", "#737373", "#3F3F46", "#18181B"
];
const normalizeShortcutIconText = (value?: string) => Array.from((value || "").trim()).slice(0, 2).join("");
const shortcutIconTextColor = (background: string) => {
  const hex = background.replace("#", "");
  const value = Number.parseInt(hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex, 16);
  if (!Number.isFinite(value)) return "#FFFFFF";
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const linearChannel = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
  return luminance > 0.18 ? "#172026" : "#FFFFFF";
};
const builtInShortcutIcons = [
  { id: "general", label: "通用", Icon: Globe2, tone: "#38BDF8" },
  { id: "ai", label: "AI", Icon: Bot, tone: "#A78BFA" },
  { id: "tool", label: "工具", Icon: Wrench, tone: "#22C55E" },
  { id: "design", label: "设计", Icon: Brush, tone: "#F472B6" },
  { id: "video", label: "视频", Icon: Video, tone: "#FB7185" },
  { id: "music", label: "音乐", Icon: Music, tone: "#F59E0B" },
  { id: "doc", label: "文档", Icon: FileText, tone: "#60A5FA" },
  { id: "shop", label: "购物", Icon: ShoppingBag, tone: "#F97316" },
  { id: "mail", label: "邮箱", Icon: Mail, tone: "#06B6D4" },
  { id: "server", label: "服务器", Icon: Server, tone: "#64748B" },
  { id: "finance", label: "财务", Icon: Wallet, tone: "#EAB308" },
  { id: "learn", label: "学习", Icon: GraduationCap, tone: "#10B981" },
  { id: "code", label: "开发", Icon: Code2, tone: "#38BDF8" },
  { id: "game", label: "游戏", Icon: Gamepad2, tone: "#A78BFA" },
  { id: "travel", label: "旅行", Icon: Plane, tone: "#22C55E" },
  { id: "photo", label: "摄影", Icon: Camera, tone: "#F472B6" },
  { id: "chat", label: "沟通", Icon: MessageCircle, tone: "#FB7185" },
  { id: "data", label: "数据", Icon: Database, tone: "#60A5FA" },
  { id: "health", label: "健康", Icon: HeartPulse, tone: "#10B981" },
  { id: "news", label: "资讯", Icon: BookOpen, tone: "#F59E0B" },
];

const builtInShortcutIconEnglishLabels: Record<string, string> = {
  general: "General", ai: "AI", tool: "Tools", design: "Design", video: "Video",
  music: "Music", doc: "Documents", shop: "Shopping", mail: "Mail", server: "Servers",
  finance: "Finance", learn: "Learning", code: "Development", game: "Games", travel: "Travel",
  photo: "Photography", chat: "Communication", data: "Data", health: "Health", news: "News"
};

const builtInShortcutIconLabelFor = (language: UiLanguage, icon: (typeof builtInShortcutIcons)[number]) => (
  language === "en-US" ? (builtInShortcutIconEnglishLabels[icon.id] || icon.id) : icon.label
);

const shortcutGroupNameFor = (language: UiLanguage, group: AppState["shortcutGroups"][number]) => (
  group.id === "default" && group.name === "常用" ? localized(language, "常用", "Common") : group.name
);

const builtInIconValue = (id: string) => `${builtInIconPrefix}${id}`;
const builtInShortcutIconFor = (iconUrl?: string) => {
  if (!iconUrl?.startsWith(builtInIconPrefix)) return undefined;
  return builtInShortcutIcons.find((icon) => icon.id === iconUrl.slice(builtInIconPrefix.length));
};

function ShortcutTextIcon({ text, color }: { text: string; color: string }) {
  const normalizedText = normalizeShortcutIconText(text) || "网";
  return (
    <span
      className="shortcut-text-icon"
      style={{
        "--text-icon-background": color,
        "--text-icon-foreground": shortcutIconTextColor(color)
      } as React.CSSProperties}
      aria-hidden="true"
    >
      {normalizedText}
    </span>
  );
}

type IconCandidate = {
  url: string;
  kind: "site-art" | "brand-mark";
  vector: boolean;
  fixed: boolean;
};

const resolvedIconCache = new Map<string, string>();
let resolvedIconCacheStorageKey = `${RESOLVED_ICON_CACHE_KEY_PREFIX}:anonymous`;
let resolvedIconCacheDirty = false;
let resolvedIconCachePersistTimer: number | undefined;
const SELECTED_ICON_CACHE_PREFIX = "whynavo-selected-shortcut-icons-v1";
const MAX_SELECTED_ICON_CACHE_ENTRIES = 512;
const MAX_SELECTED_ICON_CACHE_BYTES = 1024 * 1024;
const cacheableSelectedIconTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

const selectedIconCacheNameFor = (storageKey: string) => `${SELECTED_ICON_CACHE_PREFIX}:${storageKey}`;

const selectedIconCacheRequest = async (iconUrl: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(iconUrl));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request(`${window.location.origin}/__whynavo_cached_icon__/${key}`);
};

const readCachedSelectedIcon = async (iconUrl: string) => {
  if (!window.caches || iconUrl.startsWith("data:")) return undefined;
  try {
    const cache = await window.caches.open(selectedIconCacheNameFor(resolvedIconCacheStorageKey));
    const response = await cache.match(await selectedIconCacheRequest(iconUrl));
    if (!response) return undefined;
    const blob = await response.blob();
    return cacheableSelectedIconTypes.has(blob.type.toLowerCase()) && blob.size <= MAX_SELECTED_ICON_CACHE_BYTES
      ? blob
      : undefined;
  } catch {
    return undefined;
  }
};

const cacheSelectedIcon = async (iconUrl: string) => {
  if (!window.caches || iconUrl.startsWith("data:") || !normalizeIconReference(iconUrl)) return false;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(iconUrl, {
      cache: "force-cache",
      credentials: "omit",
      mode: "cors",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    if (!response.ok) return false;
    const blob = await response.blob();
    const type = blob.type.toLowerCase();
    if (!cacheableSelectedIconTypes.has(type) || blob.size <= 0 || blob.size > MAX_SELECTED_ICON_CACHE_BYTES) return false;
    const cache = await window.caches.open(selectedIconCacheNameFor(resolvedIconCacheStorageKey));
    await cache.put(
      await selectedIconCacheRequest(iconUrl),
      new Response(blob, { headers: { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": type } })
    );
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_SELECTED_ICON_CACHE_ENTRIES)).map((request) => cache.delete(request)));
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
};

const deleteSelectedIconCacheForAccount = async (userId: string) => {
  if (!window.caches) return;
  try {
    await window.caches.delete(selectedIconCacheNameFor(`${RESOLVED_ICON_CACHE_KEY_PREFIX}:user:${userId}`));
  } catch {
    // Account deletion must continue if browser-managed icon cache cleanup fails.
  }
};

const persistResolvedIconCache = () => {
  if (resolvedIconCachePersistTimer !== undefined) {
    window.clearTimeout(resolvedIconCachePersistTimer);
    resolvedIconCachePersistTimer = undefined;
  }
  if (!resolvedIconCacheDirty) return;
  try {
    localStorage.setItem(resolvedIconCacheStorageKey, JSON.stringify([...resolvedIconCache]));
    resolvedIconCacheDirty = false;
  } catch {
    // Browser HTTP cache and the in-memory map remain available when storage is full.
  }
};

const scheduleResolvedIconCachePersist = () => {
  resolvedIconCacheDirty = true;
  if (resolvedIconCachePersistTimer !== undefined) return;
  resolvedIconCachePersistTimer = window.setTimeout(persistResolvedIconCache, 300);
};

const setResolvedIconCacheScope = (userId?: string) => {
  persistResolvedIconCache();
  resolvedIconCacheStorageKey = `${RESOLVED_ICON_CACHE_KEY_PREFIX}:${userId ? `user:${userId}` : "anonymous"}`;
  resolvedIconCache.clear();
  resolvedIconCacheDirty = false;
  try {
    const stored = JSON.parse(localStorage.getItem(resolvedIconCacheStorageKey) || "[]") as Array<[string, string]>;
    stored.slice(-MAX_RESOLVED_ICON_CACHE_ENTRIES).forEach(([key, value]) => {
      if (typeof key === "string" && typeof value === "string") resolvedIconCache.set(key, value);
    });
  } catch {
    try {
      localStorage.removeItem(resolvedIconCacheStorageKey);
    } catch {
      // Keep the in-memory cache empty when persistent storage is unavailable.
    }
  }
};

const deleteResolvedIconCacheForAccount = (userId: string) => {
  const storageKey = `${RESOLVED_ICON_CACHE_KEY_PREFIX}:user:${userId}`;
  if (resolvedIconCacheStorageKey === storageKey) {
    if (resolvedIconCachePersistTimer !== undefined) {
      window.clearTimeout(resolvedIconCachePersistTimer);
      resolvedIconCachePersistTimer = undefined;
    }
    resolvedIconCache.clear();
    resolvedIconCacheDirty = false;
  }
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Account deletion must continue even if browser storage is unavailable.
  }
};

const cleanupDeletedAccountData = async (userId: string) => {
  await deleteLocalAccountData(userId);
  deleteResolvedIconCacheForAccount(userId);
  await deleteSelectedIconCacheForAccount(userId);
};

try {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key && LEGACY_RESOLVED_ICON_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) localStorage.removeItem(key);
  }
} catch {
  // The app remains usable with an in-memory icon cache.
}
setResolvedIconCacheScope();

const rememberResolvedIcon = (key: string, value: string) => {
  resolvedIconCache.delete(key);
  resolvedIconCache.set(key, value);
  while (resolvedIconCache.size > MAX_RESOLVED_ICON_CACHE_ENTRIES) {
    const oldest = resolvedIconCache.keys().next().value as string | undefined;
    if (!oldest) break;
    resolvedIconCache.delete(oldest);
  }
  scheduleResolvedIconCachePersist();
};

const failedIconCacheTime = (value?: string) => {
  if (!value?.startsWith(FAILED_ICON_CACHE_PREFIX)) return undefined;
  const failedAt = Number(value.slice(FAILED_ICON_CACHE_PREFIX.length));
  return Number.isFinite(failedAt) && failedAt > 0 ? failedAt : undefined;
};

const isFreshFailedIconCache = (value?: string) => {
  const failedAt = failedIconCacheTime(value);
  return failedAt !== undefined && Date.now() - failedAt < ICON_FAILURE_RETRY_MS;
};

const isVectorIconUrl = (url: string) => /(?:\.svg(?:[?#]|$)|^data:image\/svg\+xml)/i.test(url);
const isVectorIconReference = (url: string) => isVectorIconUrl(url) || isSimpleIconsUrl(url);
type IconPresentation = { mode: "full" | "compact"; edge: number };
const fullIconPresentation = (): IconPresentation => ({ mode: "full", edge: 0 });
const rasterIconPresentation = (image: HTMLImageElement): IconPresentation | undefined => {
  const renderedSize = Math.max(image.getBoundingClientRect().width, image.getBoundingClientRect().height);
  const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  const requiredEdge = Math.max(MIN_SHARP_ICON_SIZE, Math.ceil(renderedSize * pixelRatio));
  const sourceEdge = Math.min(image.naturalWidth, image.naturalHeight);
  if (sourceEdge >= requiredEdge) return fullIconPresentation();
  const compactEdge = Math.min(Math.floor(renderedSize * 0.72), Math.floor(sourceEdge / pixelRatio));
  return sourceEdge >= MIN_COMPACT_ICON_SIZE && compactEdge >= MIN_COMPACT_RENDER_SIZE
    ? { mode: "compact", edge: compactEdge }
    : undefined;
};
const encodeResolvedIcon = (url: string, presentation: IconPresentation) => (
  presentation.mode === "compact" ? `compact:${presentation.edge}:${url}` : `full:${url}`
);
const decodeResolvedIcon = (value?: string): { url: string; presentation: IconPresentation } | undefined => {
  if (!value || value.startsWith(FAILED_ICON_CACHE_PREFIX)) return undefined;
  if (value.startsWith("full:")) return { url: value.slice(5), presentation: fullIconPresentation() };
  const compactMatch = value.match(/^compact:(\d+):(https:\/\/.+)$/);
  if (!compactMatch) return undefined;
  const edge = Number(compactMatch[1]);
  return Number.isFinite(edge) && edge >= MIN_COMPACT_RENDER_SIZE
    ? { url: compactMatch[2], presentation: { mode: "compact", edge } }
    : undefined;
};
const compactIconStyle = (presentation?: IconPresentation) => (
  presentation?.mode === "compact"
    ? { "--compact-icon-edge": `${presentation.edge}px` } as React.CSSProperties
    : undefined
);

const iconCandidatesFor = (url: string, iconUrl?: string, title = "") => {
  const builtInIcon = builtInShortcutIconFor(iconUrl);
  const customIconUrl = builtInIcon || isGeneratedFaviconUrl(iconUrl) ? undefined : normalizeIconReference(iconUrl);
  if (customIconUrl) {
    return [{
      url: customIconUrl,
      kind: isSimpleIconsUrl(customIconUrl) ? "brand-mark" as const : "site-art" as const,
      vector: isVectorIconUrl(customIconUrl),
      fixed: true
    }];
  }
  if (!remoteIconLookupEnabled) {
    return [];
  }
  const directCandidates = siteIconCandidatesFor(url);
  const curated = curatedIconFor(url, title);
  const curatedIsVector = curated ? isVectorIconReference(curated) : false;
  const serviceIcon = faviconFor(url);
  const fallbackIcon = fallbackFaviconFor(url);
  const candidates: Array<IconCandidate | undefined> = [
    curated ? { url: curated, kind: curatedIsVector ? "brand-mark" : "site-art", vector: curatedIsVector, fixed: false } : undefined,
    ...directCandidates.map((candidate) => ({ url: candidate, kind: "site-art" as const, vector: isVectorIconReference(candidate), fixed: false })),
    serviceIcon ? { url: serviceIcon, kind: "site-art", vector: false, fixed: false } : undefined,
    fallbackIcon ? { url: fallbackIcon, kind: "site-art", vector: false, fixed: false } : undefined
  ];
  const seen = new Set<string>();
  return candidates.filter((item): item is IconCandidate => {
    if (!item) return false;
    const safeUrl = normalizeIconReference(item.url);
    if (!safeUrl || safeUrl.startsWith("whynavo-icon:") || seen.has(safeUrl)) return false;
    item.url = safeUrl;
    seen.add(safeUrl);
    return true;
  });
};

const iconCandidateCacheKey = (candidates: IconCandidate[], url: string, iconUrl?: string) => {
  const hasLocalCandidate = candidates.some((candidate) => candidate.url.startsWith("data:") || candidate.url.startsWith("blob:"));
  return hasLocalCandidate
    ? `local:${url}:${iconUrl?.length || 0}:${iconUrl?.slice(-48) || ""}`
    : candidates.map((candidate) => `${candidate.kind}:${candidate.url}`).join("|");
};

const invalidateResolvedShortcutIcon = (url: string, iconUrl?: string, title = "") => {
  const candidates = iconCandidatesFor(url, iconUrl, title);
  const key = iconCandidateCacheKey(candidates, url, iconUrl);
  if (!key || !resolvedIconCache.delete(key)) return;
  scheduleResolvedIconCachePersist();
};

function BuiltInShortcutIcon({ iconUrl, fallback = "" }: { iconUrl?: string; fallback?: string }) {
  const icon = builtInShortcutIconFor(iconUrl);
  if (!icon) return <>{fallback}</>;
  const Icon = icon.Icon;
  return <span className="built-in-shortcut-glyph" style={{ "--icon-tone": icon.tone } as React.CSSProperties}><Icon size={22} strokeWidth={2.3} /></span>;
}

function ShortcutIconContent({ url, iconUrl, iconText, iconColor = "#64748B", iconUpdatedAt, title = "", fallback = "", priority = false }: { url: string; iconUrl?: string; iconText?: string; iconColor?: string; iconUpdatedAt?: string; title?: string; fallback?: string; priority?: boolean }) {
  const normalizedText = normalizeShortcutIconText(iconText);
  if (normalizedText) return <ShortcutTextIcon text={normalizedText} color={iconColor} />;
  const builtInIcon = builtInShortcutIconFor(iconUrl);
  if (builtInIcon) return <BuiltInShortcutIcon iconUrl={iconUrl} fallback={fallback} />;
  const fixedIconUrl = isGeneratedFaviconUrl(iconUrl) ? undefined : normalizeIconReference(iconUrl);
  if (fixedIconUrl) {
    const fixedIconKey = `${iconUpdatedAt || ""}:${fixedIconUrl.length}:${fixedIconUrl.slice(-96)}`;
    return <FixedShortcutIconImage key={fixedIconKey} url={url} iconUrl={fixedIconUrl} iconColor={iconColor} alt={title} fallback={fallback} />;
  }
  return <ShortcutIconImage url={url} iconUrl={iconUrl} iconColor={iconColor} refreshKey={iconUpdatedAt} title={title} fallback={fallback} priority={priority} />;
}

function FixedShortcutIconImage({ url, iconUrl, iconColor = "#64748B", alt = "", fallback = "" }: { url: string; iconUrl: string; iconColor?: string; alt?: string; fallback?: string }) {
  const isLocalIcon = iconUrl.startsWith("data:");
  const cacheKey = isLocalIcon
    ? `fixed-local:${iconUrl.length}:${iconUrl.slice(-64)}`
    : `fixed-icon:${iconUrl}`;
  const [renderUrl, setRenderUrl] = useState(isLocalIcon ? iconUrl : "");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [presentation, setPresentation] = useState<IconPresentation>();

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setRenderUrl(isLocalIcon ? iconUrl : "");
    setLoaded(false);
    setFailed(false);
    setPresentation(undefined);
    if (!isLocalIcon) {
      void readCachedSelectedIcon(iconUrl).then((blob) => {
        if (!active) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setRenderUrl(objectUrl);
        } else {
          setRenderUrl(iconUrl);
        }
      });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cacheKey, iconUrl, isLocalIcon]);

  if (failed) {
    return <ShortcutIconImage url={url} iconColor={iconColor} title={alt} alt={alt} fallback={fallback} priority />;
  }

  return (
    <>
      {!loaded && <ShortcutTextIcon text={fallback || "网"} color={iconColor} />}
      {renderUrl && (
        <img
          className={`shortcut-icon-image is-site-art ${presentation?.mode === "compact" ? "is-compact" : ""} ${loaded ? "is-loaded" : ""}`.trim()}
          style={compactIconStyle(presentation)}
          src={renderUrl}
          alt={alt}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            const nextPresentation = isVectorIconReference(iconUrl)
              ? fullIconPresentation()
              : rasterIconPresentation(event.currentTarget);
            if (!nextPresentation) {
              setLoaded(false);
              setFailed(true);
              return;
            }
            setPresentation(nextPresentation);
            setLoaded(true);
          }}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      )}
    </>
  );
}

function ShortcutIconImage({ url, iconUrl, iconColor = "#64748B", refreshKey, title = "", alt = "", fallback = "", priority = false }: { url: string; iconUrl?: string; iconColor?: string; refreshKey?: string; title?: string; alt?: string; fallback?: string; priority?: boolean }) {
  const candidates = useMemo(() => iconCandidatesFor(url, iconUrl, title), [url, iconUrl, title, remoteIconLookupEnabled]);
  const candidateKey = iconCandidateCacheKey(candidates, url, iconUrl);
  const initialCachedValue = resolvedIconCache.get(candidateKey);
  const initialResolvedIcon = decodeResolvedIcon(initialCachedValue);
  const initialCachedIndex = initialResolvedIcon ? candidates.findIndex((candidate) => candidate.url === initialResolvedIcon.url) : -1;
  const hasFixedCandidate = candidates.some((candidate) => candidate.fixed);
  const [index, setIndex] = useState(initialCachedIndex >= 0 ? initialCachedIndex : 0);
  const [loaded, setLoaded] = useState(initialCachedIndex >= 0);
  const [presentation, setPresentation] = useState<IconPresentation | undefined>(initialCachedIndex >= 0 ? initialResolvedIcon?.presentation : undefined);
  const [shouldLoad, setShouldLoad] = useState(priority || hasFixedCandidate || initialCachedIndex >= 0);
  const imageRef = useRef<HTMLImageElement>(null);
  const loadedRef = useRef(initialCachedIndex >= 0);
  const hasLocalCandidate = candidates.some((candidate) => candidate.url.startsWith("data:") || candidate.url.startsWith("blob:"));
  const current = candidates[index];

  useEffect(() => {
    const cachedValue = resolvedIconCache.get(candidateKey);
    if (isFreshFailedIconCache(cachedValue)) {
      setIndex(candidates.length);
      setLoaded(false);
      setPresentation(undefined);
      loadedRef.current = false;
    } else {
      if (failedIconCacheTime(cachedValue) !== undefined) {
        resolvedIconCache.delete(candidateKey);
        scheduleResolvedIconCachePersist();
      }
      const resolvedIcon = decodeResolvedIcon(cachedValue);
      const cachedIndex = resolvedIcon ? candidates.findIndex((candidate) => candidate.url === resolvedIcon.url) : -1;
      setIndex(cachedIndex >= 0 ? cachedIndex : 0);
      setLoaded(cachedIndex >= 0);
      setPresentation(cachedIndex >= 0 ? resolvedIcon?.presentation : undefined);
      loadedRef.current = cachedIndex >= 0;
      if (cachedIndex >= 0 || hasFixedCandidate || priority) setShouldLoad(true);
    }
  }, [candidateKey, refreshKey, hasFixedCandidate, priority]);

  useEffect(() => {
    if (priority || hasFixedCandidate || resolvedIconCache.has(candidateKey)) {
      setShouldLoad(true);
      return undefined;
    }
    const image = imageRef.current;
    if (!image || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return undefined;
    }
    return observeLazyIcon(image, () => setShouldLoad(true));
  }, [candidateKey, hasFixedCandidate, priority]);

  useEffect(() => {
    if (!current || !shouldLoad) return undefined;
    const resolvedIcon = decodeResolvedIcon(resolvedIconCache.get(candidateKey));
    const alreadyResolved = resolvedIcon?.url === current.url;
    setLoaded(alreadyResolved);
    setPresentation(alreadyResolved ? resolvedIcon?.presentation : undefined);
    loadedRef.current = alreadyResolved;
    const timeout = window.setTimeout(() => {
      if (!loadedRef.current) setIndex((value) => value + 1);
    }, ICON_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [candidateKey, current, shouldLoad]);

  useEffect(() => {
    if (
      !shouldLoad
      || hasLocalCandidate
      || candidates.length === 0
      || index < candidates.length
      || isFreshFailedIconCache(resolvedIconCache.get(candidateKey))
    ) return;
    rememberResolvedIcon(candidateKey, `${FAILED_ICON_CACHE_PREFIX}${Date.now()}`);
  }, [candidateKey, candidates.length, hasLocalCandidate, index, shouldLoad]);

  const fallbackText = fallback || "网";
  if (!current) return <ShortcutTextIcon text={fallbackText} color={iconColor} />;
  return (
    <>
      {!loaded && <ShortcutTextIcon text={fallbackText} color={iconColor} />}
      <img
        ref={imageRef}
        key={current.url}
        className={`shortcut-icon-image is-${current.kind} ${presentation?.mode === "compact" ? "is-compact" : ""} ${loaded ? "is-loaded" : ""}`.trim()}
        style={compactIconStyle(presentation)}
        src={shouldLoad ? current.url : undefined}
        alt={alt}
        loading={priority || current.fixed || loaded ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={(event) => {
          const image = event.currentTarget;
          const nextPresentation = current.vector ? fullIconPresentation() : rasterIconPresentation(image);
          if (!nextPresentation) {
            loadedRef.current = false;
            setLoaded(false);
            setPresentation(undefined);
            setIndex((value) => value + 1);
            return;
          }
          loadedRef.current = true;
          setPresentation(nextPresentation);
          if (!hasLocalCandidate) rememberResolvedIcon(candidateKey, encodeResolvedIcon(current.url, nextPresentation));
          setLoaded(true);
        }}
        onError={() => {
          loadedRef.current = false;
          setLoaded(false);
          setPresentation(undefined);
          setIndex((value) => value + 1);
        }}
      />
    </>
  );
}

function IconChoicePreview({ src, fallback, onStatus }: { src: string; fallback: string; onStatus?: (status: "loading" | "ready" | "failed") => void }) {
  const safeSrc = normalizeIconReference(src);
  const [failed, setFailed] = useState(false);
  const [presentation, setPresentation] = useState<IconPresentation>();
  useEffect(() => {
    setFailed(false);
    setPresentation(undefined);
    onStatus?.(safeSrc ? "loading" : "failed");
  }, [safeSrc]);
  if (!safeSrc || failed) return <span className="icon-choice-fallback">{fallback}</span>;
  return (
    <img
      className={presentation?.mode === "compact" ? "is-compact" : ""}
      style={compactIconStyle(presentation)}
      src={safeSrc}
      alt=""
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(event) => {
        const nextPresentation = isVectorIconReference(safeSrc)
          ? fullIconPresentation()
          : rasterIconPresentation(event.currentTarget);
        if (!nextPresentation) {
          setFailed(true);
          onStatus?.("failed");
          return;
        }
        setPresentation(nextPresentation);
        onStatus?.("ready");
      }}
      onError={() => {
        setFailed(true);
        onStatus?.("failed");
      }}
    />
  );
}

function FolderIconContent({ iconUrl, size }: { iconUrl?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const [presentation, setPresentation] = useState<IconPresentation>();
  useEffect(() => {
    setFailed(false);
    setPresentation(undefined);
  }, [iconUrl]);
  const safeIconUrl = normalizeIconReference(iconUrl);
  if (!safeIconUrl || safeIconUrl.startsWith("whynavo-icon:") || failed) return <Folder size={size} />;
  return (
    <img
      className={presentation?.mode === "compact" ? "is-compact" : ""}
      style={compactIconStyle(presentation)}
      src={safeIconUrl}
      alt=""
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(event) => {
        const nextPresentation = isVectorIconReference(safeIconUrl)
          ? fullIconPresentation()
          : rasterIconPresentation(event.currentTarget);
        if (nextPresentation) setPresentation(nextPresentation);
        else setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}

const searchEngines: Record<SearchEngine, { label: string; url: (query: string) => string }> = {
  baidu: {
    label: "百度",
    url: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
  },
  google: {
    label: "Google",
    url: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
  }
};

const searchEngineLabelFor = (language: UiLanguage, engine: SearchEngine) => (
  engine === "baidu" ? localized(language, "百度", "Baidu") : searchEngines[engine].label
);

const weatherCityOptions = [
  { value: "Shanghai", zh: "上海", en: "Shanghai" },
  { value: "Beijing", zh: "北京", en: "Beijing" },
  { value: "Shenzhen", zh: "深圳", en: "Shenzhen" },
  { value: "Guangzhou", zh: "广州", en: "Guangzhou" },
  { value: "Hangzhou", zh: "杭州", en: "Hangzhou" },
  { value: "Chengdu", zh: "成都", en: "Chengdu" },
  { value: "Chongqing", zh: "重庆", en: "Chongqing" },
  { value: "Wuhan", zh: "武汉", en: "Wuhan" },
  { value: "Xi'an", zh: "西安", en: "Xi'an" },
  { value: "Nanjing", zh: "南京", en: "Nanjing" },
  { value: "Suzhou", zh: "苏州", en: "Suzhou" },
  { value: "Hong Kong", zh: "香港", en: "Hong Kong" },
  { value: "Taipei", zh: "台北", en: "Taipei" },
  { value: "Tokyo", zh: "东京", en: "Tokyo" },
  { value: "Singapore", zh: "新加坡", en: "Singapore" },
  { value: "London", zh: "伦敦", en: "London" },
  { value: "Paris", zh: "巴黎", en: "Paris" },
  { value: "New York", zh: "纽约", en: "New York" },
  { value: "Los Angeles", zh: "洛杉矶", en: "Los Angeles" },
  { value: "Sydney", zh: "悉尼", en: "Sydney" }
] as const;

type CurrencyCode = "CNY" | "USD" | "JPY";

const currencyNames: Record<CurrencyCode, string> = {
  CNY: "人民币",
  USD: "美元",
  JPY: "日元"
};

const dailyQuotes = [
  { text: "先把桌面变成愿意打开的地方，再把事情慢慢放进去。", en: "Make your workspace inviting first, then add what matters." },
  { text: "好的工具不抢注意力，只把下一步放到手边。", en: "A good tool protects your attention and keeps the next step close." },
  { text: "今天只要推进一件真正重要的小事，就已经很赚。", en: "Moving one meaningful thing forward is enough for today." },
  { text: "主页不是展示柜，是每天第一个工作台。", en: "Your home page is a workspace, not a display case." },
  { text: "少一点入口焦虑，多一点顺手抵达。", en: "Fewer distracting entrances, more effortless arrivals." }
];

type WallpaperCategory = "精选" | "日系" | "动漫" | "猫咪" | "酷感";
type BuiltInWallpaper = { id: string; name: string; url: string; mobileUrl?: string; category: WallpaperCategory };

const featuredWallpapers: BuiltInWallpaper[] = [
  { id: "lucid-room", name: "通透工作室", url: "/wallpapers/photo/lucid-room.jpg", mobileUrl: "/wallpapers/photo/mobile/lucid-room.jpg", category: "精选" },
  { id: "coastal-glass", name: "冷雾海岸", url: "/wallpapers/photo/coastal-glass.jpg", mobileUrl: "/wallpapers/photo/mobile/coastal-glass.webp", category: "精选" },
  { id: "neon-rain", name: "雨夜霓虹", url: "/wallpapers/photo/neon-rain.jpg", mobileUrl: "/wallpapers/photo/mobile/neon-rain.webp", category: "精选" },
  { id: "aurora-lake", name: "极光山湖", url: "/wallpapers/photo/aurora-lake.jpg", mobileUrl: "/wallpapers/photo/mobile/aurora-lake.webp", category: "精选" },
  { id: "ocean-cliff", name: "清晨海崖", url: "/wallpapers/photo/ocean-cliff.jpg", mobileUrl: "/wallpapers/photo/mobile/ocean-cliff.webp", category: "精选" },
  { id: "midnight-silk", name: "午夜丝绸", url: "/wallpapers/midnight-silk.svg", category: "精选" },
  { id: "jade-mist", name: "青玉雾光", url: "/wallpapers/jade-mist.svg", category: "精选" },
  { id: "rose-dusk", name: "玫瑰暮色", url: "/wallpapers/rose-dusk.svg", category: "精选" },
  { id: "silver-ridge", name: "银岭微光", url: "/wallpapers/silver-ridge.svg", category: "精选" },
  { id: "sakura-canal", name: "樱川清晨", url: "/wallpapers/photo/sakura-canal.jpg", mobileUrl: "/wallpapers/photo/mobile/sakura-canal.jpg", category: "日系" },
  { id: "tatami-light", name: "榻榻米晨光", url: "/wallpapers/photo/tatami-light.jpg", mobileUrl: "/wallpapers/photo/mobile/tatami-light.jpg", category: "日系" },
  { id: "hydrangea-train", name: "紫阳花电车", url: "/wallpapers/photo/hydrangea-train.jpg", mobileUrl: "/wallpapers/photo/mobile/hydrangea-train.jpg", category: "日系" },
  { id: "hokkaido-fields", name: "北海道晴野", url: "/wallpapers/photo/hokkaido-fields.jpg", mobileUrl: "/wallpapers/photo/mobile/hokkaido-fields.jpg", category: "日系" },
  { id: "tokyo-laneway", name: "东京小巷", url: "/wallpapers/photo/tokyo-laneway.jpg", mobileUrl: "/wallpapers/photo/mobile/tokyo-laneway.jpg", category: "日系" },
  { id: "sky-platform", name: "云上站台", url: "/wallpapers/photo/sky-platform.jpg", mobileUrl: "/wallpapers/photo/mobile/sky-platform.jpg", category: "动漫" },
  { id: "future-bay", name: "未来海湾", url: "/wallpapers/photo/future-bay.jpg", mobileUrl: "/wallpapers/photo/mobile/future-bay.jpg", category: "动漫" },
  { id: "sunset-room", name: "黄昏房间", url: "/wallpapers/photo/sunset-room.jpg", mobileUrl: "/wallpapers/photo/mobile/sunset-room.jpg", category: "动漫" },
  { id: "floating-islands", name: "浮空群岛", url: "/wallpapers/photo/floating-islands.jpg", mobileUrl: "/wallpapers/photo/mobile/floating-islands.jpg", category: "动漫" },
  { id: "rainy-neon", name: "雨幕霓虹", url: "/wallpapers/photo/rainy-neon.jpg", mobileUrl: "/wallpapers/photo/mobile/rainy-neon.jpg", category: "动漫" },
  { id: "window-cat", name: "窗边白猫", url: "/wallpapers/photo/window-cat.jpg", mobileUrl: "/wallpapers/photo/mobile/window-cat.jpg", category: "猫咪" },
  { id: "meadow-cat", name: "花野橘猫", url: "/wallpapers/photo/meadow-cat.jpg", mobileUrl: "/wallpapers/photo/mobile/meadow-cat.jpg", category: "猫咪" },
  { id: "neon-black-cat", name: "霓虹黑猫", url: "/wallpapers/photo/neon-black-cat.jpg", mobileUrl: "/wallpapers/photo/mobile/neon-black-cat.jpg", category: "猫咪" },
  { id: "cozy-kittens", name: "暖毯幼猫", url: "/wallpapers/photo/cozy-kittens.jpg", mobileUrl: "/wallpapers/photo/mobile/cozy-kittens.jpg", category: "猫咪" },
  { id: "moon-cat", name: "月下猫影", url: "/wallpapers/photo/moon-cat.jpg", mobileUrl: "/wallpapers/photo/mobile/moon-cat.jpg", category: "猫咪" },
  { id: "black-roadster", name: "雨夜跑车", url: "/wallpapers/photo/black-roadster.jpg", mobileUrl: "/wallpapers/photo/mobile/black-roadster.jpg", category: "酷感" },
  { id: "coastal-rider", name: "海岸骑士", url: "/wallpapers/photo/coastal-rider.jpg", mobileUrl: "/wallpapers/photo/mobile/coastal-rider.jpg", category: "酷感" },
  { id: "monolith-city", name: "黑曜之城", url: "/wallpapers/photo/monolith-city.jpg", mobileUrl: "/wallpapers/photo/mobile/monolith-city.jpg", category: "酷感" },
  { id: "orbital-drift", name: "轨道漫游", url: "/wallpapers/photo/orbital-drift.jpg", mobileUrl: "/wallpapers/photo/mobile/orbital-drift.jpg", category: "酷感" },
  { id: "storm-ridge", name: "风暴山脊", url: "/wallpapers/photo/storm-ridge.jpg", mobileUrl: "/wallpapers/photo/mobile/storm-ridge.jpg", category: "酷感" }
];

const legacyWallpapers: BuiltInWallpaper[] = [
  { id: "sonoma-dawn", name: "晨雾", url: "/wallpapers/sonoma-dawn.svg", category: "精选" },
  { id: "aurora-tide", name: "极光", url: "/wallpapers/aurora-tide.svg", category: "精选" },
  { id: "glass-orchid", name: "兰紫", url: "/wallpapers/glass-orchid.svg", category: "精选" },
  { id: "sequoia-night", name: "暮林", url: "/wallpapers/sequoia-night.svg", category: "精选" }
];

const builtInWallpapers = [...featuredWallpapers, ...legacyWallpapers];

const dailyWallpaper = () => {
  const day = Math.floor(Date.now() / 86400000);
  return featuredWallpapers[day % featuredWallpapers.length];
};

const wallpaperById = (id?: string) => {
  return builtInWallpapers.find((wallpaper) => wallpaper.id === id) || builtInWallpapers[0];
};

const weatherToneForCode = (code?: number) => {
  if (code === 0) return "sunny";
  if (code === undefined) return "cloudy";
  if ([1, 2, 3].includes(code)) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloudy";
};

const weatherLabelFor = (code: number | undefined, language: UiLanguage) => {
  if (language === "zh-CN") return weatherLabel(code);
  if (code === undefined) return "Unknown";
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather";
};

const WeatherConditionIcon = ({ code, size = 22 }: { code?: number; size?: number }) => {
  const tone = weatherToneForCode(code);
  if (tone === "sunny") return <Sun size={size} />;
  if (tone === "rain") return <CloudRain size={size} />;
  if (tone === "snow") return <Snowflake size={size} />;
  if (tone === "storm") return <CloudLightning size={size} />;
  if (tone === "fog") return <CloudFog size={size} />;
  if (code === 1 || code === 2) return <CloudSun size={size} />;
  return <Cloud size={size} />;
};


const timeZoneLabels: Record<string, string> = {
  "Asia/Shanghai": "北京时间", "Asia/Hong_Kong": "香港时间", "Asia/Taipei": "台北时间",
  "Asia/Tokyo": "东京时间", "Asia/Seoul": "首尔时间", "Asia/Singapore": "新加坡时间",
  "America/Los_Angeles": "洛杉矶时间", "America/New_York": "纽约时间",
  "Europe/London": "伦敦时间", "Europe/Paris": "巴黎时间", "Australia/Sydney": "悉尼时间",
  UTC: "协调世界时"
};
const priorityTimeZones = Object.keys(timeZoneLabels);
const supportedTimeZones = (() => {
  try {
    const values = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf;
    return values ? values("timeZone") : priorityTimeZones;
  } catch { return priorityTimeZones; }
})();
const timeZoneOptions = Array.from(new Set([...priorityTimeZones, ...supportedTimeZones])).map((value) => ({
  value, label: timeZoneLabels[value] || value.replace(/_/g, " ")
}));
const priorityTimeZoneOptions = priorityTimeZones.map((value) => ({
  value,
  label: timeZoneLabels[value]
}));

const formatterFor = (timeZone: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("zh-CN", {
  timeZone,
  ...options
});

const chinaDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long"
});

const chinaMiniDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "long"
});

const chinaTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const calendarDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};

const calendarDateLabel = (key: string, language: UiLanguage = "zh-CN") => {
  const date = new Date(key + "T00:00:00");
  return date.toLocaleDateString(language, { month: "long", day: "numeric", weekday: "long" });
};

export default function App() {
  const [state, setState] = useState<AppState>(() => defaultState());
  const uiLanguage: UiLanguage = state.settings.language === "en-US" ? "en-US" : "zh-CN";
  const text = useCallback((zh: string, en: string) => localized(uiLanguage, zh, en), [uiLanguage]);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activePage, setActivePage] = useState<HomePage>("widgets");
  const [activeCustomPageId, setActiveCustomPageId] = useState<string | undefined>();
  const [pageMotion, setPageMotion] = useState<"up" | "down" | undefined>();
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | undefined>();
  const [editingFolder, setEditingFolder] = useState<ShortcutFolder | undefined>();
  const [openFolderId, setOpenFolderId] = useState<string | undefined>();
  const [shortcutMenu, setShortcutMenu] = useState<ShortcutMenuState>(null);
  const [folderMenu, setFolderMenu] = useState<FolderMenuState>(null);
  const [pageMenu, setPageMenu] = useState<PageMenuState>(null);
  const [widgetMenu, setWidgetMenu] = useState<WidgetMenuState>(null);
  const [searchText, setSearchText] = useState("");
  const [spaceSearchText, setSpaceSearchText] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [activeLayer, setActiveLayer] = useState("all");
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [shortcutRenderLimit, setShortcutRenderLimit] = useState(SHORTCUT_STABLE_RENDER_LIMIT);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [dragId, setDragId] = useState<string | undefined>();
  const [weather, setWeather] = useState<WeatherState | undefined>();
  const [rates, setRates] = useState<RatesState | undefined>();
  const [ratesMessage, setRatesMessage] = useState("正在加载汇率...");
  const [ratesRefreshing, setRatesRefreshing] = useState(false);
  const [weatherRefreshing, setWeatherRefreshing] = useState(false);
  const [sync, setSync] = useState<SyncStatus>({ message: "未登录", syncing: false });
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult>({ status: "idle" });
  const [toast, setToast] = useState("");
  const [toastAction, setToastAction] = useState<ToastAction | undefined>();
  const [undoLabel, setUndoLabel] = useState("");
  const [restoreAvailable, setRestoreAvailable] = useState(false);
  const [migrationBackupAvailable, setMigrationBackupAvailable] = useState(false);
  const [legacyStateAvailable, setLegacyStateAvailable] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [useCompactAssets, setUseCompactAssets] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  const stateRef = useRef(state);
  const readyRef = useRef(false);
  const activeUserIdRef = useRef<string | undefined>();
  const accountEpochRef = useRef(0);
  const syncLockRef = useRef<symbol | undefined>();
  const persistenceErrorShownRef = useRef(false);
  const undoSnapshotRef = useRef<AppState | undefined>();
  const lastSyncedUpdatedAtRef = useRef<string | undefined>();
  const toastTimerRef = useRef<number | undefined>();
  const navigationCloseTimerRef = useRef<number | undefined>();
  const passwordRecoveryRef = useRef(passwordRecovery);
  const recoveryLinkAttemptRef = useRef(hasPasswordRecoveryMarker());
  const signupVerificationRef = useRef(hasSignupVerificationMarker());
  const localAuthTransitionRef = useRef(false);
  const pendingOfflineUserRef = useRef<NonNullable<SyncStatus["user"]> | undefined>();
  const pendingOfflineActivationRef = useRef(false);
  const pendingAccountDeletionIdsRef = useRef<string[]>([]);
  const localStateChannelRef = useRef<BroadcastChannel | undefined>();
  const localStatePeerIdRef = useRef(uid());
  const shellRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.whynavoTheme = state.settings.theme;
    return () => {
      delete document.documentElement.dataset.whynavoTheme;
    };
  }, [state.settings.theme]);

  useEffect(() => {
    document.documentElement.lang = uiLanguage;
  }, [uiLanguage]);

  useEffect(() => {
    setShortcutMenu(null);
    setFolderMenu(null);
    setPageMenu(null);
    setWidgetMenu(null);
  }, [activePage, activeCustomPageId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (navigationCloseTimerRef.current) window.clearTimeout(navigationCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const persistBeforeExit = () => persistResolvedIconCache();
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") persistResolvedIconCache();
    };
    window.addEventListener("pagehide", persistBeforeExit);
    document.addEventListener("visibilitychange", persistWhenHidden);
    return () => {
      window.removeEventListener("pagehide", persistBeforeExit);
      document.removeEventListener("visibilitychange", persistWhenHidden);
      persistResolvedIconCache();
    };
  }, []);

  const openNavigation = () => {
    if (navigationDisplay !== "auto") return;
    if (navigationCloseTimerRef.current) window.clearTimeout(navigationCloseTimerRef.current);
    setNavigationOpen(true);
  };

  const scheduleNavigationClose = () => {
    if (navigationDisplay !== "auto") return;
    if (navigationCloseTimerRef.current) window.clearTimeout(navigationCloseTimerRef.current);
    navigationCloseTimerRef.current = window.setTimeout(() => {
      const navigationActive = document.querySelector(
        ".page-nav:hover, .page-nav:focus-within, .page-nav-auto-trigger:hover, .page-nav-auto-trigger:focus-visible"
      );
      if (!navigationActive) setNavigationOpen(false);
    }, 520);
  };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setUseCompactAssets(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const applyState = (next: AppState) => {
    setState(next);
    stateRef.current = next;
  };

  const isCurrentAccountOperation = (epoch: number, userId?: string) => (
    accountEpochRef.current === epoch && activeUserIdRef.current === userId
  );

  const resolvePendingAccountDeletionForVerifiedUser = async (verifiedUserId?: string) => {
    if (!verifiedUserId) return;
    try {
      await clearLocalDeletedAccountMarkerForVerifiedUser(verifiedUserId);
      if (pendingAccountDeletionIdsRef.current.includes(verifiedUserId)) {
        await clearLocalAccountDeletionPending(verifiedUserId);
        pendingAccountDeletionIdsRef.current = pendingAccountDeletionIdsRef.current
          .filter((pendingUserId) => pendingUserId !== verifiedUserId);
      }
    } catch {
      // Keep this account hidden until its marker can be cleared safely.
    }
  };

  const finishPendingAccountDeletionAfterTerminalAuth = async (candidateUserId?: string) => {
    const candidates = candidateUserId
      ? pendingAccountDeletionIdsRef.current.filter((pendingUserId) => pendingUserId === candidateUserId)
      : [...pendingAccountDeletionIdsRef.current];
    if (!candidates.length) return false;

    const results = await Promise.allSettled(candidates.map(cleanupDeletedAccountData));
    const completed = new Set(
      candidates.filter((_, index) => results[index]?.status === "fulfilled")
    );
    pendingAccountDeletionIdsRef.current = pendingAccountDeletionIdsRef.current
      .filter((pendingUserId) => !completed.has(pendingUserId));
    return completed.size > 0;
  };

  const syncRestoreKey = (userId = activeUserIdRef.current) => accountScopedKey(SYNC_RESTORE_KEY, userId);
  const migrationBackupKey = (userId = activeUserIdRef.current) => accountScopedKey(MIGRATION_BACKUP_KEY, userId);
  const broadcastLocalStateSaved = (userId = activeUserIdRef.current) => {
    localStateChannelRef.current?.postMessage({
      type: "state-saved",
      senderId: localStatePeerIdRef.current,
      userId: userId || null
    });
  };

  const refreshBackupAvailability = async (userId = activeUserIdRef.current, expectedEpoch?: number) => {
    const [syncBackup, migrationBackup] = await Promise.all([
      readKey(syncRestoreKey(userId)),
      readKey(migrationBackupKey(userId))
    ]);
    if (expectedEpoch !== undefined && accountEpochRef.current !== expectedEpoch) return;
    setRestoreAvailable(Boolean(syncBackup));
    setMigrationBackupAvailable(Boolean(migrationBackup));
  };

  const withCurrentServiceConfig = (next: AppState, source = stateRef.current) => ({
    ...next,
    settings: {
      ...next.settings,
      supabaseUrl: source.settings.supabaseUrl,
      supabaseAnonKey: source.settings.supabaseAnonKey
    }
  });

  const withDeviceLocalState = (next: AppState, source = stateRef.current) => ({
    ...next,
    settings: {
      ...next.settings,
      photoFrameImage: source.settings.photoFrameImage,
      photoFrameTitle: source.settings.photoFrameTitle,
      customWallpapers: source.settings.customWallpapers || [],
      wallpaper: source.settings.wallpaper?.startsWith("data:") ? source.settings.wallpaper : next.settings.wallpaper,
      wallpaperPreset: (source.settings.customWallpapers || []).some((item) => item.id === source.settings.wallpaperPreset)
        ? source.settings.wallpaperPreset
        : next.settings.wallpaperPreset,
      wallpaperCollection: Array.from(new Set([
        ...(next.settings.wallpaperCollection || []),
        ...(source.settings.customWallpapers || []).map((item) => item.id)
      ])),
      city: source.settings.city,
      weatherUseLocation: source.settings.weatherUseLocation,
      fieldUpdatedAt: {
        ...(next.settings.fieldUpdatedAt || {}),
        city: source.settings.fieldUpdatedAt?.city || source.settings.updatedAt || source.updatedAt,
        weatherUseLocation: source.settings.fieldUpdatedAt?.weatherUseLocation
          || source.settings.updatedAt
          || source.updatedAt
      }
    }
  });

  const transitionToAnonymousState = async (
    message: string,
    notification: string,
    options: { persistPrevious?: boolean } = {}
  ) => {
    const transitionEpoch = accountEpochRef.current + 1;
    const previousUserId = activeUserIdRef.current;
    const previousState = stateRef.current;
    accountEpochRef.current = transitionEpoch;

    if (previousUserId && options.persistPrevious !== false) {
      try {
        await mergeAndSaveStateForAccount(previousState, previousUserId);
        broadcastLocalStateSaved(previousUserId);
      } catch {
        if (accountEpochRef.current === transitionEpoch) accountEpochRef.current = transitionEpoch - 1;
        setSync((old) => ({
          ...old,
          syncing: false,
          message: "登录会话已失效，但本机数据尚未安全保存"
        }));
        showToast("登录会话已失效；为避免丢失数据，当前内容仍保留，请先导出完整备份");
        return false;
      }
    }
    if (accountEpochRef.current !== transitionEpoch) return false;

    activeUserIdRef.current = undefined;
    pendingOfflineUserRef.current = undefined;
    pendingOfflineActivationRef.current = false;
    setResolvedIconCacheScope();
    setWeather(undefined);
    syncLockRef.current = undefined;
    lastSyncedUpdatedAtRef.current = undefined;

    let anonymous: AppState;
    try {
      anonymous = normalizeState((await loadStateForAccount()).state);
    } catch {
      anonymous = normalizeState(defaultState());
      await saveStateForAccount(anonymous).catch(() => undefined);
    }
    if (!isCurrentAccountOperation(transitionEpoch, undefined)) return false;

    applyState(anonymous);
    await refreshBackupAvailability(undefined, transitionEpoch).catch(() => {
      setRestoreAvailable(false);
      setMigrationBackupAvailable(false);
    });
    if (!isCurrentAccountOperation(transitionEpoch, undefined)) return false;
    setSync({ user: null, syncing: false, autoSync: anonymous.sync.autoSync, message });
    showToast(notification);
    return true;
  };

  const handleTerminalAuthFailure = async (error: unknown, current: AppState) => {
    if (!isTerminalAuthError(error)) return false;
    const candidateUserId = activeUserIdRef.current || pendingOfflineUserRef.current?.id;
    const pendingDeletionFinished = await finishPendingAccountDeletionAfterTerminalAuth(candidateUserId);
    localAuthTransitionRef.current = true;
    try {
      await signOut(current.settings.supabaseUrl, current.settings.supabaseAnonKey).catch(() => undefined);
    } finally {
      localAuthTransitionRef.current = false;
    }
    await transitionToAnonymousState(
      pendingDeletionFinished ? "账号删除已完成" : "登录会话已失效",
      pendingDeletionFinished ? "账号删除已完成，本设备账号数据已清除" : "登录会话已失效，已切换到未登录数据",
      { persistPrevious: !pendingDeletionFinished }
    );
    return true;
  };

  const hasPortableLocalData = (target: AppState) => {
    const visible = <T extends { deletedAt?: string }>(items: T[]) => items.filter((item) => !item.deletedAt);
    const userNotes = visible(target.notes).filter((note) => note.title !== "随手笔记" || note.body !== "记录临时想法、链接或待整理的信息。");
    const userTodos = visible(target.todos).filter((todo) => todo.text !== "添加常用网站快捷方式" || todo.done);
    const userCountdowns = visible(target.countdowns).filter((countdown) => countdown.title !== "重要日期");
    const defaultSettings = defaultState().settings as unknown as Record<string, unknown>;
    const excludedSettings = new Set(["supabaseUrl", "supabaseAnonKey", "fieldUpdatedAt", "updatedAt"]);
    const settingsChanged = Object.entries(target.settings).some(([key, value]) => (
      !excludedSettings.has(key)
      && JSON.stringify(value) !== JSON.stringify(defaultSettings[key])
    ));
    return visible(target.shortcuts).length > 0
      || visible(target.shortcutFolders).length > 0
      || visible(target.shortcutGroups).some((group) => group.id !== "default" || group.name !== "常用")
      || userNotes.length > 0
      || userTodos.length > 0
      || userCountdowns.length > 0
      || Boolean(target.settings.quickNote?.trim())
      || Boolean(target.settings.photoFrameImage)
      || Boolean(target.settings.wallpaper)
      || Boolean(target.settings.customWallpapers?.length)
      || Boolean(Object.keys(target.settings.calendarRecords || {}).length)
      || settingsChanged;
  };

  const portableAnonymousState = (target: AppState) => ({
    ...target,
    todos: target.todos.filter((todo) => todo.deletedAt || todo.text !== "添加常用网站快捷方式" || todo.done),
    notes: target.notes.filter((note) => note.deletedAt || note.title !== "随手笔记" || note.body !== "记录临时想法、链接或待整理的信息。"),
    countdowns: target.countdowns.filter((countdown) => countdown.deletedAt || countdown.title !== "重要日期")
  });

  const activateSignedInUser = async (user: NonNullable<SyncStatus["user"]>, reason = "正在加载账号数据") => {
    const operationEpoch = accountEpochRef.current + 1;
    accountEpochRef.current = operationEpoch;
    const previousUserId = activeUserIdRef.current;
    const previousState = stateRef.current;
    const wasAnonymousSession = !previousUserId;
    const anonymousState = wasAnonymousSession ? portableAnonymousState(normalizeState(withCurrentServiceConfig(stateRef.current))) : undefined;
    const shouldCarryAnonymousData = Boolean(anonymousState && hasPortableLocalData(anonymousState));
    let localFallback: AppState | undefined;
    let localStateExisted = false;
    let anonymousAdopted = false;
    let finalAnonymousCommitRequired = false;
    let finalAnonymousCommitCompleted = false;
    let outgoingPersistenceFailed = false;
    setSync((old) => ({ ...old, syncing: true, message: reason }));
    try {
      await resolvePendingAccountDeletionForVerifiedUser(user.id);
      if (pendingAccountDeletionIdsRef.current.includes(user.id)) {
        throw new Error("无法确认此账号此前的删除请求，请检查浏览器存储权限后重试");
      }
      if (previousUserId && previousUserId !== user.id) {
        try {
          await mergeAndSaveStateForAccount(previousState, previousUserId);
          broadcastLocalStateSaved(previousUserId);
        } catch {
          outgoingPersistenceFailed = true;
          throw new Error("当前账号数据无法安全保存，请先导出备份并检查浏览器存储空间");
        }
        if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
      }
      setResolvedIconCacheScope(user.id);
      if (previousUserId !== user.id) setWeather(undefined);

      const local = await loadStateForAccount(user.id);
      localStateExisted = local.existed;
      if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
      if (local.recovered) showToast("检测到异常账号数据，原始内容已隔离保存，当前已使用安全数据继续同步");
      let next = normalizeState(withCurrentServiceConfig(local.state));
      localFallback = anonymousState && shouldCarryAnonymousData
        ? local.existed
          ? mergePortableStateIntoAccount(next, anonymousState)
          : adoptPortableStateForAccount(anonymousState, next)
        : next;
      if (shouldCarryAnonymousData) {
        await commitAnonymousStateAdoption(
          localFallback,
          user.id,
          normalizeState(defaultState())
        );
        anonymousAdopted = true;
        if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
      }
      const remote = await pullSnapshot(next, user.id);
      if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");

      if (remote) {
        const normalizedRemote = normalizeState(remote);
        if (local.existed) {
          next = mergeRemote(next, normalizedRemote);
        } else {
          next = markPulled(withCurrentServiceConfig({
            ...normalizedRemote,
            sync: {
              ...next.sync,
              lastRemoteUpdatedAt: normalizedRemote.updatedAt
            }
          }), normalizedRemote);
        }

        if (anonymousState && shouldCarryAnonymousData) {
          next = !local.existed && !hasPortableLocalData(normalizedRemote)
            ? adoptPortableStateForAccount(anonymousState, next)
            : mergePortableStateIntoAccount(next, anonymousState);
        }
      } else if (anonymousState && shouldCarryAnonymousData) {
        next = local.existed
          ? mergePortableStateIntoAccount(next, anonymousState)
          : adoptPortableStateForAccount(anonymousState, next);
      }

      if (!remote || local.existed || shouldCarryAnonymousData) {
        next = await synchronizeSnapshot(next, user.id);
        if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
      }

      await refreshBackupAvailability(user.id, operationEpoch);
      if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
      const syncedUpdatedAt = next.updatedAt;
      if (wasAnonymousSession && stateRef.current.updatedAt !== previousState.updatedAt) {
        const latestAnonymous = portableAnonymousState(normalizeState(withCurrentServiceConfig(stateRef.current)));
        next = mergePortableStateIntoAccount(next, latestAnonymous);
        finalAnonymousCommitRequired = true;
        await commitAnonymousStateAdoption(
          next,
          user.id,
          normalizeState(defaultState())
        );
        finalAnonymousCommitCompleted = true;
        localFallback = next;
        if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
      }
      const persistedNext = await mergeAndSaveStateForAccount(next, user.id);
      if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
      next = mergeLocalPeerState(next, persistedNext);
      broadcastLocalStateSaved(user.id);
      activeUserIdRef.current = user.id;
      pendingOfflineUserRef.current = undefined;
      lastSyncedUpdatedAtRef.current = syncedUpdatedAt;
      applyState(next);
      const accountWeather = await getCachedWeather(user.id).catch(() => undefined);
      if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
      setWeather(accountWeather);
      setSync({
        user,
        syncing: false,
        autoSync: next.sync?.autoSync,
        message: shouldCarryAnonymousData ? `已登录 ${user.email}，已合并本机未登录数据` : `已登录 ${user.email}`,
        lastSyncedAt: next.sync?.lastPushedAt || next.sync?.lastPulledAt || nowIso()
      });
      if (shouldRefreshExternalData(next, accountWeather, rates)) {
        window.setTimeout(() => void refreshExternalData(next), 250);
      }
      if (shouldCarryAnonymousData) showToast("已把未登录时的本机数据合并到当前账号");
      return next;
    } catch (error) {
      if (accountEpochRef.current === operationEpoch) {
        if (outgoingPersistenceFailed && previousUserId) {
          activeUserIdRef.current = previousUserId;
          pendingOfflineUserRef.current = user;
          setResolvedIconCacheScope(previousUserId);
          applyState(previousState);
          setSync((old) => ({
            ...old,
            user: null,
            syncing: false,
            autoSync: previousState.sync.autoSync,
            message: "账号切换已暂停；当前数据只保留在内存中，存储恢复后会重试"
          }));
          showToast("当前账号数据无法安全保存，已暂停切换；请立即导出完整备份");
          throw error;
        }
        if (error instanceof AuthAccountChangedError) {
          const changedUser = await getUser(previousState.settings.supabaseUrl, previousState.settings.supabaseAnonKey).catch(() => null);
          if (changedUser && changedUser.id !== user.id) {
            return activateSignedInUser(changedUser, "检测到登录账号变化，正在安全切换数据");
          }
          await transitionToAnonymousState("登录账号已变化", "登录账号已变化，已切换到未登录数据");
          throw new Error("登录账号已变化，请重新登录");
        }
        if (isTerminalAuthError(error)) {
          await handleTerminalAuthFailure(error, previousState);
          throw new Error("登录会话已失效，请重新登录");
        }
        if (
          localFallback
          && (!finalAnonymousCommitRequired || finalAnonymousCommitCompleted)
          && (localStateExisted || (shouldCarryAnonymousData && anonymousAdopted) || finalAnonymousCommitCompleted)
        ) {
          const fallbackState = localFallback;
          const persistedFallback = await mergeAndSaveStateForAccount(fallbackState, user.id).catch(() => fallbackState);
          localFallback = mergeLocalPeerState(fallbackState, persistedFallback);
          broadcastLocalStateSaved(user.id);
          activeUserIdRef.current = user.id;
          lastSyncedUpdatedAtRef.current = undefined;
          applyState(localFallback);
          const fallbackWeather = await getCachedWeather(user.id).catch(() => undefined);
          if (accountEpochRef.current !== operationEpoch) throw new Error("账号操作已取消");
          setWeather(fallbackWeather);
          await refreshBackupAvailability(user.id).catch(() => undefined);
          setSync({
            user,
            syncing: false,
            autoSync: localFallback.sync.autoSync,
            message: error instanceof Error
              ? `云端暂不可用，已安全加载本机账号数据：${error.message}`
              : "云端暂不可用，已安全加载本机账号数据"
          });
          showToast("云端连接暂不可用，当前仍使用此账号的本机数据，恢复网络后会自动重试");
          return localFallback;
        }
        const enteredNewAccount = previousUserId !== user.id;
        activeUserIdRef.current = enteredNewAccount ? undefined : previousUserId;
        if (enteredNewAccount) {
          syncLockRef.current = undefined;
          const anonymous = await loadStateForAccount();
          setResolvedIconCacheScope();
          applyState(normalizeState(anonymous.state));
          pendingOfflineUserRef.current = user;
          await refreshBackupAvailability().catch(() => undefined);
        }
        setSync((old) => ({
          ...(enteredNewAccount ? { user: null, autoSync: previousState.sync.autoSync } : old),
          syncing: false,
          message: enteredNewAccount
            ? "账号数据暂时无法安全加载，网络恢复后会自动重试"
            : error instanceof Error ? `账号数据加载失败：${error.message}` : "账号数据加载失败"
        }));
      }
      throw error;
    }
  };

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    let cancelled = false;
    const service = defaultState().settings;
    void getSupabase(service.supabaseUrl, service.supabaseAnonKey).then((client) => {
      if (!client || cancelled) return;
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          passwordRecoveryRef.current = true;
          setPasswordRecovery(true);
          setDialog("sync");
          showToast("密码重置链接已验证，请设置新密码");
          return;
        }
        if (localAuthTransitionRef.current || !readyRef.current) return;
        if (
          (event === "SIGNED_IN" || event === "USER_UPDATED")
          && session?.user
          && session.user.id !== activeUserIdRef.current
        ) {
          window.setTimeout(() => {
            if (
              cancelled
              || localAuthTransitionRef.current
              || !readyRef.current
              || session.user.id === activeUserIdRef.current
            ) return;
            void activateSignedInUser(session.user, "检测到登录账号变化，正在安全切换数据").catch(() => undefined);
          }, 0);
          return;
        }
        if (event !== "SIGNED_OUT" || (!activeUserIdRef.current && !pendingOfflineUserRef.current)) return;
        window.setTimeout(() => {
          if (cancelled) return;
          const candidateUserId = activeUserIdRef.current || pendingOfflineUserRef.current?.id;
          void (async () => {
            const pendingDeletionFinished = await finishPendingAccountDeletionAfterTerminalAuth(candidateUserId);
            await transitionToAnonymousState(
              pendingDeletionFinished ? "账号删除已完成" : "登录会话已失效",
              pendingDeletionFinished ? "账号删除已完成，本设备账号数据已清除" : "登录会话已失效，已切换到未登录数据",
              { persistPrevious: !pendingDeletionFinished }
            );
          })();
        }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pendingAccountDeletionIds = await readPendingLocalAccountDeletionIds();
      if (cancelled) return;
      pendingAccountDeletionIdsRef.current = pendingAccountDeletionIds;
      const hasLegacyState = await hasLegacyUnscopedState().catch(() => false);
      if (cancelled) return;
      setLegacyStateAvailable(hasLegacyState);
      const bootState = defaultState();
      let authVerifiedOnline = false;
      let user = await getCachedUser(bootState.settings.supabaseUrl, bootState.settings.supabaseAnonKey).catch(() => null);
      const cachedUserId = user?.id;
      if (navigator.onLine) {
        try {
          user = await getUser(bootState.settings.supabaseUrl, bootState.settings.supabaseAnonKey);
          authVerifiedOnline = true;
        } catch (error) {
          if (isTerminalAuthError(error)) {
            await finishPendingAccountDeletionAfterTerminalAuth(cachedUserId);
            user = null;
            authVerifiedOnline = true;
            await signOut(bootState.settings.supabaseUrl, bootState.settings.supabaseAnonKey).catch(() => undefined);
          }
          // Keep the cached account available only when Auth is temporarily unreachable.
        }
      }
      if (authVerifiedOnline && user) {
        await resolvePendingAccountDeletionForVerifiedUser(user.id);
      }
      let normalized: AppState;
      let recovered = false;
      let activatedOnline = false;
      let waitingForAccountRecovery = false;

      if (user && pendingAccountDeletionIdsRef.current.includes(user.id)) {
        pendingOfflineUserRef.current = user || undefined;
        waitingForAccountRecovery = true;
        activeUserIdRef.current = undefined;
        setResolvedIconCacheScope();
        const anonymousState = await loadStateForAccount();
        recovered = anonymousState.recovered;
        normalized = normalizeState(anonymousState.state);
        user = null;
        applyState(normalized);
      } else if (user && authVerifiedOnline) {
        const anonymousState = await loadStateForAccount();
        recovered = anonymousState.recovered;
        activeUserIdRef.current = undefined;
        applyState(normalizeState(anonymousState.state));
        try {
          normalized = await activateSignedInUser(
            user,
            signupVerificationRef.current ? "邮箱已验证，正在初始化账号数据" : "打开页面同步账号数据"
          );
          activatedOnline = true;
        } catch {
          user = null;
          normalized = stateRef.current;
          waitingForAccountRecovery = Boolean(pendingOfflineUserRef.current);
        }
      } else {
        const accountState = await loadStateForAccount(user?.id);
        if (user && !authVerifiedOnline && !accountState.existed) {
          pendingOfflineUserRef.current = user;
          waitingForAccountRecovery = true;
          activeUserIdRef.current = undefined;
          setResolvedIconCacheScope();
          const anonymousState = await loadStateForAccount();
          recovered = anonymousState.recovered;
          normalized = normalizeState(anonymousState.state);
          user = null;
          applyState(normalized);
        } else {
          activeUserIdRef.current = user?.id;
          setResolvedIconCacheScope(user?.id);
          recovered = accountState.recovered;
          normalized = normalizeState(accountState.state);
          applyState(normalized);
        }
      }

      readyRef.current = true;
      setReady(true);
      if (recovered) {
        showToast("检测到异常本机数据，原始内容已按当前账号隔离保存，当前已使用安全默认数据");
      }
      const cachedWeather = await getCachedWeather(activeUserIdRef.current);
      const cachedRates = await getCachedRates();
      setWeather(cachedWeather);
      setRates(cachedRates);
      if (cachedRates) setRatesMessage("已缓存");
      if (!activatedOnline) {
        await refreshBackupAvailability(activeUserIdRef.current);
        setSync((old) => ({
          ...old,
          user,
          autoSync: normalized.sync?.autoSync,
          message: waitingForAccountRecovery
            ? "离线，连接网络后恢复账号数据"
            : user ? `已登录 ${user.email}` : "未登录"
        }));
      }
      // This URL-derived marker only selects feedback after Auth and account activation complete.
      if (signupVerificationRef.current) {
        setDialog("sync");
        if (waitingForAccountRecovery) {
          showToast("邮箱验证会话已保存，连接网络后将完成账号数据加载");
        } else {
          showToast(user ? "邮箱验证成功，账号已登录并完成数据合并" : "邮箱验证链接无效或已过期，请重新注册或登录");
          clearAuthCallbackUrl();
          signupVerificationRef.current = false;
        }
      }
      // Recovery URL markers only select feedback; password changes still require a verified Auth session.
      if (passwordRecoveryRef.current) {
        setDialog("sync");
        showToast(waitingForAccountRecovery
          ? "密码重置会话已保存，连接网络后继续"
          : user ? "请设置新的 WhyNavo 登录密码" : "密码重置会话无效，请重新发送重置邮件");
        if (!user && !waitingForAccountRecovery) clearAuthCallbackUrl();
      } else if (recoveryLinkAttemptRef.current) {
        if (!waitingForAccountRecovery) {
          setDialog("sync");
          showToast("密码重置链接无效或已过期，请重新发送重置邮件");
          clearAuthCallbackUrl();
          recoveryLinkAttemptRef.current = false;
        }
      }
      if (shouldRefreshExternalData(normalized, cachedWeather, cachedRates)) {
        window.setTimeout(() => void refreshExternalData(normalized), 450);
      }
    })().catch((error) => {
      if (cancelled) return;
      const fallback = normalizeState(defaultState());
      accountEpochRef.current += 1;
      activeUserIdRef.current = undefined;
      setResolvedIconCacheScope();
      syncLockRef.current = undefined;
      lastSyncedUpdatedAtRef.current = undefined;
      applyState(fallback);
      readyRef.current = true;
      setReady(true);
      setSync({
        user: null,
        syncing: false,
        autoSync: false,
        message: "本机存储不可用，同步已暂停"
      });
      showToast(error instanceof Error
        ? `本机数据存储初始化失败：${error.message}`
        : "本机数据存储初始化失败，请检查浏览器存储权限");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel(LOCAL_STATE_CHANNEL);
    localStateChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{
      type?: unknown;
      senderId?: unknown;
      userId?: unknown;
    }>) => {
      const message = event.data;
      if (
        !readyRef.current
        || !["state-saved", "account-deleted", "account-signed-out"].includes(String(message?.type || ""))
        || typeof message.senderId !== "string"
        || message.senderId === localStatePeerIdRef.current
        || (message.userId !== null && typeof message.userId !== "string")
      ) return;
      const messageUserId = message.userId === null ? undefined : message.userId;
      const expectedEpoch = accountEpochRef.current;

      if (message.type === "account-signed-out" && messageUserId) {
        if (messageUserId !== activeUserIdRef.current) return;
        void transitionToAnonymousState(
          "已在本设备的另一个 WhyNavo 标签页退出",
          "本设备已退出账号，当前标签已切换到未登录数据"
        );
        return;
      }

      if (message.type === "account-deleted" && messageUserId) {
        void cleanupDeletedAccountData(messageUserId).catch(() => undefined);
        if (messageUserId !== activeUserIdRef.current) return;
        accountEpochRef.current = expectedEpoch + 1;
        activeUserIdRef.current = undefined;
        pendingOfflineUserRef.current = undefined;
        pendingOfflineActivationRef.current = false;
        syncLockRef.current = undefined;
        lastSyncedUpdatedAtRef.current = undefined;
        setResolvedIconCacheScope();
        setWeather(undefined);
        const blank = normalizeState(defaultState());
        applyState(blank);
        void saveStateForAccount(blank).catch(() => undefined);
        void refreshBackupAvailability(undefined, accountEpochRef.current).catch(() => {
          setRestoreAvailable(false);
          setMigrationBackupAvailable(false);
        });
        setSync({ user: null, syncing: false, autoSync: blank.sync.autoSync, message: "未登录" });
        setDialog(null);
        showToast("此账号已在另一个 WhyNavo 标签中删除，本机账号数据已清理");
        return;
      }

      if (messageUserId !== activeUserIdRef.current) return;

      void loadStateForAccount(messageUserId).then(({ state: stored }) => {
        if (!isCurrentAccountOperation(expectedEpoch, messageUserId)) return;
        const current = stateRef.current;
        const merged = mergeLocalPeerState(current, stored);
        if (localStatesEquivalent(current, merged)) return;
        applyState(merged);
      }).catch(() => undefined);
    };
    return () => {
      if (localStateChannelRef.current === channel) localStateChannelRef.current = undefined;
      channel.close();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const persistenceEpoch = accountEpochRef.current;
    const persistenceUserId = activeUserIdRef.current;
    void mergeAndSaveStateForAccount(state, persistenceUserId)
      .then((saved) => {
        if (!isCurrentAccountOperation(persistenceEpoch, persistenceUserId)) return;
        persistenceErrorShownRef.current = false;
        const current = stateRef.current;
        const merged = mergeLocalPeerState(current, saved);
        if (!localStatesEquivalent(current, merged)) applyState(merged);
        broadcastLocalStateSaved(persistenceUserId);
      })
      .catch(() => {
        if (!isCurrentAccountOperation(persistenceEpoch, persistenceUserId)) return;
        if (persistenceErrorShownRef.current) return;
        persistenceErrorShownRef.current = true;
        setToast("本机存储写入失败，最新修改尚未安全保存");
      });
    if (!state.sync?.autoSync || !state.settings.supabaseUrl || !state.settings.supabaseAnonKey) return;
    if (state.updatedAt === lastSyncedUpdatedAtRef.current) return;
    if (!navigator.onLine) return;
    const timer = window.setTimeout(() => {
      void performAutoSync("本地修改自动同步");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [state, ready]);

  useEffect(() => {
    if (!ready || !state.sync?.autoSync || !state.settings.supabaseUrl || !state.settings.supabaseAnonKey) return;
    const interval = window.setInterval(() => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      void performAutoSync("定时自动同步");
    }, Math.max(30, state.sync.intervalSeconds) * 1000);
    return () => window.clearInterval(interval);
  }, [ready, state.sync?.autoSync, state.sync?.intervalSeconds, state.settings.supabaseUrl, state.settings.supabaseAnonKey]);

  useEffect(() => {
    if (!pageMotion) return;
    const timer = window.setTimeout(() => setPageMotion(undefined), 320);
    return () => window.clearTimeout(timer);
  }, [pageMotion, activePage]);

  useEffect(() => {
    if (activePage !== "widgets" && layoutEditing) setLayoutEditing(false);
  }, [activePage, layoutEditing]);

  useEffect(() => {
    if (!layoutEditing) return;
    const finishEditing = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLayoutEditing(false);
      showToast(text("主页布局已保存", "Home layout saved"));
    };
    window.addEventListener("keydown", finishEditing);
    return () => window.removeEventListener("keydown", finishEditing);
  }, [layoutEditing, uiLanguage]);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      setClock(new Date());
      timer = window.setTimeout(schedule, 1000 - (Date.now() % 1000) + 8);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    void syncTaskReminders(state.todos, uiLanguage);
  }, [ready, state.todos, uiLanguage]);

  useEffect(() => {
    if (!ready) return;
    const check = () => checkWebTaskReminders(stateRef.current.todos, uiLanguage);
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [ready, uiLanguage]);

  const updateState = (updater: (state: AppState) => AppState) => {
    setState((current) => {
      const updatedAt = nowIso();
      const updated = updater(current);
      const next = {
        ...updated,
        settings: stampSettingsChanges(current.settings, updated.settings, updatedAt),
        updatedAt
      };
      stateRef.current = next;
      return next;
    });
  };

  const rememberUndo = (label: string) => {
    undoSnapshotRef.current = stateRef.current;
    setUndoLabel(label);
  };

  const undoLastChange = () => {
    const snapshot = undoSnapshotRef.current;
    if (!snapshot) return;
    const current = stateRef.current;
    const restored = stampStateSnapshot(
      current,
      normalizeState({ ...snapshot, sync: current.sync }),
      nowIso()
    );
    undoSnapshotRef.current = undefined;
    setUndoLabel("");
    applyState(restored);
    setToast("已撤销");
    setToastAction(undefined);
    window.setTimeout(() => setToast(""), 1800);
  };

  const refreshUser = async (target = state) => {
    const user = await getUser(target.settings.supabaseUrl, target.settings.supabaseAnonKey).catch(() => null);
    setSync((old) => ({ ...old, user, autoSync: target.sync?.autoSync, message: user ? `已登录 ${user.email}` : "未登录" }));
    return user;
  };

  const refreshExternalData = async (target = state, feedback = false) => {
    const requestEpoch = accountEpochRef.current;
    const requestUserId = activeUserIdRef.current;
    const stillCurrentAccount = () => isCurrentAccountOperation(requestEpoch, requestUserId);
    if (feedback) {
      showToast(text("正在刷新天气和汇率...", "Refreshing weather and exchange rates..."));
      setWeatherRefreshing(true);
      setRatesRefreshing(true);
      setRatesMessage(text("正在刷新...", "Refreshing..."));
    }

    const weatherTask = (async () => {
      const nextWeather = target.settings.weatherUseLocation
        ? await getDevicePosition()
          .then((position) => fetchWeatherByCoordinates(position.latitude, position.longitude, target.settings.city, requestUserId))
          .catch(() => fetchWeather(target.settings.city, requestUserId))
        : await fetchWeather(target.settings.city, requestUserId);
      if (!stillCurrentAccount()) return false;
      setWeather(nextWeather);
      return true;
    })().catch(async () => {
      const cached = await getCachedWeather(requestUserId).catch(() => undefined);
      if (cached && stillCurrentAccount()) setWeather(cached);
      return false;
    }).finally(() => {
      if (feedback) setWeatherRefreshing(false);
    });

    const ratesTask = (async () => {
      const nextRates = await fetchRates(target.settings.supabaseUrl, target.settings.supabaseAnonKey);
      if (!stillCurrentAccount()) return false;
      setRates(nextRates);
      setRatesMessage(nextRates.stale ? text("云端缓存", "Cloud cache") : text("已更新", "Updated"));
      return !nextRates.stale;
    })().catch(async (error) => {
      const cached = await getCachedRates().catch(() => undefined);
      if (cached && stillCurrentAccount()) {
        setRates(cached);
        if (feedback) setRatesMessage(text("已使用缓存", "Using cached data"));
      } else {
        setRatesMessage(error instanceof Error ? error.message : text("汇率暂时不可用", "Exchange rates are temporarily unavailable"));
      }
      return false;
    }).finally(() => {
      if (feedback) setRatesRefreshing(false);
    });

    const [weatherUpdated, ratesUpdated] = await Promise.all([weatherTask, ratesTask]);
    if (feedback && stillCurrentAccount()) {
      if (weatherUpdated && ratesUpdated) showToast("天气和汇率已刷新");
      else if (weatherUpdated || ratesUpdated) showToast("部分数据已刷新，另一项暂时不可用或已使用缓存");
      else showToast("刷新失败，已尽量使用本机缓存");
    }
  };

  const runUpdateCheck = useCallback(async (feedback = false) => {
    setUpdateCheck((old) => ({ status: "checking", checkedAt: old.checkedAt }));
    const result = await checkForUpdate();
    setUpdateCheck(result);
    const canRefreshHostedApp = window.location.origin === HOSTED_APP_ORIGIN;
    const updateAction = canRefreshHostedApp
      ? { label: "刷新更新", onClick: () => window.location.reload() }
      : result.status === "available" || result.status === "unsupported"
        ? {
            label: "获取更新",
            onClick: () => window.open(
              result.manifest.updateUrl || result.manifest.releaseNotesUrl || UPDATE_TARGET_URL,
              "_blank",
              "noopener,noreferrer"
            )
          }
        : undefined;
    if (feedback) {
      if (result.status === "available") {
        const instruction = canRefreshHostedApp ? "刷新后生效" : "请获取并重新加载发布包";
        showToast(
          result.critical
            ? `发现重要更新 ${result.manifest.latestVersion}，${instruction}`
            : `发现新版本 ${result.manifest.latestVersion}，${instruction}`,
          updateAction
        );
      }
      if (result.status === "current") showToast("当前已是最新版本");
      if (result.status === "unsupported") showToast("当前版本过旧，请先升级", updateAction);
      if (result.status === "error") showToast(result.message);
    } else if (result.status === "available" && canRefreshHostedApp) {
      showToast(`新版本 ${result.manifest.latestVersion} 已准备好`, updateAction);
    } else if (result.status === "available" && result.critical) {
      showToast(`发现重要更新 ${result.manifest.latestVersion}`, updateAction);
    } else if (result.status === "unsupported") {
      showToast("当前版本已停止云同步，请先升级", updateAction);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void runUpdateCheck(false), 1600);
    return () => window.clearTimeout(timer);
  }, [ready, runUpdateCheck]);

  const groups = useMemo(() => {
    return state.shortcutGroups.filter((group) => !group.deletedAt).sort((a, b) => a.order - b.order);
  }, [state.shortcutGroups]);

  const customNavPages = useMemo(() => {
    return (state.settings.customNavPages || [])
      .filter((page) => !page.deletedAt)
      .sort((a, b) => a.order - b.order);
  }, [state.settings.customNavPages]);

  const hiddenNavPages = useMemo<Set<Exclude<SystemNavPage, "widgets">>>(
    () => new Set(state.settings.hiddenNavPages || []),
    [state.settings.hiddenNavPages]
  );
  const navigationOrder = useMemo<SystemNavPage[]>(() => {
    const saved = state.settings.navigationOrder || [];
    return [
      ...saved.filter((page, index) => homePageOrder.includes(page) && saved.indexOf(page) === index),
      ...homePageOrder.filter((page) => !saved.includes(page))
    ];
  }, [state.settings.navigationOrder]);
  const visibleSystemPageOrder = useMemo(
    () => navigationOrder.filter((page) => page === "widgets" || !hiddenNavPages.has(page)),
    [hiddenNavPages, navigationOrder]
  );
  const systemNavLabel = useCallback((page: SystemNavPage) => (
    state.settings.navigationLabels?.[page]?.trim()
    || localized(uiLanguage, systemNavDefaults[page].title, systemNavDefaults[page].label)
  ), [state.settings.navigationLabels, uiLanguage]);
  const systemNavTitle = useCallback((page: SystemNavPage) => (
    localized(uiLanguage, systemNavDefaults[page].title, systemNavDefaults[page].label)
  ), [uiLanguage]);
  const systemNavDescription = useCallback((page: SystemNavPage) => (
    localized(uiLanguage, systemNavDefaults[page].description, systemNavEnglishDescriptions[page])
  ), [uiLanguage]);
  const systemNavIcon = useCallback((page: SystemNavPage) => (
    state.settings.navigationIcons?.[page] || systemNavDefaults[page].icon
  ), [state.settings.navigationIcons]);
  const navigationDisplay = state.settings.navigationDisplay === "auto" || state.settings.navigationDisplay === "hidden"
    ? state.settings.navigationDisplay
    : "always";
  const navigationSide = state.settings.navigationSide === "right" ? "right" : "left";
  remoteIconLookupEnabled = state.settings.remoteIconLookup ?? true;

  useEffect(() => {
    setNavigationOpen(false);
  }, [navigationDisplay, navigationSide]);

  const allShortcuts = useMemo(() => {
    return state.shortcuts.filter((shortcut) => !shortcut.deletedAt).sort((a, b) => a.order - b.order);
  }, [state.shortcuts]);

  const allFolders = useMemo(() => {
    return (state.shortcutFolders || []).filter((folder) => !folder.deletedAt).sort((a, b) => a.order - b.order);
  }, [state.shortcutFolders]);
  const liveFolderIds = useMemo(() => new Set(allFolders.map((folder) => folder.id)), [allFolders]);

  useEffect(() => {
    if (activeLayer === "all" || activeLayer === "pinned") return;
    const activeCustomPage = customNavPages.find((page) => page.id === activeCustomPageId);
    if (activeCustomPage?.groupId === activeLayer) return;
    if (!groups.some((group) => group.id === activeLayer)) setActiveLayer("all");
  }, [activeCustomPageId, activeLayer, customNavPages, groups]);

  useEffect(() => {
    if (!activeCustomPageId) return;
    if (customNavPages.some((page) => page.id === activeCustomPageId)) return;
    setActiveCustomPageId(undefined);
    setActiveLayer("all");
    setActivePage("widgets");
  }, [activeCustomPageId, customNavPages]);

  useEffect(() => {
    if (activeCustomPageId || activePage === "widgets" || !hiddenNavPages.has(activePage)) return;
    setActivePage("widgets");
  }, [activeCustomPageId, activePage, hiddenNavPages]);

  const visibleFolders = useMemo(() => {
    if (activeLayer === "pinned") return [];
    let sorted = allFolders;
    if (activeLayer !== "all") sorted = sorted.filter((folder) => folder.groupId === activeLayer);
    return sorted;
  }, [activeLayer, allFolders]);

  const shortcuts = useMemo(() => {
    let sorted = allShortcuts;
    if (activeLayer === "pinned") sorted = sorted.filter((shortcut) => shortcut.pinned);
    else if (activeLayer !== "all") sorted = sorted.filter((shortcut) => shortcut.groupId === activeLayer);
    return sorted.filter((shortcut) => !shortcut.folderId || !liveFolderIds.has(shortcut.folderId));
  }, [activeLayer, allShortcuts, liveFolderIds]);

  const shortcutTiles = useMemo(() => {
    const folderTiles = visibleFolders.map((folder) => {
      const firstChildOrder = allShortcuts
        .filter((shortcut) => shortcut.folderId === folder.id)
        .reduce((min, shortcut) => Math.min(min, shortcut.order), Number.POSITIVE_INFINITY);
      return {
        kind: "folder" as const,
        folder,
        order: Number.isFinite(firstChildOrder) ? firstChildOrder : folder.order
      };
    });
    const linkTiles = shortcuts.map((shortcut) => ({ kind: "shortcut" as const, shortcut, order: shortcut.order }));
    return [...folderTiles, ...linkTiles].sort((a, b) => a.order - b.order);
  }, [allShortcuts, shortcuts, visibleFolders]);
  const filteredShortcutTiles = useMemo(() => {
    const query = spaceSearchText.trim().toLocaleLowerCase(uiLanguage);
    if (!query) return shortcutTiles;
    return shortcutTiles.filter((item) => {
      if (item.kind === "shortcut") {
        return `${item.shortcut.title} ${item.shortcut.url}`.toLocaleLowerCase(uiLanguage).includes(query);
      }
      if (item.folder.name.toLocaleLowerCase(uiLanguage).includes(query)) return true;
      return allShortcuts.some((shortcut) => (
        shortcut.folderId === item.folder.id
        && `${shortcut.title} ${shortcut.url}`.toLocaleLowerCase(uiLanguage).includes(query)
      ));
    });
  }, [allShortcuts, shortcutTiles, spaceSearchText, uiLanguage]);
  const renderedShortcutTiles = useMemo(
    () => filteredShortcutTiles.length <= SHORTCUT_STABLE_RENDER_LIMIT
      ? filteredShortcutTiles
      : filteredShortcutTiles.slice(0, shortcutRenderLimit),
    [filteredShortcutTiles, shortcutRenderLimit]
  );
  useEffect(() => {
    setShortcutRenderLimit(SHORTCUT_STABLE_RENDER_LIMIT);
  }, [activeCustomPageId, activeLayer, spaceSearchText]);
  const homeShortcutTiles = useMemo(() => {
    const folderTiles = allFolders.map((folder) => {
      const firstChildOrder = allShortcuts
        .filter((shortcut) => shortcut.folderId === folder.id)
        .reduce((min, shortcut) => Math.min(min, shortcut.order), Number.POSITIVE_INFINITY);
      return {
        kind: "folder" as const,
        folder,
        order: Number.isFinite(firstChildOrder) ? firstChildOrder : folder.order
      };
    });
    const legacyLinkTiles = allShortcuts
      .filter((shortcut) => !shortcut.folderId || !liveFolderIds.has(shortcut.folderId))
      .map((shortcut) => ({ kind: "shortcut" as const, shortcut, order: shortcut.order }));
    const legacyTiles = [...folderTiles, ...legacyLinkTiles].sort((a, b) => a.order - b.order);
    if (!state.settings.homeSelectionInitialized) return legacyTiles.slice(0, 12);
    const selectedFolders = folderTiles.filter((item) => item.folder.homeVisible === true);
    const selectedLinks = allShortcuts
      .filter((shortcut) => shortcut.homeVisible === true)
      .map((shortcut) => ({ kind: "shortcut" as const, shortcut, order: shortcut.order }));
    return [...selectedFolders, ...selectedLinks].sort((a, b) => a.order - b.order).slice(0, 12);
  }, [allFolders, allShortcuts, liveFolderIds, state.settings.homeSelectionInitialized]);
  const openFolder = allFolders.find((folder) => folder.id === openFolderId);
  const folderShortcuts = useMemo(() => {
    if (!openFolderId) return [];
    return allShortcuts.filter((shortcut) => shortcut.folderId === openFolderId);
  }, [allShortcuts, openFolderId]);

  const pinned = useMemo(() => allShortcuts.filter((shortcut) => shortcut.pinned), [allShortcuts]);
  const activeCustomNavPage = customNavPages.find((page) => page.id === activeCustomPageId);
  const today = clock;
  const selectedTimeZone = state.settings.timeZone || "Asia/Shanghai";
  const selectedHour = Number(formatterFor(selectedTimeZone, { hour: "2-digit", hour12: false }).format(clock).replace(/\D/g, "")) % 24;
  const greetingLead = selectedHour < 6
    ? text("夜深了", "Good evening")
    : selectedHour < 12
      ? text("早上好", "Good morning")
      : selectedHour < 18
        ? text("下午好", "Good afternoon")
        : text("晚上好", "Good evening");
  const accountName = sync.user?.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  const homeGreeting = uiLanguage === "en-US"
    ? `${greetingLead}${accountName ? `, ${accountName}` : ""}.`
    : `${greetingLead}${accountName ? `，${accountName}` : ""}。`;
  const homeTime = new Intl.DateTimeFormat(uiLanguage, {
    timeZone: selectedTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(clock);
  const homeDate = new Intl.DateTimeFormat(uiLanguage, {
    timeZone: selectedTimeZone,
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(clock);

  const saveSyncRestorePoint = async (
    label: string,
    snapshotState = stateRef.current,
    userId = activeUserIdRef.current,
    expectedEpoch = accountEpochRef.current
  ) => {
    if (!isCurrentAccountOperation(expectedEpoch, userId)) throw new AuthAccountChangedError();
    await writeKey(syncRestoreKey(userId), { ownerId: userId, label, savedAt: nowIso(), state: snapshotState });
    if (isCurrentAccountOperation(expectedEpoch, userId)) setRestoreAvailable(true);
  };

  const restorePreviousSync = async () => {
    const restoreEpoch = accountEpochRef.current;
    const restoringUserId = activeUserIdRef.current;
    try {
      const snapshot = await readKey<{ ownerId?: string; label: string; savedAt: string; state: AppState }>(syncRestoreKey());
      if (!snapshot?.state || snapshot.ownerId !== restoringUserId) {
        showToast("还没有可回退的同步版本");
        setRestoreAvailable(false);
        return;
      }
      validateAppStatePayload(snapshot.state, "同步恢复点");
      const storedCurrent = await loadStateForAccount(restoringUserId);
      if (!isCurrentAccountOperation(restoreEpoch, restoringUserId)) return;
      const current = mergeLocalPeerState(stateRef.current, storedCurrent.state);
      const restored = stampStateSnapshot(
        current,
        normalizeState(withCurrentServiceConfig({ ...snapshot.state, sync: current.sync }, current)),
        nowIso()
      );
      const persisted = await mergeAndSaveStateForAccount(restored, restoringUserId);
      if (!isCurrentAccountOperation(restoreEpoch, restoringUserId)) return;
      const finalState = mergeLocalPeerState(restored, persisted);
      applyState(finalState);
      broadcastLocalStateSaved(restoringUserId);
      showToast(`已回到${new Date(snapshot.savedAt).toLocaleString("zh-CN")}的本机版本`);
    } catch (error) {
      if (!isCurrentAccountOperation(restoreEpoch, restoringUserId)) return;
      showToast(error instanceof Error ? `同步恢复失败：${error.message}` : "同步恢复失败，请重试");
    }
  };

  const restoreMigrationBackup = async () => {
    const restoreEpoch = accountEpochRef.current;
    const restoringUserId = activeUserIdRef.current;
    try {
      const backup = await readKey<StateBackup>(migrationBackupKey());
      if (!backup?.state || backup.ownerId !== restoringUserId) {
        showToast("没有可恢复的更新前备份");
        setMigrationBackupAvailable(false);
        return;
      }
      validateAppStatePayload(backup.state, "更新前备份");
      const storedCurrent = await loadStateForAccount(restoringUserId);
      if (!isCurrentAccountOperation(restoreEpoch, restoringUserId)) return;
      const current = mergeLocalPeerState(stateRef.current, storedCurrent.state);
      const restored = stampStateSnapshot(
        current,
        normalizeState(withCurrentServiceConfig({ ...backup.state, sync: current.sync }, current)),
        nowIso()
      );
      const persisted = await mergeAndSaveStateForAccount(restored, restoringUserId);
      if (!isCurrentAccountOperation(restoreEpoch, restoringUserId)) return;
      const finalState = mergeLocalPeerState(restored, persisted);
      applyState(finalState);
      broadcastLocalStateSaved(restoringUserId);
      showToast(`已回到${new Date(backup.savedAt).toLocaleString("zh-CN")}的更新前数据`);
    } catch (error) {
      if (!isCurrentAccountOperation(restoreEpoch, restoringUserId)) return;
      showToast(error instanceof Error ? `更新前备份恢复失败：${error.message}` : "更新前备份恢复失败，请重试");
    }
  };

  const performAutoSync = useCallback(async (reason: string) => {
    let current = stateRef.current;
    if (!current.settings.supabaseUrl || !current.settings.supabaseAnonKey || !current.sync?.autoSync) return;
    const expectedUserId = activeUserIdRef.current;
    if (!expectedUserId) return;
    const operationEpoch = accountEpochRef.current;
    if (syncLockRef.current) return;
    const syncOperation = Symbol("auto-sync");
    syncLockRef.current = syncOperation;
    setSync((old) => ({ ...old, syncing: true, message: reason }));
    try {
      const user = await getUser(current.settings.supabaseUrl, current.settings.supabaseAnonKey);
      if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) return;
      if (!user) {
        await transitionToAnonymousState("登录会话已失效", "登录会话已失效，已切换到未登录数据");
        return;
      }
      if (user.id !== expectedUserId) {
        await activateSignedInUser(user, "检测到登录账号变化，正在安全切换数据");
        return;
      }

      const persistedCurrent = await mergeAndSaveStateForAccount(current, expectedUserId);
      if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) return;
      current = mergeLocalPeerState(current, persistedCurrent);
      if (!localStatesEquivalent(stateRef.current, current)) applyState(current);
      broadcastLocalStateSaved(expectedUserId);

      let restorePointSaved = false;
      const saveAutoSyncRestorePoint = async () => {
        if (restorePointSaved) return;
        await saveSyncRestorePoint("自动同步前", current, expectedUserId, operationEpoch);
        restorePointSaved = true;
      };
      if (current.updatedAt !== lastSyncedUpdatedAtRef.current) {
        await saveAutoSyncRestorePoint();
      }
      const pushed = await synchronizeSnapshot(current, expectedUserId, 3, saveAutoSyncRestorePoint);
      if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) return;
      const reconciled = reconcileCompletedSync(current, pushed, stateRef.current);
      lastSyncedUpdatedAtRef.current = pushed.updatedAt;
      const persistedReconciled = await mergeAndSaveStateForAccount(reconciled, expectedUserId);
      if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) return;
      const finalState = mergeLocalPeerState(reconciled, persistedReconciled);
      applyState(finalState);
      broadcastLocalStateSaved(expectedUserId);
      setSync({
        user,
        syncing: false,
        autoSync: finalState.sync?.autoSync,
        message: finalState.updatedAt === pushed.updatedAt ? "已自动同步" : "本次同步完成，正在继续同步刚刚的新修改",
        lastSyncedAt: pushed.sync?.lastPushedAt || nowIso()
      });
    } catch (error) {
      if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) return;
      if (error instanceof AuthAccountChangedError) {
        const changedUser = await getUser(current.settings.supabaseUrl, current.settings.supabaseAnonKey).catch(() => null);
        if (changedUser) {
          await activateSignedInUser(changedUser, "检测到登录账号变化，正在安全切换数据").catch(() => undefined);
        } else {
          await transitionToAnonymousState("登录会话已失效", "登录会话已失效，已切换到未登录数据");
        }
        return;
      }
      if (await handleTerminalAuthFailure(error, current)) return;
      setSync((old) => ({
        ...old,
        syncing: false,
        message: error instanceof Error ? `自动同步失败：${error.message}` : "自动同步失败"
      }));
    } finally {
      if (syncLockRef.current === syncOperation) syncLockRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const resumeSync = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const pendingUser = pendingOfflineUserRef.current;
      if (pendingUser || pendingAccountDeletionIdsRef.current.length) {
        if (pendingOfflineActivationRef.current) return;
        pendingOfflineActivationRef.current = true;
        const current = stateRef.current;
        void getUser(current.settings.supabaseUrl, current.settings.supabaseAnonKey)
          .then(async (verifiedUser) => {
            if (!verifiedUser) {
              const pendingDeletionFinished = await finishPendingAccountDeletionAfterTerminalAuth(
                activeUserIdRef.current || pendingOfflineUserRef.current?.id
              );
              await transitionToAnonymousState(
                pendingDeletionFinished ? "账号删除已完成" : "登录会话已失效",
                pendingDeletionFinished ? "账号删除已完成，本设备账号数据已清除" : "登录会话已失效，请重新登录",
                { persistPrevious: !pendingDeletionFinished }
              );
              return;
            }
            if (pendingUser && pendingOfflineUserRef.current?.id !== pendingUser.id) return;
            await activateSignedInUser(verifiedUser, "网络已恢复，正在安全加载账号数据");
            // The verified Supabase user above is authoritative; this marker only selects feedback.
            if (signupVerificationRef.current) {
              setDialog("sync");
              showToast("邮箱验证成功，账号已登录并完成数据合并");
              clearAuthCallbackUrl();
              signupVerificationRef.current = false;
            }
            if (passwordRecoveryRef.current) {
              setDialog("sync");
              showToast("账号数据已恢复，请设置新的 WhyNavo 登录密码");
            }
          })
          .catch(async (error) => {
            if (isTerminalAuthError(error)) {
              await handleTerminalAuthFailure(error, stateRef.current);
              return;
            }
            setSync((old) => ({
              ...old,
              syncing: false,
              message: "账号数据暂时无法安全加载，网络恢复后会自动重试"
            }));
          })
          .finally(() => {
            pendingOfflineActivationRef.current = false;
          });
        return;
      }
      void performAutoSync("设备恢复后同步");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") resumeSync();
    };
    window.addEventListener("online", resumeSync);
    window.addEventListener("focus", resumeSync);
    document.addEventListener("visibilitychange", onVisibility);
    resumeSync();
    return () => {
      window.removeEventListener("online", resumeSync);
      window.removeEventListener("focus", resumeSync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [performAutoSync, ready]);

  const saveShortcut = (shortcut: Partial<Shortcut>) => {
    if ((shortcut.url || "").trim().length > MAX_URL_CHARS) {
      showToast("网站地址过长，请使用不超过 8192 个字符的地址");
      return;
    }
    const url = normalizeHttpUrl(shortcut.url || "");
    if (!url) {
      showToast("网站地址只支持 http:// 或 https://");
      return;
    }
    const title = shortcut.title?.trim() || "未命名";
    if (title.length > MAX_ENTITY_NAME_CHARS) {
      showToast("网站名称不能超过 1000 个字符");
      return;
    }
    const iconUrlProvided = Object.prototype.hasOwnProperty.call(shortcut, "iconUrl");
    const iconTextProvided = Object.prototype.hasOwnProperty.call(shortcut, "iconText");
    const suppliedIcon = shortcut.iconUrl?.trim();
    const normalizedIcon = suppliedIcon ? normalizeIconReference(suppliedIcon) : undefined;
    if (suppliedIcon && !normalizedIcon) {
      showToast("图标只支持 HTTP/HTTPS 地址、内置图标或上传的图片");
      return;
    }
    const normalizedIconText = normalizeShortcutIconText(shortcut.iconText);
    if (shortcut.iconText && !normalizedIconText) {
      showToast(text("文字图标需要填写 1–2 个字符", "Text icons require 1–2 characters"));
      return;
    }
    const isNewShortcut = !shortcut.id || !stateRef.current.shortcuts.some((item) => item.id === shortcut.id);
    const requestedHomePlacement = isNewShortcut && shortcut.homeVisible === true;
    const canPlaceOnHome = !requestedHomePlacement || homeShortcutTiles.length < 12;
    const legacyHomeShortcutIds = new Set(homeShortcutTiles.flatMap((item) => item.kind === "shortcut" ? [item.shortcut.id] : []));
    const legacyHomeFolderIds = new Set(homeShortcutTiles.flatMap((item) => item.kind === "folder" ? [item.folder.id] : []));
    if (isNewShortcut && stateRef.current.shortcuts.length >= MAX_ENTITY_RECORDS) {
      showToast("网站记录已达到 5000 条安全上限，请先导出备份并整理旧记录");
      return;
    }
    updateState((current) => {
      const updatedAt = nowIso();
      const existing = shortcut.id ? current.shortcuts.find((item) => item.id === shortcut.id) : undefined;
      const nextIconText = iconTextProvided ? normalizedIconText || undefined : existing?.iconText;
      const nextIconUrl = nextIconText
        ? undefined
        : iconUrlProvided
          ? normalizedIcon
          : existing?.iconUrl;
      const next: Shortcut = {
        ...existing,
        id: existing?.id || uid(),
        title,
        url,
        iconUrl: nextIconUrl,
        iconText: nextIconText,
        iconUpdatedAt: iconUrlProvided || iconTextProvided || shortcut.iconColor !== undefined
          ? updatedAt
          : existing?.iconUpdatedAt,
        iconColor: shortcut.iconColor || existing?.iconColor || colorFor(title),
        groupId: shortcut.groupId || existing?.groupId || current.shortcutGroups[0]?.id,
        folderId: shortcut.folderId === "" ? undefined : shortcut.folderId ?? existing?.folderId,
        pinned: Boolean(shortcut.pinned ?? existing?.pinned),
        order: existing?.order ?? current.shortcuts.length,
        homeVisible: requestedHomePlacement ? (canPlaceOnHome ? true : undefined) : shortcut.homeVisible ?? existing?.homeVisible,
        homeX: shortcut.homeX ?? existing?.homeX,
        homeY: shortcut.homeY ?? existing?.homeY,
        updatedAt
      };
      const initializeHomeSelection = requestedHomePlacement && canPlaceOnHome && !current.settings.homeSelectionInitialized;
      const shortcuts = existing
        ? current.shortcuts.map((item) => (item.id === next.id ? next : item))
        : [...current.shortcuts, next];
      return {
        ...current,
        shortcutFolders: initializeHomeSelection
          ? current.shortcutFolders.map((folder) => legacyHomeFolderIds.has(folder.id) ? { ...folder, homeVisible: true, updatedAt } : folder)
          : current.shortcutFolders,
        shortcuts: initializeHomeSelection
          ? shortcuts.map((item) => legacyHomeShortcutIds.has(item.id) || item.id === next.id ? { ...item, homeVisible: true, updatedAt } : item)
          : shortcuts,
        settings: initializeHomeSelection
          ? { ...current.settings, homeSelectionInitialized: true, updatedAt }
          : current.settings
      };
    });
    if (iconUrlProvided || iconTextProvided) {
      invalidateResolvedShortcutIcon(
        url,
        normalizedIconText ? undefined : normalizedIcon,
        title
      );
    }
    showToast(requestedHomePlacement && !canPlaceOnHome
      ? text("主页最多显示 12 个入口；网站已保存到空间。", "Home supports up to 12 entries. The site was saved to Spaces.")
      : shortcut.id
        ? text("网站与图标已保存", "Site and icon saved")
        : text("网站已添加", "Site added"));
    setDialog(null);
    setEditingShortcut(undefined);
  };

  const openNewShortcut = (groupId?: string, addToHome = false) => {
    setEditingShortcut({
      id: "",
      title: "",
      url: "",
      iconColor: "#14B8A6",
      groupId: groupId || groups[0]?.id,
      pinned: false,
      order: state.shortcuts.length,
      homeVisible: addToHome || undefined,
      updatedAt: nowIso()
    });
    setDialog("shortcut");
  };

  const deleteShortcut = (id: string) => {
    rememberUndo("删除网站");
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcuts: current.shortcuts.map((item) =>
        item.id === id ? { ...item, pinned: false, deletedAt, updatedAt: deletedAt } : item
      )
    }));
    setShortcutMenu(null);
    showToast("已删除网站");
  };

  const saveFolder = (folder: Partial<ShortcutFolder>) => {
    const name = folder.name?.trim() || "未命名文件夹";
    if (name.length > MAX_ENTITY_NAME_CHARS) {
      showToast("文件夹名称不能超过 1000 个字符");
      return;
    }
    const suppliedIcon = folder.iconUrl?.trim();
    const normalizedIcon = suppliedIcon ? normalizeIconReference(suppliedIcon) : undefined;
    if (suppliedIcon && !normalizedIcon) {
      showToast("文件夹图片只支持 HTTP/HTTPS 地址或上传的图片");
      return;
    }
    const isNewFolder = !folder.id || !stateRef.current.shortcutFolders.some((item) => item.id === folder.id);
    if (isNewFolder && stateRef.current.shortcutFolders.length >= MAX_ENTITY_RECORDS) {
      showToast("文件夹记录已达到 5000 条安全上限，请先导出备份并整理旧记录");
      return;
    }
    updateState((current) => {
      const updatedAt = nowIso();
      const existing = folder.id ? current.shortcutFolders?.find((item) => item.id === folder.id) : undefined;
      const next: ShortcutFolder = {
        ...existing,
        id: existing?.id || uid(),
        name,
        groupId: folder.groupId || existing?.groupId || current.shortcutGroups[0]?.id,
        iconUrl: folder.iconUrl !== undefined ? normalizedIcon : existing?.iconUrl,
        iconColor: folder.iconColor || existing?.iconColor || colorFor(name),
        order: existing?.order ?? (current.shortcutFolders || []).length,
        homeVisible: folder.homeVisible ?? existing?.homeVisible,
        homeX: folder.homeX ?? existing?.homeX,
        homeY: folder.homeY ?? existing?.homeY,
        updatedAt
      };
      return {
        ...current,
        shortcutFolders: existing
          ? current.shortcutFolders.map((item) => (item.id === next.id ? next : item))
          : [...(current.shortcutFolders || []), next]
      };
    });
    showToast(folder.id ? text("文件夹与图标已保存", "Folder and icon saved") : text("文件夹已创建", "Folder created"));
    setDialog(null);
    setEditingFolder(undefined);
  };

  const openNewFolder = (groupId?: string) => {
    setEditingFolder({
      id: "",
      name: "",
      groupId: groupId || groups[0]?.id,
      iconColor: "#14B8A6",
      order: state.shortcutFolders.length,
      updatedAt: nowIso()
    });
    setDialog("folder");
  };

  const deleteFolder = (id: string) => {
    const folder = allFolders.find((item) => item.id === id);
    if (!folder) return;
    const count = allShortcuts.filter((shortcut) => shortcut.folderId === id).length;
    const confirmed = window.confirm(count ? `删除文件夹“${folder.name}”？其中 ${count} 个网站会移回当前分类。` : `删除文件夹“${folder.name}”？`);
    if (!confirmed) return;
    rememberUndo("删除文件夹");
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcutFolders: (current.shortcutFolders || []).map((item) =>
        item.id === id ? { ...item, deletedAt, updatedAt: deletedAt } : item
      ),
      shortcuts: current.shortcuts.map((shortcut) =>
        shortcut.folderId === id ? { ...shortcut, folderId: undefined, updatedAt: deletedAt } : shortcut
      )
    }));
    setOpenFolderId(undefined);
    setEditingFolder(undefined);
    showToast("已删除文件夹");
  };

  const toggleHomeTile = (tile: HomeTileRef) => {
    const selected = new Set<HomeTileRef>(homeShortcutTiles.map((item) => (
      item.kind === "folder" ? `folder:${item.folder.id}` as HomeTileRef : `shortcut:${item.shortcut.id}` as HomeTileRef
    )));
    const removing = selected.has(tile);
    if (!removing && selected.size >= 12) {
      showToast(text("主页最多显示 12 个入口，请先移除一个。", "Home supports up to 12 entries. Remove one first."));
      setShortcutMenu(null);
      setFolderMenu(null);
      return;
    }
    if (removing) selected.delete(tile);
    else selected.add(tile);
    const updatedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcuts: current.shortcuts.map((item) => {
        const shouldShow = selected.has(`shortcut:${item.id}`);
        if (shouldShow === (item.homeVisible === true)) return item;
        return { ...item, homeVisible: shouldShow || undefined, updatedAt };
      }),
      shortcutFolders: current.shortcutFolders.map((folder) => {
        const shouldShow = selected.has(`folder:${folder.id}`);
        if (shouldShow === (folder.homeVisible === true)) return folder;
        return { ...folder, homeVisible: shouldShow || undefined, updatedAt };
      }),
      settings: { ...current.settings, homeSelectionInitialized: true, updatedAt }
    }));
    setShortcutMenu(null);
    setFolderMenu(null);
    showToast(removing ? text("已从主页移除", "Removed from Home") : text("已添加到主页", "Added to Home"));
  };

  const addGroup = () => {
    const name = window.prompt("分类名称");
    if (!name?.trim()) return;
    const label = name.trim();
    if (label.length > MAX_ENTITY_NAME_CHARS) {
      showToast("分类名称不能超过 1000 个字符");
      return;
    }
    if (stateRef.current.shortcutGroups.length >= MAX_ENTITY_RECORDS) {
      showToast("分类记录已达到 5000 条安全上限，请先导出备份并整理旧记录");
      return;
    }
    updateState((current) => {
      const existing = current.shortcutGroups.find((group) => !group.deletedAt && group.name.toLowerCase() === label.toLowerCase());
      if (existing) return current;
      const nextGroup = {
        id: uid(),
        name: label,
        color: colorFor(label),
        order: current.shortcutGroups.filter((group) => !group.deletedAt).length,
        updatedAt: nowIso()
      };
      window.setTimeout(() => setActiveLayer(nextGroup.id), 0);
      return { ...current, shortcutGroups: [...current.shortcutGroups, nextGroup] };
    });
  };

  const renameGroup = (id: string) => {
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    const name = window.prompt("新的分类名称", group.name);
    if (!name?.trim()) return;
    const label = name.trim();
    if (label.length > MAX_ENTITY_NAME_CHARS) {
      showToast("分类名称不能超过 1000 个字符");
      return;
    }
    updateState((current) => ({
      ...current,
      shortcutGroups: current.shortcutGroups.map((item) =>
        item.id === id ? { ...item, name: label, color: item.color || colorFor(label), updatedAt: nowIso() } : item
      )
    }));
  };

  const deleteGroup = (id: string) => {
    const liveGroups = groups.filter((group) => group.id !== id);
    if (!liveGroups.length) {
      window.alert("至少保留一个分类");
      return;
    }
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    const count = allShortcuts.filter((shortcut) => shortcut.groupId === id).length;
    const linkedPageCount = customNavPages.filter((page) => page.groupId === id).length;
    const pageNotice = linkedPageCount ? "，关联的自定义页面入口也会删除" : "";
    const confirmed = window.confirm(count
      ? `删除“${group.name}”？其中 ${count} 个网站会移动到“${liveGroups[0].name}”${pageNotice}。`
      : `删除“${group.name}”${pageNotice}？`);
    if (!confirmed) return;
    rememberUndo("删除分类");
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcutGroups: current.shortcutGroups.map((item) =>
        item.id === id ? { ...item, deletedAt, updatedAt: deletedAt } : item
      ),
      shortcuts: current.shortcuts.map((shortcut) =>
        shortcut.groupId === id ? { ...shortcut, groupId: liveGroups[0].id, updatedAt: deletedAt } : shortcut
      ),
      shortcutFolders: (current.shortcutFolders || []).map((folder) =>
        folder.groupId === id ? { ...folder, groupId: liveGroups[0].id, updatedAt: deletedAt } : folder
      ),
      settings: {
        ...current.settings,
        customNavPages: (current.settings.customNavPages || []).map((page) =>
          page.groupId === id && !page.deletedAt ? { ...page, deletedAt, updatedAt: deletedAt } : page
        ),
        updatedAt: deletedAt
      }
    }));
    if (activeLayer === id) setActiveLayer(liveGroups[0].id);
    showToast("已删除分类");
  };

  const addCustomNavPage = (name: string, icon: CustomNavPageIcon) => {
    const label = name.trim();
    if (!label) return;
    if (
      stateRef.current.shortcutGroups.length >= MAX_ENTITY_RECORDS
      || (stateRef.current.settings.customNavPages || []).length >= MAX_ENTITY_RECORDS
    ) {
      showToast("页面或分类记录已达到 5000 条安全上限，请先导出备份并整理旧记录");
      return;
    }
    if (customNavPages.some((page) => page.name.toLowerCase() === label.toLowerCase())) {
      showToast("已经有同名页面");
      return;
    }
    const pageId = uid();
    const groupId = uid();
    const updatedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcutGroups: [
        ...current.shortcutGroups,
        {
          id: groupId,
          name: label,
          color: colorFor(label),
          order: current.shortcutGroups.filter((group) => !group.deletedAt).length,
          updatedAt
        }
      ],
      settings: {
        ...current.settings,
        customNavPages: [
          ...(current.settings.customNavPages || []),
          { id: pageId, name: label, groupId, icon, order: (current.settings.customNavPages || []).filter((page) => !page.deletedAt).length, updatedAt }
        ],
        updatedAt
      }
    }));
    setActiveCustomPageId(pageId);
    setActiveLayer(groupId);
    setActivePage("shortcuts");
    setDialog(null);
    showToast(`已创建“${label}”页面`);
  };

  const deleteCustomNavPage = (page: CustomNavPage) => {
    const confirmed = window.confirm(`从导航删除“${page.name}”？其中的网站和分类会继续保留。`);
    if (!confirmed) return;
    rememberUndo("删除导航页面");
    const deletedAt = nowIso();
    const remainingPageOrder = new Map(
      customNavPages
        .filter((candidate) => candidate.id !== page.id)
        .map((candidate, order) => [candidate.id, order])
    );
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        customNavPages: (current.settings.customNavPages || [])
          .map((item) => {
            if (item.id === page.id) return { ...item, deletedAt, updatedAt: deletedAt };
            if (item.deletedAt) return item;
            const order = remainingPageOrder.get(item.id);
            return order === undefined || order === item.order ? item : { ...item, order, updatedAt: deletedAt };
          }),
        updatedAt: deletedAt
      }
    }));
    if (activeCustomPageId === page.id) {
      setActiveCustomPageId(undefined);
      setActiveLayer("all");
      setActivePage("widgets");
    }
    showToast("页面入口已删除，原有网站仍保留");
  };

  const updateCustomNavPage = (page: CustomNavPage, name: string, icon: CustomNavPageIcon) => {
    const label = name.trim().slice(0, 24);
    if (!label) return;
    const updatedAt = nowIso();
    updateState((current) => ({
      ...current,
      shortcutGroups: current.shortcutGroups.map((group) => (
        group.id === page.groupId && !group.deletedAt
          ? { ...group, name: label, updatedAt }
          : group
      )),
      settings: {
        ...current.settings,
        customNavPages: (current.settings.customNavPages || []).map((item) => (
          item.id === page.id ? { ...item, name: label, icon, updatedAt } : item
        )),
        updatedAt
      }
    }));
    showToast("页面入口已更新");
  };

  const moveCustomNavPage = (page: CustomNavPage, direction: -1 | 1) => {
    const livePages = [...customNavPages];
    const from = livePages.findIndex((item) => item.id === page.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= livePages.length) return;
    [livePages[from], livePages[to]] = [livePages[to], livePages[from]];
    const orderById = new Map(livePages.map((item, order) => [item.id, order]));
    const updatedAt = nowIso();
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        customNavPages: (current.settings.customNavPages || []).map((item) => (
          item.deletedAt || !orderById.has(item.id)
            ? item
            : { ...item, order: orderById.get(item.id)!, updatedAt }
        )),
        updatedAt
      }
    }));
  };

  const updateSystemNavPage = (page: SystemNavPage, name: string, icon: CustomNavPageIcon) => {
    const label = name.trim().slice(0, 24);
    if (!label) return;
    const updatedAt = nowIso();
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        navigationLabels: { ...(current.settings.navigationLabels || {}), [page]: label },
        navigationIcons: { ...(current.settings.navigationIcons || {}), [page]: icon },
        updatedAt
      }
    }));
    showToast("导航入口已更新");
  };

  const moveSystemNavPage = (page: SystemNavPage, direction: -1 | 1) => {
    const order = [...navigationOrder];
    const from = order.indexOf(page);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    updateState((current) => ({
      ...current,
      settings: { ...current.settings, navigationOrder: order, updatedAt: nowIso() }
    }));
  };

  const toggleSystemNavPage = (page: Exclude<SystemNavPage, "widgets">) => {
    const currentlyHidden = hiddenNavPages.has(page);
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        hiddenNavPages: currentlyHidden
          ? (current.settings.hiddenNavPages || []).filter((item) => item !== page)
          : Array.from(new Set([...(current.settings.hiddenNavPages || []), page])),
        updatedAt: nowIso()
      }
    }));
    if (!currentlyHidden && activePage === page && !activeCustomPageId) {
      setActivePage("widgets");
      setActiveLayer("all");
    }
  };

  const moveShortcut = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    rememberUndo("调整网站顺序");
    updateState((current) => {
      const list = [...current.shortcuts].sort((a, b) => a.order - b.order);
      const from = list.findIndex((item) => item.id === dragId);
      const to = list.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      const updatedAt = nowIso();
      return {
        ...current,
        shortcuts: list.map((item, order) => item.order === order ? item : { ...item, order, updatedAt })
      };
    });
  };

  const moveHomeTile = (tile: HomeTileRef, x: number, y: number) => {
    const [kind, id] = tile.split(":") as ["shortcut" | "folder", string];
    if (!id || (kind !== "shortcut" && kind !== "folder")) return;
    rememberUndo("调整主页位置");
    const homeX = Math.max(0, Math.min(1, x));
    const homeY = Math.max(0, Math.min(1, y));
    const updatedAt = nowIso();
    updateState((current) => kind === "folder"
      ? {
          ...current,
          shortcutFolders: (current.shortcutFolders || []).map((folder) => (
            folder.id === id ? { ...folder, homeX, homeY, updatedAt } : folder
          ))
        }
      : {
          ...current,
          shortcuts: current.shortcuts.map((shortcut) => (
            shortcut.id === id ? { ...shortcut, homeX, homeY, updatedAt } : shortcut
          ))
        });
  };

  const exportData = () => {
    const backupState = prepareCompleteBackupState(stateRef.current);
    downloadJson(`whynavo-backup-${new Date().toISOString().slice(0, 10)}.json`, {
      source: "whynavo-backup",
      version: 1,
      exportedAt: nowIso(),
      appVersion: APP_VERSION,
      dataSchemaVersion: DATA_SCHEMA_VERSION,
      state: backupState
    });
    showToast("已导出完整本地备份");
  };

  const importBackup = async (file: File) => {
    if (file.size > MAX_BACKUP_IMPORT_BYTES) {
      throw new Error("备份文件超过 64 MB，请检查是否选择了正确文件");
    }
    let backupText: string;
    try {
      backupText = await file.text();
    } catch {
      throw new Error("备份文件读取失败，请重新选择文件");
    }
    let parsed: { source?: unknown; state?: unknown };
    try {
      parsed = JSON.parse(backupText) as { source?: unknown; state?: unknown };
    } catch {
      throw new Error("备份文件不是有效的 JSON 文件");
    }
    if (parsed.source !== "whynavo-backup" || !parsed.state) {
      throw new Error("这不是有效的 WhyNavo 完整备份文件");
    }
    validateAppStatePayload(parsed.state, "备份数据");
    if ((parsed.state.dataSchemaVersion || 1) > DATA_SCHEMA_VERSION) {
      throw new Error("备份来自更新版本，请先升级 WhyNavo");
    }
    const importEpoch = accountEpochRef.current;
    const importingUserId = activeUserIdRef.current;
    const storedCurrent = await loadStateForAccount(importingUserId);
    if (!isCurrentAccountOperation(importEpoch, importingUserId)) {
      throw new Error("账号已发生变化，备份未应用到当前页面");
    }
    const current = mergeLocalPeerState(stateRef.current, storedCurrent.state);
    const imported = restoreCompleteBackupForDevice(parsed.state, current);
    const restored = stampStateSnapshot(current, imported, nowIso());
    const persisted = await mergeAndSaveStateForAccount(restored, importingUserId);
    if (!isCurrentAccountOperation(importEpoch, importingUserId)) {
      throw new Error("账号已发生变化，备份未应用到当前页面");
    }
    const finalState = mergeLocalPeerState(restored, persisted);
    applyState(finalState);
    broadcastLocalStateSaved(importingUserId);
    showToast("完整备份已恢复；登录状态和当前设备信息保持不变");
  };

  const showToast = (message: string, action?: ToastAction) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    setToastAction(action);
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      setToastAction(undefined);
    }, action ? 10000 : 2400);
  };

  const currentSearchEngine = state.settings.searchEngine || "baidu";
  const toggleSearchEngine = () => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        searchEngine: (current.settings.searchEngine || "baidu") === "baidu" ? "google" : "baidu"
      }
    }));
  };
  const runSearch = () => {
    const text = searchText.trim();
    if (!text) return;
    window.open(searchEngines[currentSearchEngine].url(text), "_blank", "noopener,noreferrer");
  };

  const chooseTimeZone = (timeZone: string) => {
    const zone = timeZoneOptions.find((item) => item.value === timeZone) || timeZoneOptions[0];
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        timeZone: zone.value,
        updatedAt: nowIso()
      }
    }));
    setDialog(null);
    showToast(`已切换到${zone.label}`);
  };

  const setWidgetEnabled = (key: WidgetKey, enabled: boolean) => {
    rememberUndo(enabled ? "显示小组件" : "隐藏小组件");
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgets: { ...current.settings.widgets, [key]: enabled },
        updatedAt: nowIso()
      }
    }));
  };

  const setWidgetSize = (key: WidgetKey, size: WidgetSize) => {
    rememberUndo("调整组件尺寸");
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgetSizes: { ...defaultWidgetSizes, ...(current.settings.widgetSizes || {}), [key]: size },
        updatedAt: nowIso()
      }
    }));
  };

  const widgetOrder = useMemo(() => {
    const seen = new Set<WidgetKey>();
    const saved = state.settings.widgetOrder || [];
    const result = [...saved, ...defaultWidgetOrder].filter((key): key is WidgetKey => {
      if (!defaultWidgetOrder.includes(key as WidgetKey) || seen.has(key as WidgetKey)) return false;
      seen.add(key as WidgetKey);
      return true;
    });
    return result;
  }, [state.settings.widgetOrder]);

  const reorderWidget = (source?: WidgetKey, target?: WidgetKey) => {
    if (!source || !target || source === target) return;
    rememberUndo("调整组件顺序");
    updateState((current) => {
      const order = [...(current.settings.widgetOrder || defaultWidgetOrder)];
      defaultWidgetOrder.forEach((key) => { if (!order.includes(key)) order.push(key); });
      const from = order.indexOf(source);
      const to = order.indexOf(target);
      if (from < 0 || to < 0) return current;
      const [item] = order.splice(from, 1);
      order.splice(to, 0, item);
      return {
        ...current,
        settings: {
          ...current.settings,
          widgetOrder: order,
          updatedAt: nowIso()
        }
      };
    });
  };

  const rotateMainWallpaper = () => {
    updateState((current) => {
      const currentId = current.settings.wallpaperPreset || builtInWallpapers[0].id;
      const index = builtInWallpapers.findIndex((wallpaper) => wallpaper.id === currentId);
      const next = builtInWallpapers[(index + 1 + builtInWallpapers.length) % builtInWallpapers.length];
      return {
        ...current,
        settings: {
          ...current.settings,
          wallpaper: undefined,
          wallpaperPreset: next.id,
          wallpaperRotation: false,
          updatedAt: nowIso()
        }
      };
    });
    showToast("已切换壁纸");
  };


  const showWidgetMenu = (x: number, y: number, widgetKey?: WidgetKey) => {
    setShortcutMenu(null);
    setFolderMenu(null);
    setPageMenu(null);
    setWidgetMenu({ x, y, widgetKey });
  };

  const openWidgetMenu = (event: MouseEvent, widgetKey?: WidgetKey) => {
    event.preventDefault();
    event.stopPropagation();
    showWidgetMenu(event.clientX, event.clientY, widgetKey);
  };

  const handleAppContextMenu = (event: MouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : event.currentTarget;
    if (target.closest(".shortcut-menu, .dialog, input, textarea, select, [contenteditable='true']")) return;

    const shortcutId = target.closest<HTMLElement>("[data-shortcut-id]")?.dataset.shortcutId;
    if (shortcutId) {
      event.preventDefault();
      event.stopPropagation();
      setFolderMenu(null);
      setPageMenu(null);
      setWidgetMenu(null);
      setShortcutMenu({ x: event.clientX, y: event.clientY, shortcutId });
      return;
    }

    const folderId = target.closest<HTMLElement>("[data-folder-id]")?.dataset.folderId;
    if (folderId) {
      event.preventDefault();
      event.stopPropagation();
      setShortcutMenu(null);
      setPageMenu(null);
      setWidgetMenu(null);
      setFolderMenu({ x: event.clientX, y: event.clientY, folderId });
      return;
    }

    const widgetKey = target.closest<HTMLElement>("[data-widget-key]")?.dataset.widgetKey as WidgetKey | undefined;
    if (widgetKey || target.closest(".home-dashboard")) {
      openWidgetMenu(event, widgetKey);
      return;
    }

    if (activePage !== "shortcuts" || !target.closest("#whynavo-workspace") || target.closest("button, a")) return;
    event.preventDefault();
    event.stopPropagation();
    setShortcutMenu(null);
    setFolderMenu(null);
    setWidgetMenu(null);
    setPageMenu({ x: event.clientX, y: event.clientY });
  };

  const doSync = async (mode: SyncMode) => {
    if (
      mode === "push"
      && !window.confirm("用本机数据覆盖云端？这会替换其他设备下一次看到的云端版本。覆盖前会保存当前云端回退点。")
    ) return;
    if (
      mode === "pull"
      && !window.confirm("用云端数据覆盖本机？尚未同步的本机修改会被替换。覆盖前会保存本机回退点。")
    ) return;
    const expectedUserId = activeUserIdRef.current;
    if (!expectedUserId) {
      setSync((old) => ({ ...old, syncing: false, message: "请先登录再同步" }));
      return;
    }
    const operationEpoch = accountEpochRef.current;
    const ensureCurrentAccount = () => {
      if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) throw new Error("账号已变化，本次同步已取消");
    };
    if (syncLockRef.current) {
      setSync((old) => ({ ...old, message: "已有同步任务正在进行，请稍候" }));
      return;
    }
    const syncOperation = Symbol("manual-sync");
    syncLockRef.current = syncOperation;
    const message = mode === "merge" ? "正在合并多端数据..." : mode === "push" ? "正在用本机覆盖云端..." : "正在用云端覆盖本机...";
    setSync((old) => ({ ...old, syncing: true, message }));
    try {
      let current = stateRef.current;
      const persistedCurrent = await mergeAndSaveStateForAccount(current, expectedUserId);
      ensureCurrentAccount();
      current = mergeLocalPeerState(current, persistedCurrent);
      if (!localStatesEquivalent(stateRef.current, current)) applyState(current);
      broadcastLocalStateSaved(expectedUserId);
      await saveSyncRestorePoint(
        mode === "merge" ? "合并同步前" : mode === "push" ? "上传覆盖前" : "拉取覆盖前",
        current,
        expectedUserId,
        operationEpoch
      );
      ensureCurrentAccount();
      if (mode === "push") {
        let candidate = current;
        let pushed: AppState | undefined;
        let cloudRestorePointSaved = false;
        for (let attempt = 0; attempt < 3 && !pushed; attempt += 1) {
          const latestRemote = await pullSnapshot(candidate, expectedUserId);
          ensureCurrentAccount();
          if (latestRemote && !cloudRestorePointSaved) {
            await saveSyncRestorePoint(
              "云端被本机覆盖前",
              normalizeState(withDeviceLocalState(latestRemote, current)),
              expectedUserId,
              operationEpoch
            );
            cloudRestorePointSaved = true;
            ensureCurrentAccount();
          }
          candidate = {
            ...candidate,
            sync: { ...candidate.sync, remoteRevision: latestRemote?.sync?.remoteRevision || 0 }
          };
          try {
            const revision = await pushSnapshot(candidate, expectedUserId);
            ensureCurrentAccount();
            pushed = markPushed(candidate, revision);
          } catch (error) {
            if (!(error instanceof SyncConflictError) || attempt === 2) throw error;
          }
        }
        if (!pushed) throw new Error("云端覆盖失败，请重试");
        const reconciled = reconcileCompletedSync(current, pushed, stateRef.current);
        lastSyncedUpdatedAtRef.current = pushed.updatedAt;
        const persistedReconciled = await mergeAndSaveStateForAccount(reconciled, expectedUserId);
        ensureCurrentAccount();
        const finalState = mergeLocalPeerState(reconciled, persistedReconciled);
        applyState(finalState);
        broadcastLocalStateSaved(expectedUserId);
        setSync((old) => ({
          ...old,
          syncing: false,
          message: finalState.updatedAt === pushed.updatedAt ? "已用本机版本覆盖云端" : "云端覆盖完成，刚刚的新修改将继续同步",
          lastSyncedAt: pushed.sync?.lastPushedAt || nowIso()
        }));
        return;
      }

      const remote = await pullSnapshot(current, expectedUserId);
      ensureCurrentAccount();
      if (mode === "pull") {
        if (!remote) {
          setSync((old) => ({ ...old, syncing: false, message: "云端暂无数据" }));
          return;
        }
        const normalizedRemote = normalizeState(remote);
        const pulledBase = markPulled(withDeviceLocalState({
          ...normalizedRemote,
          settings: {
            ...normalizedRemote.settings,
            supabaseUrl: current.settings.supabaseUrl,
            supabaseAnonKey: current.settings.supabaseAnonKey
          },
          sync: {
            ...current.sync,
            lastRemoteUpdatedAt: normalizedRemote.updatedAt
          }
        }, current), normalizedRemote);
        const authoritativePull = stampStateSnapshot(current, pulledBase, nowIso());
        const latest = stateRef.current;
        const pulled = latest.updatedAt === current.updatedAt
          ? authoritativePull
          : withDeviceLocalState(
              mergeRemote(authoritativePull, stampStateSnapshot(current, latest, nowIso())),
              latest
            );
        lastSyncedUpdatedAtRef.current = latest.updatedAt === current.updatedAt
          ? pulled.updatedAt
          : authoritativePull.updatedAt;
        const persistedPulled = await mergeAndSaveStateForAccount(pulled, expectedUserId);
        ensureCurrentAccount();
        const finalState = mergeLocalPeerState(pulled, persistedPulled);
        applyState(finalState);
        broadcastLocalStateSaved(expectedUserId);
        setSync((old) => ({
          ...old,
          syncing: false,
          message: finalState.updatedAt === authoritativePull.updatedAt ? "已用云端版本覆盖本机" : "已加载云端版本，并保留同步期间的新修改",
          lastSyncedAt: finalState.sync?.lastPulledAt || nowIso()
        }));
        return;
      }

      const mergeCandidate = remote
        ? mergeRemote(current, remote)
        : {
            ...current,
            sync: {
              ...current.sync,
              remoteRevision: 0
            }
          };
      const pushed = await synchronizeSnapshot(mergeCandidate, expectedUserId);
      ensureCurrentAccount();
      const reconciled = reconcileCompletedSync(current, pushed, stateRef.current);
      lastSyncedUpdatedAtRef.current = pushed.updatedAt;
      const persistedReconciled = await mergeAndSaveStateForAccount(reconciled, expectedUserId);
      ensureCurrentAccount();
      const finalState = mergeLocalPeerState(reconciled, persistedReconciled);
      applyState(finalState);
      broadcastLocalStateSaved(expectedUserId);
      setSync((old) => ({
        ...old,
        syncing: false,
        message: finalState.updatedAt === pushed.updatedAt ? "已合并本机与云端，并同步到云端" : "合并完成，正在继续同步刚刚的新修改",
        lastSyncedAt: pushed.sync?.lastPushedAt || nowIso()
      }));
    } catch (error) {
      if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) return;
      if (error instanceof AuthAccountChangedError) {
        const changedUser = await getUser(stateRef.current.settings.supabaseUrl, stateRef.current.settings.supabaseAnonKey).catch(() => null);
        if (changedUser) {
          await activateSignedInUser(changedUser, "检测到登录账号变化，正在安全切换数据").catch(() => undefined);
        } else {
          await transitionToAnonymousState("登录会话已失效", "登录会话已失效，已切换到未登录数据");
        }
        return;
      }
      if (await handleTerminalAuthFailure(error, stateRef.current)) return;
      setSync((old) => ({ ...old, syncing: false, message: error instanceof Error ? error.message : "同步失败" }));
    } finally {
      if (syncLockRef.current === syncOperation) syncLockRef.current = undefined;
    }
  };

  const adoptLegacyData = async () => {
    const expectedUserId = activeUserIdRef.current;
    if (!expectedUserId) throw new Error("请先登录当前账号，再导入旧版本数据");
    if (!legacyStateAvailable) {
      setLegacyStateAvailable(false);
      throw new Error("没有找到可导入的旧版本本机数据");
    }
    if (!window.confirm("旧版本数据可能属于更新前登录过的账号。只有确认它属于当前账号时才继续导入；导入后将从旧版本隔离区移除。")) return;
    const operationEpoch = accountEpochRef.current;
    if (syncLockRef.current) throw new Error("已有同步任务正在进行，请稍候");
    const adopted = await adoptLegacyStateForAccount(expectedUserId);
    if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) {
      throw new Error("账号已变化，旧版本数据未应用");
    }
    const current = normalizeState(withCurrentServiceConfig(adopted));
    const persisted = await mergeAndSaveStateForAccount(current, expectedUserId);
    if (!isCurrentAccountOperation(operationEpoch, expectedUserId)) {
      throw new Error("账号已变化，旧版本数据未应用");
    }
    const finalState = mergeLocalPeerState(current, persisted);
    applyState(finalState);
    broadcastLocalStateSaved(expectedUserId);
    setLegacyStateAvailable(false);
    setSync((old) => ({
      ...old,
      syncing: false,
      message: "旧版本本机数据已导入当前账号"
    }));
    showToast("旧版本本机数据已导入当前账号，接下来可以执行合并同步");
  };

  const customWallpapers = state.settings.customWallpapers || [];
  const wallpaperUrlForId = (id?: string, compact = false) => {
    if (!id) return undefined;
    const builtIn = builtInWallpapers.find((wallpaper) => wallpaper.id === id);
    return (compact ? builtIn?.mobileUrl : undefined) || builtIn?.url
      || customWallpapers.find((wallpaper) => wallpaper.id === id)?.dataUrl;
  };
  const wallpaperCollection = (state.settings.wallpaperCollection || [])
    .map((id) => ({ id, url: wallpaperUrlForId(id, useCompactAssets) }))
    .filter((item): item is { id: string; url: string } => Boolean(item.url));
  const rotatingWallpaper = wallpaperCollection.length
    ? wallpaperCollection[Math.floor(Date.now() / 86400000) % wallpaperCollection.length].url
    : (useCompactAssets ? dailyWallpaper().mobileUrl : undefined) || dailyWallpaper().url;
  const activeWallpaper = state.settings.wallpaper
    || (state.settings.wallpaperRotation ? rotatingWallpaper : wallpaperUrlForId(state.settings.wallpaperPreset, useCompactAssets) || builtInWallpapers[0].url);
  const backgroundStyle = {
    "--wallpaper-image": cssImageUrl(activeWallpaper),
    "--date-color": state.settings.dateTimeColor || "#ffffff",
    "--widget-glass": `${state.settings.glass}%`
  } as React.CSSProperties;
  const widgetSizes = { ...defaultWidgetSizes, ...(state.settings.widgetSizes || {}) };
  const widgetRenderers: Record<WidgetKey, React.ReactNode> = {
    weather: <WeatherWidget key="weather" widgetKey="weather" size={widgetSizes.weather} weather={weather} city={state.settings.city} useLocation={state.settings.weatherUseLocation ?? false} refreshing={weatherRefreshing} onRefresh={() => refreshExternalData(state, true)} />,
    quote: <QuoteWidget key="quote" widgetKey="quote" size={widgetSizes.quote} date={today} />,
    calendar: <CalendarWidget key="calendar" widgetKey="calendar" size={widgetSizes.calendar} date={today} state={state} updateState={updateState} />,
    countdowns: <CountdownWidget key="countdowns" widgetKey="countdowns" size={widgetSizes.countdowns} state={state} updateState={updateState} />,
    todos: <TodoWidget key="todos" widgetKey="todos" size={widgetSizes.todos} state={state} updateState={updateState} />,
    focus: (
      <FocusWidget
        key="focus"
        widgetKey="focus"
        size={widgetSizes.focus}
        state={state}
        updateState={updateState}
        onOpenTasks={() => {
          setActiveCustomPageId(undefined);
          setActivePage("tasks");
        }}
      />
    ),
    notes: <PhotoWidget key="notes" widgetKey="notes" size={widgetSizes.notes} state={state} updateState={updateState} />,
    rates: <RatesWidget key="rates" widgetKey="rates" size={widgetSizes.rates} rates={rates} message={ratesMessage} refreshing={ratesRefreshing} onRefresh={() => refreshExternalData(state, true)} />,
    clock: <WorldClockWidget key="clock" widgetKey="clock" size={widgetSizes.clock} date={clock} timeZone={state.settings.timeZone || "Asia/Shanghai"} />,
    memo: <MemoWidget key="memo" widgetKey="memo" size={widgetSizes.memo} state={state} updateState={updateState} />,
    year: <YearProgressWidget key="year" widgetKey="year" size={widgetSizes.year} date={today} />,
    calculator: <CalculatorWidget key="calculator" widgetKey="calculator" size={widgetSizes.calculator} />
  };
  const enabledWidgetOrder = widgetOrder.filter((key) => state.settings.widgets[key]);

  const goToPage = (nextPage: HomePage) => {
    if (nextPage === activePage && !activeCustomPageId) return;
    const currentIndex = visibleSystemPageOrder.indexOf(activePage);
    const nextIndex = visibleSystemPageOrder.indexOf(nextPage);
    setPageMotion(nextIndex > currentIndex ? "down" : "up");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    shellRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setActiveCustomPageId(undefined);
    if (nextPage === "shortcuts") setActiveLayer("all");
    setActivePage(nextPage);
    if (navigationDisplay === "hidden") setNavigationOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      shellRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  };

  const goToCustomPage = (page: CustomNavPage) => {
    if (activeCustomPageId === page.id) return;
    setPageMotion("down");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    shellRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setActiveCustomPageId(page.id);
    setActiveLayer(page.groupId);
    setActivePage("shortcuts");
    if (navigationDisplay === "hidden") setNavigationOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      shellRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  };

  const widgetGridItems = enabledWidgetOrder.map((key) => {
    const PreviewIcon = widgetLibraryMeta[key].Icon;
    return {
      id: key,
      size: widgetSizes[key],
      label: widgetNameFor(uiLanguage, key),
      sizeLabel: uiLanguage === "en-US" ? widgetEnglishSizeLabels[widgetSizes[key]] : widgetSizeLabels[widgetSizes[key]],
      icon: <PreviewIcon size={18} />,
      content: widgetRenderers[key]
    };
  });
  const primaryWidgetItems = widgetGridItems;

  const leaveAccount = async (everywhere = false) => {
    const signOutEpoch = accountEpochRef.current + 1;
    accountEpochRef.current = signOutEpoch;
    const signingOutUserId = activeUserIdRef.current;
    const current = stateRef.current;
    let localSaveFailed = false;
    if (signingOutUserId) {
      try {
        await mergeAndSaveStateForAccount(current, signingOutUserId);
        broadcastLocalStateSaved(signingOutUserId);
      } catch {
        if (accountEpochRef.current === signOutEpoch) accountEpochRef.current = signOutEpoch - 1;
        throw new Error("当前账号数据无法安全保存，已取消退出。请先导出完整备份并检查浏览器存储空间。");
      }
    }
    localAuthTransitionRef.current = true;
    let serverSessionRevoked = false;
    try {
      if (everywhere) {
        serverSessionRevoked = await signOutEverywhere(current.settings.supabaseUrl, current.settings.supabaseAnonKey);
      } else {
        serverSessionRevoked = await signOut(current.settings.supabaseUrl, current.settings.supabaseAnonKey);
      }
    } catch {
      serverSessionRevoked = false;
    } finally {
      localAuthTransitionRef.current = false;
    }
    if (signingOutUserId) {
      localStateChannelRef.current?.postMessage({
        type: "account-signed-out",
        senderId: localStatePeerIdRef.current,
        userId: signingOutUserId
      });
    }
    activeUserIdRef.current = undefined;
    pendingOfflineUserRef.current = undefined;
    pendingOfflineActivationRef.current = false;
    setResolvedIconCacheScope();
    setWeather(undefined);
    syncLockRef.current = undefined;
    const blank = normalizeState(defaultState());
    applyState(blank);
    await saveStateForAccount(blank).catch(() => {
      localSaveFailed = true;
    });
    await refreshBackupAvailability(undefined).catch(() => {
      setRestoreAvailable(false);
      setMigrationBackupAvailable(false);
    });
    setSync({ user: null, syncing: false, autoSync: blank.sync?.autoSync, message: "未登录" });
    lastSyncedUpdatedAtRef.current = undefined;
    showToast(localSaveFailed
      ? "已退出并隐藏账号数据；本机存储写入失败，刚刚的未保存修改可能无法恢复"
      : serverSessionRevoked
      ? (everywhere
        ? "已退出所有设备；其他设备会在会话刷新后切换为未登录"
        : "已退出登录，本机已切换到未登录空白数据")
      : (everywhere
        ? "本机已安全退出；网络异常，其他设备的会话可能尚未撤销"
        : "已从本机安全退出；网络异常时服务端会话可能稍后才失效"));
  };

  return (
    <UiLanguageContext.Provider value={uiLanguage}>
      <main
        className={`app ${state.settings.theme} nav-${navigationDisplay} nav-${navigationSide} ${navigationOpen ? "nav-open" : ""}`}
        style={backgroundStyle}
        onContextMenuCapture={handleAppContextMenu}
      >
      <a className="skip-link" href="#whynavo-workspace">{text("跳到主要内容", "Skip to main content")}</a>
      <div className="shell" ref={shellRef}>
        <header className="topbar">
          <div className="brand">
            <span className="mark"><Compass size={22} strokeWidth={1.55} aria-hidden="true" /></span>
            <div>
              <h1>WhyNavo</h1>
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              className="top-action language-toggle"
              aria-label={text("切换到英文", "Switch to Chinese")}
              title={text("切换到英文", "Switch to Chinese")}
              onClick={() => updateState((current) => ({
                ...current,
                settings: {
                  ...current.settings,
                  language: current.settings.language === "en-US" ? "zh-CN" : "en-US",
                  updatedAt: nowIso()
                }
              }))}
            >
              <Languages size={16} />
              <span>{uiLanguage === "en-US" ? "中" : "EN"}</span>
            </button>
            <button
              type="button"
              className="top-action"
              aria-label={state.settings.theme === "dark" ? text("切换到浅色主题", "Switch to light theme") : text("切换到深色主题", "Switch to dark theme")}
              title={state.settings.theme === "dark" ? text("切换到浅色主题", "Switch to light theme") : text("切换到深色主题", "Switch to dark theme")}
              onClick={() => updateState((current) => ({
                ...current,
                settings: {
                  ...current.settings,
                  theme: current.settings.theme === "dark" ? "light" : "dark",
                  updatedAt: nowIso()
                }
              }))}
            >
              {state.settings.theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button type="button" className="top-action mobile-settings" aria-label={text("设置", "Settings")} title={text("设置", "Settings")} onClick={() => setDialog("settings")}><Settings size={17} /></button>
            <button className="account-button" aria-label={text("账号与云同步", "Account and cloud sync")} title={text("账号与云同步", "Account and cloud sync")} onClick={() => setDialog("sync")}>
              <UserCircle size={17} />
              <span>{sync.user ? text("已登录", "Signed in") : text("未登录", "Signed out")}</span>
            </button>
          </div>
        </header>

        <section className={`hero ${activePage === "widgets" ? "sample-a-hero" : "compact-page-hero"} ${activePage === "shortcuts" ? "spaces-page-hero" : ""}`}>
          {activePage === "widgets" ? (
            <>
              <div className="home-greeting">
                <div className="home-time" aria-label={text(`当前时间 ${homeTime}`, `Current time ${homeTime}`)}>
                  <time>{homeTime}</time>
                  <span>{homeDate}</span>
                </div>
                <h2>{homeGreeting}</h2>
                <p>{text("把注意力留给真正重要的事。", "Focus on what matters. You’re in control.")}</p>
              </div>
              <form className="search hero-search" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
                <input
                  ref={searchInputRef}
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder=""
                  aria-label={text("搜索网络", "Search the web")}
                />
                <button
                  type="button"
                  className="engine-toggle home-engine-toggle"
                  aria-label={text(
                    `当前使用${searchEngineLabelFor(uiLanguage, currentSearchEngine)}，点击切换搜索引擎`,
                    `Using ${searchEngineLabelFor(uiLanguage, currentSearchEngine)}. Click to switch search engine`
                  )}
                  title={text("单击切换百度 / Google", "Click to switch Baidu / Google")}
                  onClick={toggleSearchEngine}
                >
                  {searchEngineLabelFor(uiLanguage, currentSearchEngine)}
                </button>
                <button type="submit" className="search-submit" aria-label={text("搜索", "Search")} title={text("搜索", "Search")}><Search size={18} /></button>
              </form>
            </>
          ) : activePage === "shortcuts" ? (
            <label className="space-search">
              <Search size={19} aria-hidden="true" />
              <input
                value={spaceSearchText}
                onChange={(event) => setSpaceSearchText(event.target.value)}
                placeholder={text("搜索网站和文件夹", "Search sites and folders")}
                aria-label={text("搜索网站和文件夹", "Search sites and folders")}
              />
              {spaceSearchText && (
                <button type="button" onClick={() => setSpaceSearchText("")} aria-label={text("清除搜索", "Clear search")} title={text("清除搜索", "Clear search")}><X size={16} /></button>
              )}
            </label>
          ) : (
            <div className="compact-page-heading">
              <span>{activeCustomNavPage ? text("自定义空间", "Custom space") : systemNavLabel(activePage)}</span>
              <h2>{activeCustomNavPage?.name || systemNavTitle(activePage)}</h2>
              <p>{activeCustomNavPage ? text(`${shortcutTiles.length} 个入口`, `${shortcutTiles.length} items`) : systemNavDescription(activePage)}</p>
            </div>
          )}
        </section>

        {navigationDisplay === "hidden" && !navigationOpen && (
          <button
            type="button"
            className="page-nav-trigger"
            aria-label={text("显示页面导航", "Show page navigation")}
            title={text("显示页面导航", "Show page navigation")}
            onClick={() => setNavigationOpen(true)}
          >
            {navigationSide === "right" ? <PanelRight size={17} /> : <PanelLeft size={17} />}
          </button>
        )}

        {navigationDisplay === "auto" && (
          <button
            type="button"
            className="page-nav-auto-trigger"
            aria-label={text("展开页面导航", "Open page navigation")}
            title={text("展开页面导航", "Open page navigation")}
            onPointerEnter={openNavigation}
            onPointerLeave={scheduleNavigationClose}
            onFocus={openNavigation}
            onBlur={scheduleNavigationClose}
            onClick={() => setNavigationOpen(true)}
          />
        )}

        <nav
          className="page-nav"
          aria-label={text("WhyNavo 页面切换", "WhyNavo pages")}
          onPointerEnter={openNavigation}
          onPointerLeave={scheduleNavigationClose}
          onFocusCapture={openNavigation}
          onBlurCapture={(event: FocusEvent<HTMLElement>) => {
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
            scheduleNavigationClose();
          }}
        >
          <div className="page-nav-main">
            {visibleSystemPageOrder.map((page) => {
              const PageIcon = customNavPageIcons[systemNavIcon(page)]?.Icon || House;
              return (
                <button
                  className={activePage === page && !activeCustomPageId ? "active" : ""}
                  onClick={() => goToPage(page)}
                  title={systemNavTitle(page)}
                  key={page}
                >
                  <PageIcon size={19} />
                  <span>{systemNavLabel(page)}</span>
                </button>
              );
            })}
            {customNavPages.map((page) => {
              const CustomPageIcon = customNavPageIcons[page.icon]?.Icon || Star;
              return (
                <button className={activeCustomPageId === page.id ? "active" : ""} onClick={() => goToCustomPage(page)} title={page.name} key={page.id}>
                  <CustomPageIcon size={19} />
                  <span>{page.name}</span>
                </button>
              );
            })}
          </div>
          <div className="page-nav-secondary">
            <button className="nav-page-manager-control" onClick={() => setDialog("pages")} title={text("页面与导航管理", "Manage pages and navigation")} aria-label={text("页面与导航管理", "Manage pages and navigation")}><Plus size={19} /><span>{text("页面", "Pages")}</span></button>
            <button onClick={() => setDialog("settings")} title={text("设置", "Settings")}><Settings size={18} /><span>{text("设置", "Settings")}</span></button>
            {navigationDisplay === "hidden" && (
              <button className="nav-hide-control" onClick={() => setNavigationOpen(false)} title={text("隐藏导航", "Hide navigation")} aria-label={text("隐藏导航", "Hide navigation")}><EyeOff size={18} /></button>
            )}
          </div>
        </nav>
        {activePage === "shortcuts" && state.settings.dockPosition === "top" && <Dock shortcuts={pinned} />}

        <section
          id="whynavo-workspace"
          className={["workspace", "page-" + activePage, activeCustomPageId ? "page-custom" : "", pageMotion ? "page-motion-" + pageMotion : ""].filter(Boolean).join(" ")}
        >
          {activePage === "widgets" ? (
            <section className={`home-dashboard sample-a-home ${layoutEditing ? "is-editing" : ""}`}>
              <div className="sample-a-canvas">
                  <section className={`sample-a-sites-panel ${state.settings.homeSiteFloating !== false ? "sites-floating" : "sites-still"} ${layoutEditing ? "layout-editing" : ""}`}>
                    <header>
                      <div>
                        <span>{text("快捷入口", "Quick access")}</span>
                        <h2>{text("我的网站", "My Sites")}</h2>
                      </div>
                      <button type="button" aria-label={text("添加主页网站", "Add Home site")} title={text("添加主页网站", "Add Home site")} onClick={() => openNewShortcut(undefined, true)}><Plus size={17} /></button>
                    </header>
                    <HomeShortcuts
                      tiles={homeShortcutTiles.slice(0, 12)}
                      iconSize={state.settings.iconSize}
                      editing={layoutEditing}
                      floating={state.settings.homeSiteFloating !== false}
                      onOpenFolder={(folderId) => setOpenFolderId(folderId)}
                      onEditShortcut={(shortcut) => { setEditingShortcut(shortcut); setDialog("shortcut"); }}
                      onEditFolder={(folder) => { setEditingFolder(folder); setDialog("folder"); }}
                      onMoveTile={moveHomeTile}
                      onAdd={() => openNewShortcut(undefined, true)}
                    />
                  </section>

                {layoutEditing ? (
                  <Suspense fallback={(
                    <section className="sample-a-primary-widgets" aria-label={text("主要小组件", "Primary widgets")}>
                      {primaryWidgetItems.map((item) => (
                        <div className={`widget-sortable-shell widget-size-${item.size}`} data-widget-key={item.id} key={item.id}>{item.content}</div>
                      ))}
                    </section>
                  )}>
                    <SortableWidgetGrid
                      items={primaryWidgetItems}
                      className="sample-a-primary-widgets"
                      language={uiLanguage}
                      onMove={(source, target) => {
                        reorderWidget(source, target);
                        showToast(text(`${widgetNameFor(uiLanguage, source)}已移动`, `${widgetNameFor(uiLanguage, source)} moved`));
                      }}
                      onConfigure={(widgetKey, x, y) => showWidgetMenu(x, y, widgetKey)}
                    />
                  </Suspense>
                ) : (
                  <section className="sample-a-primary-widgets" aria-label={text("主要小组件", "Primary widgets")}>
                    {primaryWidgetItems.map((item) => (
                      <div className={`widget-sortable-shell widget-size-${item.size}`} data-widget-key={item.id} key={item.id}>
                        {item.content}
                      </div>
                    ))}
                  </section>
                )}
              </div>

              <footer className="sample-a-local-note">
                <ShieldCheck size={15} />
                <span>{text("本地优先。未登录时，数据只保存在你的设备上。", "Local-first. Signed-out data stays on your device.")}</span>
              </footer>
            </section>
          ) : activePage === "search" ? (
            <SearchWorkspace
              query={searchText}
              onQueryChange={setSearchText}
              onWebSearch={runSearch}
              onToggleEngine={toggleSearchEngine}
              engineLabel={searchEngineLabelFor(uiLanguage, currentSearchEngine)}
              shortcuts={allShortcuts}
              notes={state.notes}
              todos={state.todos}
              onAddShortcut={() => openNewShortcut()}
              onOpenNotes={() => goToPage("notes")}
              onOpenTasks={() => goToPage("tasks")}
            />
          ) : activePage === "notes" ? (
            <NotesWorkspace state={state} updateState={updateState} />
          ) : activePage === "tasks" ? (
            <TasksWorkspace state={state} updateState={updateState} />
          ) : activePage === "tools" ? (
            <ToolHub
              shortcutCount={allShortcuts.length}
              folderCount={allFolders.length}
              widgetCount={widgetOrder.filter((key) => state.settings.widgets[key]).length}
              syncLabel={sync.user ? "已登录" : "未登录"}
              onOpenWidgets={() => goToPage("widgets")}
              onOpenShortcuts={() => goToPage("shortcuts")}
              onAddShortcut={() => setDialog("shortcut")}
              onAddFolder={() => setDialog("folder")}
              onSync={() => setDialog("sync")}
              onSettings={() => setDialog("library")}
              onTimezone={() => setDialog("timezone")}
              onRefresh={() => { void refreshExternalData(state, true); }}
              onWallpaper={rotateMainWallpaper}
            />
          ) : (
            <section className="shortcut-stage">
              <div className="spaces-canvas-toolbar">
                <button type="button" className="space-add-site" onClick={() => openNewShortcut(activeCustomNavPage?.groupId)}>
                  <Plus size={17} />
                  <span>{text("添加网站", "Add site")}</span>
                </button>
              </div>
              <section className="shortcuts-panel">
                <div className={"shortcut-grid " + state.settings.gridDensity} style={{ "--icon": state.settings.iconSize + "px" } as React.CSSProperties}>
                  {renderedShortcutTiles.map((item) => {
                    if (item.kind === "folder") {
                      const folder = item.folder;
                      return (
                        <article
                          className="shortcut folder-tile"
                          key={folder.id}
                          data-folder-id={folder.id}
                          onClick={() => setOpenFolderId(folder.id)}
                        >
                          <button className="folder-open" title={text(`打开 ${folder.name}`, `Open ${folder.name}`)}>
                            <span className={"shortcut-icon folder-icon " + (folder.iconUrl ? "has-image" : "")} style={{ "--folder-color": folder.iconColor } as React.CSSProperties}>
                              <FolderIconContent iconUrl={folder.iconUrl} size={Math.round(state.settings.iconSize * 0.46)} />
                            </span>
                            <span>{folder.name}</span>
                          </button>
                        </article>
                      );
                    }
                    const shortcut = item.shortcut;
                    return (
                      <article
                        className="shortcut"
                        draggable
                        key={shortcut.id}
                        data-shortcut-id={shortcut.id}
                        onDragStart={() => setDragId(shortcut.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => moveShortcut(shortcut.id)}
                      >
                        <a href={safeHttpHref(shortcut.url)} title={shortcut.url} target="_blank" rel="noreferrer">
                          <span className="shortcut-icon">
                            <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} iconText={shortcut.iconText} iconColor={shortcut.iconColor} iconUpdatedAt={shortcut.iconUpdatedAt} title={shortcut.title} fallback={shortcut.title.slice(0, 1)} />
                          </span>
                          <span>{shortcut.title}</span>
                        </a>
                        <span className="drag-corner" title={text("拖拽排序", "Drag to reorder")}><GripVertical size={14} /></span>
                      </article>
                    );
                  })}
                  {renderedShortcutTiles.length < filteredShortcutTiles.length && (
                    <ShortcutRenderSentinel
                      onVisible={() => setShortcutRenderLimit((current) => Math.min(filteredShortcutTiles.length, current + SHORTCUT_RENDER_BATCH))}
                    />
                  )}
                  {!filteredShortcutTiles.length && (
                    spaceSearchText
                      ? <div className="empty-shortcut search-empty"><Search size={22} />{text("没有匹配的网站或文件夹", "No matching sites or folders")}</div>
                      : null
                  )}
                </div>
              </section>
            </section>
          )}
        </section>

        {activePage === "shortcuts" && state.settings.dockPosition === "bottom" && <Dock shortcuts={pinned} />}
      </div>

      {shortcutMenu && (
        <ShortcutContextMenu
          menu={shortcutMenu}
          shortcut={allShortcuts.find((item) => item.id === shortcutMenu.shortcutId)}
          onHome={homeShortcutTiles.some((item) => item.kind === "shortcut" && item.shortcut.id === shortcutMenu.shortcutId)}
          onClose={() => setShortcutMenu(null)}
          onEdit={(shortcut) => { setEditingShortcut(shortcut); setDialog("shortcut"); setShortcutMenu(null); }}
          onToggleHome={(shortcut) => toggleHomeTile(`shortcut:${shortcut.id}`)}
          onDelete={deleteShortcut}
        />
      )}
      {folderMenu && (
        <FolderContextMenu
          menu={folderMenu}
          folder={allFolders.find((item) => item.id === folderMenu.folderId)}
          onHome={homeShortcutTiles.some((item) => item.kind === "folder" && item.folder.id === folderMenu.folderId)}
          onClose={() => setFolderMenu(null)}
          onOpen={(folder) => { setOpenFolderId(folder.id); setFolderMenu(null); }}
          onEdit={(folder) => { setEditingFolder(folder); setDialog("folder"); setFolderMenu(null); }}
          onToggleHome={(folder) => toggleHomeTile(`folder:${folder.id}`)}
          onDelete={(folder) => { deleteFolder(folder.id); setFolderMenu(null); }}
        />
      )}
      {pageMenu && (
        <PageContextMenu
          menu={pageMenu}
          onClose={() => setPageMenu(null)}
          onAddFolder={() => { openNewFolder(activeCustomNavPage?.groupId); setPageMenu(null); }}
          onAddShortcut={() => { openNewShortcut(activeCustomNavPage?.groupId); setPageMenu(null); }}
          onAddGroup={() => { addGroup(); setPageMenu(null); }}
          onSettings={() => { setDialog("library"); setPageMenu(null); }}
        />
      )}
      {widgetMenu && (
        <WidgetContextMenu
          menu={widgetMenu}
          size={widgetMenu.widgetKey ? widgetSizes[widgetMenu.widgetKey] : undefined}
          siteFloating={state.settings.homeSiteFloating !== false}
          layoutEditing={layoutEditing}
          onClose={() => setWidgetMenu(null)}
          onToggleLayout={() => {
            const next = !layoutEditing;
            setLayoutEditing(next);
            setWidgetMenu(null);
            showToast(next ? text("布局编辑已开启；单击图标编辑，拖动调整位置", "Layout editing enabled. Click icons to edit or drag to move.") : text("主页布局已保存", "Home layout saved"));
          }}
          onResize={(key, size) => {
            setWidgetSize(key, size);
            showToast(text(
              `${widgetNames[key]}已切换为${widgetSizeLabels[size]}尺寸`,
              `${widgetEnglishNames[key]} changed to ${widgetEnglishSizeLabels[size]}`
            ));
          }}
          onOpenLibrary={() => { setDialog("library"); setWidgetMenu(null); }}
          onRefresh={() => { void refreshExternalData(state, true); setWidgetMenu(null); }}
          onRotateWallpaper={() => { rotateMainWallpaper(); setWidgetMenu(null); }}
          onToggleSiteFloating={() => {
            updateState((current) => ({
              ...current,
              settings: {
                ...current.settings,
                homeSiteFloating: current.settings.homeSiteFloating === false,
                updatedAt: nowIso()
              }
            }));
            setWidgetMenu(null);
          }}
          onHide={(key) => {
            setWidgetEnabled(key, false);
            setWidgetMenu(null);
            showToast(text(`已隐藏${widgetNames[key]}`, `${widgetEnglishNames[key]} hidden`));
          }}
        />
      )}
      {dialog === "shortcut" && (
        <ShortcutDialog
          shortcut={editingShortcut}
          groups={state.shortcutGroups.filter((group) => !group.deletedAt)}
          folders={(state.shortcutFolders || []).filter((folder) => !folder.deletedAt)}
          onClose={() => { setDialog(null); setEditingShortcut(undefined); }}
          onSave={saveShortcut}
        />
      )}
      {dialog === "folder" && (
        <FolderDialog
          folder={editingFolder}
          groups={state.shortcutGroups.filter((group) => !group.deletedAt)}
          onClose={() => { setDialog(null); setEditingFolder(undefined); }}
          onSave={saveFolder}
          onDelete={editingFolder?.id ? () => deleteFolder(editingFolder.id) : undefined}
        />
      )}
      {openFolder && (
        <FolderView
          folder={openFolder}
          shortcuts={folderShortcuts}
          onClose={() => setOpenFolderId(undefined)}
          onAdd={() => {
            setEditingShortcut({
              id: "",
              title: "",
              url: "",
              iconColor: openFolder.iconColor,
              groupId: openFolder.groupId,
              folderId: openFolder.id,
              pinned: false,
              order: state.shortcuts.length,
              updatedAt: nowIso()
            });
            setDialog("shortcut");
          }}
          onEditFolder={() => { setEditingFolder(openFolder); setDialog("folder"); }}
        />
      )}
      {dialog === "import" && (
        <ImportDialog
          existingShortcuts={allShortcuts}
          onClose={() => setDialog(null)}
          onImport={(text, mode) => {
            const rows = parseImportText(text);
            const availableRecords = Math.max(0, Math.min(
              MAX_IMPORTED_SHORTCUTS - state.shortcuts.length,
              MAX_IMPORTED_SHORTCUTS - state.shortcutGroups.length,
              MAX_IMPORTED_SHORTCUTS - state.shortcutFolders.length
            ));
            if (!availableRecords) {
              showToast("当前数据已达到安全导入上限，请先导出完整备份并删除不再需要的内容");
              return;
            }
            const importRows = rows.slice(0, availableRecords);
            if (importRows.length < rows.length) {
              showToast(`为保证数据可安全重载，本次只导入前 ${importRows.length} 个网站`);
            }
            const liveGroups = state.shortcutGroups.filter((group) => !group.deletedAt);
            const liveFolders = (state.shortcutFolders || []).filter((folder) => !folder.deletedAt);
            if (mode === "replace") {
              const converted = importedToShortcuts(importRows, [], 0, []);
              const deletedAt = nowIso();
              updateState((current) => ({
                ...current,
                shortcutGroups: [
                  ...current.shortcutGroups.map((group) => ({ ...group, deletedAt, updatedAt: deletedAt })),
                  ...converted.groups
                ],
                shortcutFolders: [
                  ...(current.shortcutFolders || []).map((folder) => ({ ...folder, deletedAt, updatedAt: deletedAt })),
                  ...converted.folders
                ],
                shortcuts: [
                  ...current.shortcuts.map((shortcut) => ({ ...shortcut, pinned: false, deletedAt, updatedAt: deletedAt })),
                  ...converted.shortcuts
                ]
              }));
              setActiveLayer("all");
              showToast(`已按文件顺序重建 ${converted.shortcuts.length} 个快捷导航`);
            } else {
              const converted = importedToShortcuts(importRows, liveGroups, allShortcuts.length, liveFolders);
              updateState((current) => ({
                ...current,
                shortcutGroups: [
                  ...current.shortcutGroups.filter((group) => group.deletedAt),
                  ...converted.groups
                ],
                shortcutFolders: [
                  ...current.shortcutFolders.filter((folder) => folder.deletedAt),
                  ...converted.folders
                ],
                shortcuts: [...current.shortcuts, ...converted.shortcuts]
              }));
              showToast(`已追加导入 ${converted.shortcuts.length} 个快捷导航`);
            }
            setDialog(null);
          }}
        />
      )}
      {(dialog === "library" || dialog === "wallpapers") && (
        <ResourceCenterDialog
          state={state}
          updateState={updateState}
          shortcuts={allShortcuts}
          initialTab={dialog === "wallpapers" ? "wallpapers" : "widgets"}
          onEditShortcut={(shortcut) => {
            setEditingShortcut(shortcut);
            setDialog("shortcut");
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "pages" && (
        <PageManagerDialog
          customPages={customNavPages}
          hiddenPages={hiddenNavPages}
          systemOrder={navigationOrder}
          systemLabels={state.settings.navigationLabels || {}}
          systemIcons={state.settings.navigationIcons || {}}
          onAdd={addCustomNavPage}
          onDelete={deleteCustomNavPage}
          onUpdateCustom={updateCustomNavPage}
          onMoveCustom={moveCustomNavPage}
          onUpdateSystem={updateSystemNavPage}
          onMoveSystem={moveSystemNavPage}
          onToggleSystem={toggleSystemNavPage}
          onOpenPage={(page) => { goToCustomPage(page); setDialog(null); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          state={state}
          clock={clock}
          updateCheck={updateCheck}
          migrationBackupAvailable={migrationBackupAvailable}
          updateState={updateState}
          onImport={() => setDialog("import")}
          onImportBackup={importBackup}
          onExport={exportData}
          onRestoreMigrationBackup={restoreMigrationBackup}
          onCheckUpdate={() => runUpdateCheck(true)}
          onOpenTimeZone={() => setDialog("timezone")}
          onOpenWallpapers={() => setDialog("wallpapers")}
          onWeatherUseLocationChange={async (enabled) => {
            if (enabled) {
              const granted = await requestDeviceLocationPermission().catch(() => false);
              if (!granted) {
                showToast("未授予定位权限，继续使用所选城市天气");
                return;
              }
            }
            updateState((current) => ({
              ...current,
              settings: {
                ...current.settings,
                weatherUseLocation: enabled,
                updatedAt: nowIso()
              }
            }));
          }}
          onClose={() => {
            setDialog(null);
            void refreshExternalData(state, true);
          }}
        />
      )}
      {dialog === "sync" && (
        <SyncDialog
          state={state}
          sync={sync}
          updateState={updateState}
          legacyStateAvailable={legacyStateAvailable}
          onAdoptLegacyData={adoptLegacyData}
          onClose={() => setDialog(null)}
          onLogin={async (mode, email, password, captchaToken) => {
            const { supabaseUrl, supabaseAnonKey } = state.settings;
            if (!supabaseUrl || !supabaseAnonKey) throw new Error("同步服务暂未配置，请稍后再试");
            localAuthTransitionRef.current = true;
            try {
              if (mode === "login") {
                const { user, passwordSafetyWarning } = await signIn(
                  supabaseUrl,
                  supabaseAnonKey,
                  email,
                  password,
                  captchaToken
                );
                if (!user) throw new Error("登录成功但没有返回账号信息，请重试");
                await activateSignedInUser(user, "正在加载账号数据");
                return {
                  status: "signed-in",
                  message: passwordSafetyWarning || "登录成功，已加载此账号的数据。"
                };
              }

              const result = await signUp(supabaseUrl, supabaseAnonKey, email, password, getAuthRedirectUrl(), captchaToken);
              if (!result.session) {
                await refreshUser();
                const message = "注册申请已提交。请打开邮箱完成验证，验证后再回来登录同步。";
                setSync((old) => ({ ...old, user: null, syncing: false, message: "等待邮箱验证" }));
                return { status: "verification-sent", message };
              }

              if (!result.user) throw new Error("注册成功但没有返回账号信息，请重试");
              await activateSignedInUser(result.user, "正在初始化账号数据");
              return { status: "signed-in", message: "注册成功，已加载此账号的数据。" };
            } finally {
              localAuthTransitionRef.current = false;
            }
          }}
          onSignOut={() => leaveAccount(false)}
          onSignOutAll={() => leaveAccount(true)}
          onDeleteAccount={async (password, captchaToken) => {
            const deletingUserId = activeUserIdRef.current;
            const current = stateRef.current;
            const deletingEmail = sync.user?.email;
            if (!deletingUserId || !deletingEmail) throw new Error("当前没有已登录账号");

            const deletionEpoch = accountEpochRef.current + 1;
            accountEpochRef.current = deletionEpoch;
            localAuthTransitionRef.current = true;
            try {
              await mergeAndSaveStateForAccount(current, deletingUserId);
              broadcastLocalStateSaved(deletingUserId);
              await markLocalAccountDeletionPending(deletingUserId);
              await deleteAccount(
                current.settings.supabaseUrl || "",
                current.settings.supabaseAnonKey || "",
                deletingUserId,
                password,
                captchaToken
              );
            } catch (error) {
              if (error instanceof AccountDeletionRejectedError) {
                await clearLocalAccountDeletionPending(deletingUserId).catch(() => undefined);
                pendingAccountDeletionIdsRef.current = pendingAccountDeletionIdsRef.current
                  .filter((userId) => userId !== deletingUserId);
                localAuthTransitionRef.current = false;
                if (accountEpochRef.current === deletionEpoch) accountEpochRef.current = deletionEpoch - 1;
                throw error;
              }
              if (error instanceof AccountDeletionOutcomeUnknownError) {
                pendingAccountDeletionIdsRef.current = Array.from(new Set([
                  ...pendingAccountDeletionIdsRef.current,
                  deletingUserId
                ]));
                await transitionToAnonymousState(
                  "账号删除状态待核验",
                  "删除请求结果待联网核验；本设备已退出并隐藏账号数据",
                  { persistPrevious: false }
                );
                pendingOfflineUserRef.current = sync.user || undefined;
                localAuthTransitionRef.current = false;
                throw error;
              }
              await clearLocalAccountDeletionPending(deletingUserId).catch(() => undefined);
              localAuthTransitionRef.current = false;
              if (accountEpochRef.current === deletionEpoch) accountEpochRef.current = deletionEpoch - 1;
              throw error;
            }
            const accountCleanup = await Promise.allSettled([
              cleanupDeletedAccountData(deletingUserId)
            ]);
            if (accountCleanup.some((result) => result.status === "rejected")) {
              pendingAccountDeletionIdsRef.current = Array.from(new Set([
                ...pendingAccountDeletionIdsRef.current,
                deletingUserId
              ]));
            } else {
              pendingAccountDeletionIdsRef.current = pendingAccountDeletionIdsRef.current
                .filter((userId) => userId !== deletingUserId);
            }
            localStateChannelRef.current?.postMessage({
              type: "account-deleted",
              senderId: localStatePeerIdRef.current,
              userId: deletingUserId
            });
            await signOut(current.settings.supabaseUrl, current.settings.supabaseAnonKey).catch(() => false);
            activeUserIdRef.current = undefined;
            setResolvedIconCacheScope();
            setWeather(undefined);
            localAuthTransitionRef.current = false;
            syncLockRef.current = undefined;
            const blank = normalizeState(defaultState());
            applyState(blank);
            const cleanup = [
              ...accountCleanup,
              ...(await Promise.allSettled([saveStateForAccount(blank)]))
            ];
            await refreshBackupAvailability(undefined).catch(() => {
              setRestoreAvailable(false);
              setMigrationBackupAvailable(false);
            });
            setSync({ user: null, syncing: false, autoSync: blank.sync?.autoSync, message: "未登录" });
            lastSyncedUpdatedAtRef.current = undefined;
            setDialog(null);
            showToast(cleanup.some((result) => result.status === "rejected")
              ? "账号和云端数据已删除；此账号的本机缓存将在下次启动时继续清理"
              : "账号、云端数据和此设备上的账号数据已永久删除");
          }}
          onResetPassword={async (email, captchaToken) => {
            const { supabaseUrl, supabaseAnonKey } = state.settings;
            if (!supabaseUrl || !supabaseAnonKey) throw new Error("同步服务暂未配置，请稍后再试");
            await requestPasswordReset(supabaseUrl, supabaseAnonKey, email, getAuthRedirectUrl(), captchaToken);
          }}
          onResendVerification={async (email, captchaToken) => {
            const { supabaseUrl, supabaseAnonKey } = state.settings;
            if (!supabaseUrl || !supabaseAnonKey) throw new Error("同步服务暂未配置，请稍后再试");
            await resendSignupConfirmation(
              supabaseUrl,
              supabaseAnonKey,
              email,
              getAuthRedirectUrl(),
              captchaToken
            );
          }}
          onUpdatePassword={async (password, currentPassword, captchaToken) => {
            const { supabaseUrl, supabaseAnonKey } = state.settings;
            if (!supabaseUrl || !supabaseAnonKey) throw new Error("同步服务暂未配置，请稍后再试");
            await updatePassword(supabaseUrl, supabaseAnonKey, password, currentPassword, captchaToken);
          }}
          passwordRecovery={passwordRecovery}
          onPasswordRecoveryComplete={() => {
            passwordRecoveryRef.current = false;
            setPasswordRecovery(false);
            clearAuthCallbackUrl();
          }}
          onSync={doSync}
          restoreAvailable={restoreAvailable}
          onRestore={restorePreviousSync}
        />
      )}
      {dialog === "timezone" && (
        <TimeZoneDialog
          current={selectedTimeZone}
          onClose={() => setDialog(null)}
          onChoose={chooseTimeZone}
        />
      )}
      {toast && (
        <div className="toast">
          <span>{toast}</span>
          {toastAction && <button type="button" onClick={toastAction.onClick}>{toastAction.label}</button>}
          {undoSnapshotRef.current && undoLabel && <button type="button" onClick={undoLastChange}>撤销</button>}
        </div>
      )}
      </main>
    </UiLanguageContext.Provider>
  );
}

function ToolHub({ shortcutCount, folderCount, widgetCount, syncLabel, onOpenWidgets, onOpenShortcuts, onAddShortcut, onAddFolder, onSync, onSettings, onTimezone, onRefresh, onWallpaper }: {
  shortcutCount: number;
  folderCount: number;
  widgetCount: number;
  syncLabel: string;
  onOpenWidgets: () => void;
  onOpenShortcuts: () => void;
  onAddShortcut: () => void;
  onAddFolder: () => void;
  onSync: () => void;
  onSettings: () => void;
  onTimezone: () => void;
  onRefresh: () => void;
  onWallpaper: () => void;
}) {
  const [translateText, setTranslateText] = useState("");
  const [numberText, setNumberText] = useState("2026");
  const [pxText, setPxText] = useState("16");
  const [baseText, setBaseText] = useState("16");
  const numericValue = Number(numberText);
  const validNumber = Number.isFinite(numericValue);
  const pxValue = Number(pxText);
  const baseValue = Number(baseText);
  const remValue = Number.isFinite(pxValue) && Number.isFinite(baseValue) && baseValue > 0 ? pxValue / baseValue : undefined;
  const openTranslate = () => {
    const query = translateText.trim();
    const url = query
      ? `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(query)}&op=translate`
      : "https://translate.google.com/";
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const tools: Array<{ title: string; desc: string; icon: React.ReactNode; action: () => void; primary?: boolean; accent?: string }> = [
    { title: "资源中心", desc: `${widgetCount} 个小组件 · 壁纸/图标`, icon: <Palette size={22} />, action: onSettings, primary: true },
    { title: "网站管理", desc: `${shortcutCount} 个网站 · ${folderCount} 个文件夹`, icon: <Layers size={22} />, action: onOpenShortcuts, primary: true },
    { title: "新建网站", desc: "添加一个常用入口", icon: <Plus size={22} />, action: onAddShortcut },
    { title: "新建文件夹", desc: "整理同类网站", icon: <FolderPlus size={22} />, action: onAddFolder },
    { title: "云同步", desc: syncLabel, icon: <UserCircle size={22} />, action: onSync },
    { title: "刷新数据", desc: "天气与汇率", icon: <RefreshCcw size={22} />, action: onRefresh },
    { title: "时区", desc: "调整时间显示", icon: <Clock3 size={22} />, action: onTimezone },
    { title: "换壁纸", desc: "切换内置背景", icon: <Shuffle size={22} />, action: onWallpaper },
    { title: "回到主页", desc: "查看小组件", icon: <CalendarDays size={22} />, action: onOpenWidgets }
  ];

  return (
    <section className="tool-hub" aria-label="工具箱">
      <div className="tool-hero">
        <h2>工具箱</h2>
      </div>
      <div className="tool-utility-grid">
        <section className="tool-utility-panel translate-tool">
          <div className="tool-panel-title"><Search size={18} /><span>翻译</span></div>
          <textarea value={translateText} onChange={(event) => setTranslateText(event.target.value)} placeholder="输入内容后打开翻译" />
          <button type="button" className="primary" onClick={openTranslate}>打开翻译</button>
        </section>
        <section className="tool-utility-panel number-tool">
          <div className="tool-panel-title"><BookOpen size={18} /><span>数字工具</span></div>
          <input aria-label="十进制数字" inputMode="decimal" value={numberText} onChange={(event) => setNumberText(event.target.value)} />
          <div className="tool-result-grid">
            <div><span>二进制</span><strong>{validNumber ? Math.trunc(numericValue).toString(2) : "--"}</strong></div>
            <div><span>十六进制</span><strong>{validNumber ? Math.trunc(numericValue).toString(16).toUpperCase() : "--"}</strong></div>
          </div>
        </section>
        <section className="tool-utility-panel size-tool">
          <div className="tool-panel-title"><TimerReset size={18} /><span>尺寸换算</span></div>
          <div className="tool-inline-inputs">
            <label><span>px</span><input inputMode="decimal" value={pxText} onChange={(event) => setPxText(event.target.value)} /></label>
            <label><span>base</span><input inputMode="decimal" value={baseText} onChange={(event) => setBaseText(event.target.value)} /></label>
          </div>
          <div className="tool-result-large">{remValue === undefined ? "--" : `${Number(remValue.toFixed(4))}rem`}</div>
        </section>
      </div>
      <div className="tool-action-grid">
        {tools.map((tool) => (
          <button type="button" className={["tool-card", tool.primary ? "primary-tool" : "", tool.accent || ""].filter(Boolean).join(" ")} key={tool.title} onClick={tool.action}>
            <span className="tool-icon">{tool.icon}</span>
            <strong>{tool.title}</strong>
            <span>{tool.desc}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HomeShortcuts({ tiles, iconSize, editing, floating, onOpenFolder, onEditShortcut, onEditFolder, onMoveTile, onAdd }: {
  tiles: Array<{ kind: "folder"; folder: ShortcutFolder; order: number } | { kind: "shortcut"; shortcut: Shortcut; order: number }>;
  iconSize: number;
  editing: boolean;
  floating: boolean;
  onOpenFolder: (folderId: string) => void;
  onEditShortcut: (shortcut: Shortcut) => void;
  onEditFolder: (folder: ShortcutFolder) => void;
  onMoveTile: (tile: HomeTileRef, x: number, y: number) => void;
  onAdd: () => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const canvasRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState<{ key: HomeTileRef; pointerId: number; position: HomeTilePosition; startX: number; startY: number; moved: boolean }>();
  const tileKey = (item: { kind: "folder"; folder: ShortcutFolder } | { kind: "shortcut"; shortcut: Shortcut }): HomeTileRef => (
    item.kind === "folder" ? `folder:${item.folder.id}` : `shortcut:${item.shortcut.id}`
  );
  const savedPosition = (item: (typeof tiles)[number], index: number) => {
    const entity = item.kind === "folder" ? item.folder : item.shortcut;
    const fallback = defaultHomeTilePositions[index % defaultHomeTilePositions.length];
    return {
      x: typeof entity.homeX === "number" ? entity.homeX : fallback.x,
      y: typeof entity.homeY === "number" ? entity.homeY : fallback.y
    };
  };
  const pointerPosition = (clientX: number, clientY: number): HomeTilePosition | undefined => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return undefined;
    const horizontalInset = Math.min(0.22, (Math.max(48, Math.min(iconSize, 80)) / 2 + 8) / rect.width);
    const verticalInset = Math.min(0.22, (Math.max(48, Math.min(iconSize, 80)) / 2 + 8) / rect.height);
    return {
      x: Math.max(horizontalInset, Math.min(1 - horizontalInset, (clientX - rect.left) / rect.width)),
      y: Math.max(verticalInset, Math.min(1 - verticalInset, (clientY - rect.top) / rect.height))
    };
  };
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, key: HomeTileRef) => {
    if (!editing || event.button !== 0) return;
    const index = tiles.findIndex((item) => tileKey(item) === key);
    const item = tiles[index];
    if (!item) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({ key, pointerId: event.pointerId, position: savedPosition(item, index), startX: event.clientX, startY: event.clientY, moved: false });
  };
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const position = pointerPosition(event.clientX, event.clientY);
    if (position) setDragging({
      ...dragging,
      position,
      moved: dragging.moved || Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) >= 6
    });
  };
  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const item = tiles.find((candidate) => tileKey(candidate) === dragging.key);
    if (dragging.moved) {
      const position = pointerPosition(event.clientX, event.clientY) || dragging.position;
      onMoveTile(dragging.key, position.x, position.y);
    } else if (item?.kind === "shortcut") {
      onEditShortcut(item.shortcut);
    } else if (item?.kind === "folder") {
      onEditFolder(item.folder);
    }
    setDragging(undefined);
  };

  return (
    <section
      ref={canvasRef}
      className={`home-shortcuts home-sites-canvas ${editing ? "layout-editing" : ""} ${floating ? "is-floating" : ""}`}
      aria-label={text("主页快捷入口", "Home shortcuts")}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={() => setDragging(undefined)}
    >
      <div className="home-shortcuts-row" style={{ "--icon": Math.max(48, Math.min(iconSize, 80)) + "px" } as React.CSSProperties}>
        {tiles.map((item, index) => {
          const key = tileKey(item);
          const position = dragging?.key === key ? dragging.position : savedPosition(item, index);
          const style = {
            "--home-x": `${position.x * 100}%`,
            "--home-y": `${position.y * 100}%`,
            "--float-index": index
          } as React.CSSProperties;
          const content = item.kind === "folder" ? (
            <>
              <span className={"shortcut-icon folder-icon " + (item.folder.iconUrl ? "has-image" : "")} style={{ "--folder-color": item.folder.iconColor } as React.CSSProperties}>
                <FolderIconContent iconUrl={item.folder.iconUrl} size={Math.round(Math.max(48, Math.min(iconSize, 80)) * 0.46)} />
              </span>
              <span>{item.folder.name}</span>
            </>
          ) : (
            <>
              <span className="shortcut-icon">
                <ShortcutIconContent url={item.shortcut.url} iconUrl={item.shortcut.iconUrl} iconText={item.shortcut.iconText} iconColor={item.shortcut.iconColor} iconUpdatedAt={item.shortcut.iconUpdatedAt} title={item.shortcut.title} fallback={item.shortcut.title.slice(0, 1)} priority={index < 8} />
              </span>
              <span>{item.shortcut.title}</span>
            </>
          );
          if (editing) return (
            <button
              type="button"
              className={`home-shortcut home-shortcut-positioned is-positioning ${dragging?.key === key ? "is-dragging" : ""}`}
              key={key}
              data-folder-id={item.kind === "folder" ? item.folder.id : undefined}
              data-shortcut-id={item.kind === "shortcut" ? item.shortcut.id : undefined}
              style={style}
              title={text("单击编辑图标，拖动调整位置", "Click to edit the icon; drag to reposition")}
              onPointerDown={(event) => startDrag(event, key)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.08 : 0.025;
                const delta = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : undefined;
                if (!delta) return;
                event.preventDefault();
                onMoveTile(key, position.x + delta[0], position.y + delta[1]);
              }}
            >
              {content}
              <span className="tile-drag-handle" aria-hidden="true"><Edit3 size={13} /></span>
            </button>
          );
          return item.kind === "folder" ? (
          <button
            type="button"
            className="home-shortcut home-shortcut-positioned folder-home"
            key={"folder-" + item.folder.id}
            data-folder-id={item.folder.id}
            style={style}
            onClick={() => onOpenFolder(item.folder.id)}
            title={item.folder.name}
          >
            {content}
          </button>
        ) : (
          <a
            className="home-shortcut home-shortcut-positioned"
            href={safeHttpHref(item.shortcut.url)}
            key={item.shortcut.id}
            data-shortcut-id={item.shortcut.id}
            style={style}
            title={item.shortcut.url}
            target="_blank"
            rel="noreferrer"
          >
            {content}
          </a>
        )})}
      </div>
      {!tiles.length && (
        <button type="button" className="home-sites-empty" onClick={onAdd}>
          <Plus size={20} />
          <span>{text("添加第一个网站", "Add your first site")}</span>
        </button>
      )}
    </section>
  );
}

function SearchWorkspace({ query, onQueryChange, onWebSearch, onToggleEngine, engineLabel, shortcuts, notes, todos, onAddShortcut, onOpenNotes, onOpenTasks }: {
  query: string;
  onQueryChange: (value: string) => void;
  onWebSearch: () => void;
  onToggleEngine: () => void;
  engineLabel: string;
  shortcuts: Shortcut[];
  notes: Note[];
  todos: Todo[];
  onAddShortcut: () => void;
  onOpenNotes: () => void;
  onOpenTasks: () => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const normalizedQuery = query.trim().toLowerCase();
  const matchedShortcuts = normalizedQuery
    ? shortcuts.filter((shortcut) => `${shortcut.title} ${shortcut.url}`.toLowerCase().includes(normalizedQuery)).slice(0, 12)
    : [];
  const matchedNotes = normalizedQuery
    ? notes
      .filter((note) => !note.deletedAt)
      .filter((note) => `${noteTitleFor(language, note.title)} ${noteBodyFor(language, note.body)}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 8)
    : [];
  const matchedTodos = normalizedQuery
    ? todos
      .filter((todo) => !todo.deletedAt)
      .filter((todo) => todo.text.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => Number(left.done) - Number(right.done) || left.order - right.order)
      .slice(0, 8)
    : [];
  const resultCount = matchedShortcuts.length + matchedNotes.length + matchedTodos.length;

  return (
    <section className="lucid-search-workspace">
      <form className="lucid-search-command" onSubmit={(event) => { event.preventDefault(); onWebSearch(); }}>
        <Search size={23} aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={text("查找网站、笔记、任务，或直接搜索网络", "Find sites, notes, tasks, or search the web")}
          aria-label={text("搜索 WhyNavo 内容", "Search WhyNavo content")}
        />
        <button
          type="button"
          className="lucid-search-engine"
          aria-label={text(`当前使用${engineLabel}，点击切换搜索引擎`, `Using ${engineLabel}. Click to switch search engine`)}
          title={text("单击切换百度 / Google", "Click to switch Baidu / Google")}
          onClick={onToggleEngine}
        >
          {engineLabel}
        </button>
        <button type="submit" className="lucid-search-web" title={text("搜索网络", "Search the web")} aria-label={text("搜索网络", "Search the web")}><Navigation size={17} /></button>
      </form>

      {!normalizedQuery ? (
        <div className="lucid-search-idle">
          <button type="button" className="lucid-page-add" onClick={onAddShortcut}><Plus size={16} /><span>{text("添加网站", "Add site")}</span></button>
        </div>
      ) : <>
        <div className="lucid-search-summary">
          <span>{text(`${resultCount} 个本地结果`, `${resultCount} local results`)}</span>
          <p>{text("按回车可继续搜索网络", "Press Enter to continue on the web")}</p>
        </div>

        <div className="lucid-search-results">
        <section className="lucid-result-group">
          <header><span><Globe2 size={16} />{text("网站", "Sites")}</span><small>{matchedShortcuts.length}</small></header>
          <div className="lucid-site-results">
            {matchedShortcuts.map((shortcut, index) => (
              <a href={safeHttpHref(shortcut.url)} target="_blank" rel="noreferrer" key={shortcut.id}>
                <span className="lucid-result-icon">
                  <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} iconText={shortcut.iconText} iconColor={shortcut.iconColor} iconUpdatedAt={shortcut.iconUpdatedAt} title={shortcut.title} fallback={shortcut.title.slice(0, 1)} priority={index < 8} />
                </span>
                <span><strong>{shortcut.title}</strong><small>{shortcut.url}</small></span>
              </a>
            ))}
            {!matchedShortcuts.length && <p className="lucid-result-empty">{text("没有匹配的网站", "No matching sites")}</p>}
          </div>
        </section>

        <section className="lucid-result-group">
          <header><span><StickyNote size={16} />{text("笔记", "Notes")}</span><button type="button" onClick={onOpenNotes}>{text("打开", "Open")}</button></header>
          <div className="lucid-text-results">
            {matchedNotes.map((note) => (
              <button type="button" onClick={onOpenNotes} key={note.id}>
                <span><strong>{noteTitleFor(language, note.title) || text("未命名笔记", "Untitled note")}</strong><small>{noteBodyFor(language, note.body) || text("空白笔记", "Empty note")}</small></span>
                <FileText size={15} />
              </button>
            ))}
            {!matchedNotes.length && <p className="lucid-result-empty">{text("没有匹配的笔记", "No matching notes")}</p>}
          </div>
        </section>

        <section className="lucid-result-group">
          <header><span><ListTodo size={16} />{text("任务", "Tasks")}</span><button type="button" onClick={onOpenTasks}>{text("打开", "Open")}</button></header>
          <div className="lucid-text-results">
            {matchedTodos.map((todo) => (
              <button type="button" className={isTodoCompletedForDate(todo) ? "is-done" : ""} onClick={onOpenTasks} key={todo.id}>
                <span><strong>{todoTextFor(language, todo.text)}</strong><small>{isTodoCompletedForDate(todo) ? text("已完成", "Completed") : todo.recurrence ? recurrenceLabel(todo, language) : text("待处理", "Open")}</small></span>
                <Check size={15} />
              </button>
            ))}
            {!matchedTodos.length && <p className="lucid-result-empty">{text("没有匹配的任务", "No matching tasks")}</p>}
          </div>
        </section>
        </div>
      </>}
    </section>
  );
}

function NotesWorkspace({ state, updateState }: {
  state: AppState;
  updateState: (updater: (state: AppState) => AppState) => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const notes = state.notes
    .filter((note) => !note.deletedAt)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const [selectedId, setSelectedId] = useState<string | undefined>(() => notes[0]?.id);
  const selected = notes.find((note) => note.id === selectedId) || notes[0];

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (!selected && selectedId) setSelectedId(undefined);
  }, [selected, selectedId]);

  const addNote = () => {
    if (state.notes.length >= MAX_ENTITY_RECORDS) {
      window.alert(text("笔记已达到 5000 条安全上限，请先导出备份并整理旧内容", "Notes reached the 5,000 item safety limit. Export a backup and remove old content first."));
      return;
    }
    const updatedAt = nowIso();
    const note: Note = { id: uid(), title: text("未命名笔记", "Untitled note"), body: "", updatedAt };
    updateState((current) => ({ ...current, notes: [...current.notes, note] }));
    setSelectedId(note.id);
  };
  const updateNote = (patch: Partial<Pick<Note, "title" | "body">>) => {
    if (!selected) return;
    updateState((current) => ({
      ...current,
      notes: current.notes.map((note) => (
        note.id === selected.id ? { ...note, ...patch, updatedAt: nowIso() } : note
      ))
    }));
  };
  const deleteNote = () => {
    if (!selected || !window.confirm(text(`删除“${noteTitleFor(language, selected.title) || "未命名笔记"}”？`, `Delete "${noteTitleFor(language, selected.title) || "Untitled note"}"?`))) return;
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      notes: current.notes.map((note) => (
        note.id === selected.id ? { ...note, deletedAt, updatedAt: deletedAt } : note
      ))
    }));
    setSelectedId(notes.find((note) => note.id !== selected.id)?.id);
  };

  return (
    <section className="lucid-notes-workspace">
      <aside className="lucid-notes-index">
        <header>
          <div><span>{text("笔记库", "Library")}</span><strong>{text(`${notes.length} 条笔记`, `${notes.length} notes`)}</strong></div>
          <button type="button" onClick={addNote} title={text("新建笔记", "New note")} aria-label={text("新建笔记", "New note")}><Plus size={17} /></button>
        </header>
        <div className="lucid-note-list">
          {notes.map((note) => (
            <button type="button" className={note.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(note.id)} key={note.id}>
              <strong>{noteTitleFor(language, note.title) || text("未命名笔记", "Untitled note")}</strong>
              <span>{noteBodyFor(language, note.body) || text("空白笔记", "Empty note")}</span>
              <small>{new Date(note.updatedAt).toLocaleDateString(language, { month: "short", day: "numeric" })}</small>
            </button>
          ))}
          {!notes.length && <p>{text("从一张空白纸开始。", "Start with a blank page.")}</p>}
        </div>
      </aside>

      <article className="lucid-note-editor">
        {selected ? (
          <>
            <header>
              <span>{new Date(selected.updatedAt).toLocaleString(language, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <button type="button" onClick={deleteNote} title={text("删除笔记", "Delete note")} aria-label={text("删除笔记", "Delete note")}><Trash2 size={16} /></button>
            </header>
            <input
              className="lucid-note-title"
              maxLength={MAX_ENTITY_NAME_CHARS}
              value={noteTitleFor(language, selected.title)}
              onChange={(event) => updateNote({ title: event.target.value })}
              placeholder={text("标题", "Title")}
              aria-label={text("笔记标题", "Note title")}
            />
            <textarea
              className="lucid-note-body"
              maxLength={MAX_QUICK_NOTE_CHARS}
              value={noteBodyFor(language, selected.body)}
              onChange={(event) => updateNote({ body: event.target.value })}
              placeholder={text("写下想法、链接或下一步…", "Write down an idea, link, or next step...")}
              aria-label={text("笔记内容", "Note content")}
            />
            <footer><ShieldCheck size={14} /><span>{text("自动保存在本机；登录后可同步到你的账号。", "Saved locally automatically; sign in to sync with your account.")}</span></footer>
          </>
        ) : (
          <button type="button" className="lucid-note-empty" onClick={addNote}><StickyNote size={24} /><span>{text("新建第一条笔记", "Create your first note")}</span></button>
        )}
      </article>
    </section>
  );
}

function TasksWorkspace({ state, updateState }: {
  state: AppState;
  updateState: (updater: (state: AppState) => AppState) => void;
}) {
  const language = useUiLanguage();
  const textFor = (zh: string, en: string) => localized(language, zh, en);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"open" | "all" | "done">("open");
  const [fixedTask, setFixedTask] = useState(false);
  const [recurrence, setRecurrence] = useState<NonNullable<Todo["recurrence"]>>("daily");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderWeekday, setReminderWeekday] = useState(new Date().getDay());
  const [editingScheduleId, setEditingScheduleId] = useState<string>();
  const weekdayNames = language === "en-US"
    ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const todos = state.todos.filter((todo) => !todo.deletedAt).sort((left, right) => left.order - right.order);
  const dueTodos = todos.filter((todo) => !todo.recurrence || isRecurringTodoDueOn(todo));
  const visibleTodos = todos.filter((todo) => {
    const completed = isTodoCompletedForDate(todo);
    if (filter === "all") return true;
    if (todo.recurrence && !isRecurringTodoDueOn(todo)) return false;
    return filter === "done" ? completed : !completed;
  });
  const doneCount = dueTodos.filter((todo) => isTodoCompletedForDate(todo)).length;
  const progress = dueTodos.length ? Math.round(doneCount / dueTodos.length * 100) : 0;

  const addTodo = async () => {
    const value = text.trim();
    if (!value) return;
    if (value.length > MAX_TODO_TEXT_CHARS || state.todos.length >= MAX_ENTITY_RECORDS) {
      window.alert(textFor("任务内容过长或已达到安全上限", "The task is too long or the safety limit has been reached."));
      return;
    }
    const todo: Todo = {
      id: uid(),
      text: value,
      done: false,
      order: todos.length,
      recurrence: fixedTask ? recurrence : undefined,
      reminderTime: fixedTask && reminderTime ? reminderTime : undefined,
      reminderWeekday: fixedTask && recurrence === "weekly" ? reminderWeekday : undefined,
      updatedAt: nowIso()
    };
    if (todo.reminderTime) {
      const permissionGranted = await requestTaskReminderPermission().catch(() => false);
      if (!permissionGranted) {
        window.alert(textFor("固定任务已保存，但通知权限未开启；开启权限前不会弹出提醒。", "The recurring task was saved, but notification permission is off. It will not alert until permission is enabled."));
      }
    }
    updateState((current) => ({ ...current, todos: [...current.todos, todo] }));
    setText("");
    setReminderTime("");
    setFilter("open");
  };
  const toggleTodo = (id: string) => updateState((current) => ({
    ...current,
    todos: current.todos.map((todo) => todo.id === id ? { ...todo, ...nextTodoCompletion(todo), updatedAt: nowIso() } : todo)
  }));
  const updateTodoSchedule = (id: string, patch: Partial<Pick<Todo, "recurrence" | "reminderTime" | "reminderWeekday">>) => updateState((current) => ({
    ...current,
    todos: current.todos.map((todo) => todo.id === id ? { ...todo, ...patch, done: false, completedOn: undefined, updatedAt: nowIso() } : todo)
  }));
  const deleteTodo = (id: string) => {
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      todos: current.todos.map((todo) => todo.id === id ? { ...todo, deletedAt, updatedAt: deletedAt } : todo)
    }));
  };

  return (
    <section className="lucid-tasks-workspace">
      <header className="lucid-task-overview">
        <div className="lucid-task-progress" style={{ "--task-progress": `${progress * 3.6}deg` } as React.CSSProperties}>
          <span><strong>{progress}</strong><small>%</small></span>
        </div>
        <div>
          <span>{textFor("今天", "Today")}</span>
          <h2>{dueTodos.length - doneCount ? textFor(`${dueTodos.length - doneCount} 件事等待完成`, `${dueTodos.length - doneCount} tasks remaining`) : textFor("今天的任务已完成", "Everything is complete for today")}</h2>
          <p>{textFor(`已完成 ${doneCount} / ${dueTodos.length}`, `${doneCount} of ${dueTodos.length} completed`)}</p>
        </div>
      </header>

      <form className="lucid-task-composer" onSubmit={(event) => { event.preventDefault(); void addTodo(); }}>
        <div className="lucid-task-entry">
          <Plus size={18} aria-hidden="true" />
          <input value={text} maxLength={MAX_TODO_TEXT_CHARS} onChange={(event) => setText(event.target.value)} placeholder={textFor("添加下一件要做的事", "Add the next thing to do")} aria-label={textFor("新任务", "New task")} />
          <button type="submit" disabled={!text.trim()}>{textFor("添加", "Add")}</button>
        </div>
        <div className="lucid-task-schedule-controls">
          <button type="button" className={fixedTask ? "active" : ""} aria-pressed={fixedTask} onClick={() => setFixedTask((value) => !value)}><Repeat2 size={15} />{textFor("固定任务", "Recurring")}</button>
          {fixedTask && (
            <>
              <label>
                <span className="sr-only">{textFor("重复周期", "Repeat interval")}</span>
                <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as NonNullable<Todo["recurrence"]>)}>
                  <option value="daily">{textFor("每天", "Every day")}</option>
                  <option value="weekdays">{textFor("工作日", "Weekdays")}</option>
                  <option value="weekly">{textFor("每周", "Every week")}</option>
                </select>
              </label>
              {recurrence === "weekly" && (
                <label>
                  <span className="sr-only">{textFor("星期", "Weekday")}</span>
                  <select value={reminderWeekday} onChange={(event) => setReminderWeekday(Number(event.target.value))}>
                    {weekdayNames.map((name, index) => <option value={index} key={name}>{name}</option>)}
                  </select>
                </label>
              )}
              <label className="lucid-reminder-time"><Bell size={14} /><span className="sr-only">{textFor("提醒时间", "Reminder time")}</span><input type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /></label>
            </>
          )}
        </div>
      </form>

      <div className="lucid-task-toolbar">
        <div role="tablist" aria-label={textFor("任务筛选", "Task filter")}>
          {(["open", "all", "done"] as const).map((value) => (
            <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>
              {value === "open" ? textFor("待处理", "Open") : value === "all" ? textFor("全部", "All") : textFor("已完成", "Completed")}
            </button>
          ))}
        </div>
        <span>{textFor(`${visibleTodos.length} 项`, `${visibleTodos.length} items`)}</span>
      </div>

      <div className="lucid-task-list">
        {visibleTodos.map((todo) => {
          const completed = isTodoCompletedForDate(todo);
          return (
          <div className={`${completed ? "is-done" : ""} ${todo.recurrence ? "is-recurring" : ""}`} key={todo.id}>
            <label>
              <input type="checkbox" checked={completed} onChange={() => toggleTodo(todo.id)} />
              <span>{todoTextFor(language, todo.text)}</span>
            </label>
            {todo.recurrence ? (
              <button type="button" className="lucid-task-schedule" onClick={() => setEditingScheduleId((current) => current === todo.id ? undefined : todo.id)}>
                <Repeat2 size={13} />
                <span>{recurrenceLabel(todo, language)}</span>
                {todo.reminderTime ? <><Bell size={12} /><span>{todo.reminderTime}</span></> : <BellOff size={12} />}
              </button>
            ) : <small>{completed ? textFor("已完成", "Completed") : textFor("待处理", "Open")}</small>}
            <button type="button" title={textFor("删除任务", "Delete task")} aria-label={textFor("删除任务", "Delete task")} onClick={() => deleteTodo(todo.id)}><X size={15} /></button>
            {editingScheduleId === todo.id && todo.recurrence && (
              <div className="lucid-task-schedule-editor">
                <select value={todo.recurrence} onChange={(event) => updateTodoSchedule(todo.id, {
                  recurrence: event.target.value as NonNullable<Todo["recurrence"]>,
                  reminderWeekday: event.target.value === "weekly" ? new Date().getDay() : undefined
                })}>
                  <option value="daily">{textFor("每天", "Every day")}</option>
                  <option value="weekdays">{textFor("工作日", "Weekdays")}</option>
                  <option value="weekly">{textFor("每周", "Every week")}</option>
                </select>
                {todo.recurrence === "weekly" && (
                  <select aria-label={textFor("星期", "Weekday")} value={todo.reminderWeekday ?? 0} onChange={(event) => updateTodoSchedule(todo.id, { reminderWeekday: Number(event.target.value) })}>
                    {weekdayNames.map((name, index) => <option value={index} key={name}>{name}</option>)}
                  </select>
                )}
                <input type="time" value={todo.reminderTime || ""} onChange={(event) => updateTodoSchedule(todo.id, { reminderTime: event.target.value || undefined })} />
                <button type="button" onClick={() => {
                  setEditingScheduleId(undefined);
                  if (!todo.reminderTime) return;
                  void requestTaskReminderPermission().then((granted) => {
                    if (!granted) window.alert(textFor("提醒时间已保存，但通知权限未开启；开启权限前不会弹出提醒。", "The reminder time was saved, but notification permission is off. It will not alert until permission is enabled."));
                  }).catch(() => undefined);
                }}><Check size={14} />{textFor("完成", "Done")}</button>
              </div>
            )}
          </div>
        )})}
        {!visibleTodos.length && (
          <p className="lucid-task-empty">{filter === "done" ? textFor("还没有已完成任务。", "No completed tasks yet.") : textFor("这里很安静，可以专注下一件事。", "Nothing here yet. Focus on the next thing.")}</p>
        )}
      </div>
    </section>
  );
}

function Dock({ shortcuts }: { shortcuts: Shortcut[] }) {
  if (!shortcuts.length) return null;
  return (
    <nav className="dock" aria-label="固定快捷入口">
      {shortcuts.slice(0, 14).map((shortcut) => (
        <a key={shortcut.id} data-shortcut-id={shortcut.id} href={safeHttpHref(shortcut.url)} title={shortcut.title} target="_blank" rel="noreferrer">
          <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} iconText={shortcut.iconText} iconColor={shortcut.iconColor} iconUpdatedAt={shortcut.iconUpdatedAt} title={shortcut.title} fallback={shortcut.title.slice(0, 1)} />
        </a>
      ))}
    </nav>
  );
}

function ShortcutRenderSentinel({ onVisible }: { onVisible: () => void }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      onVisibleRef.current();
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onVisibleRef.current();
    }, { rootMargin: "600px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  return <div ref={sentinelRef} className="shortcut-render-sentinel" aria-hidden="true" />;
}

const contextMenuPosition = (x: number, y: number, width: number, height: number) => ({
  left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
  top: Math.max(8, Math.min(y, window.innerHeight - height - 8))
});

function useContextMenuSurface<T extends HTMLElement>(onClose: () => void) {
  const surfaceRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!surfaceRef.current?.contains(event.target as Node)) onCloseRef.current();
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    const closeOnResize = () => onCloseRef.current();
    const frame = window.requestAnimationFrame(() => {
      surfaceRef.current?.focus({ preventScroll: true });
      window.addEventListener("pointerdown", closeOutside, true);
      window.addEventListener("keydown", closeOnEscape);
      window.addEventListener("resize", closeOnResize);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnResize);
    };
  }, []);
  return surfaceRef;
}

function ShortcutContextMenu({ menu, shortcut, onHome, onClose, onEdit, onToggleHome, onDelete }: {
  menu: Exclude<ShortcutMenuState, null>;
  shortcut?: Shortcut;
  onHome: boolean;
  onClose: () => void;
  onEdit: (shortcut: Shortcut) => void;
  onToggleHome: (shortcut: Shortcut) => void;
  onDelete: (id: string) => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const surfaceRef = useContextMenuSurface<HTMLDivElement>(onClose);
  if (!shortcut) return null;
  const position = contextMenuPosition(menu.x, menu.y, 188, 188);
  return createPortal(
    <div ref={surfaceRef} className="shortcut-menu" role="menu" aria-label={text(`${shortcut.title}快捷操作`, `${shortcut.title} actions`)} tabIndex={-1} style={position} onContextMenu={(event) => event.preventDefault()}>
      <a role="menuitem" href={safeHttpHref(shortcut.url)} target="_blank" rel="noreferrer">{text("打开新标签页", "Open in new tab")}</a>
      <button type="button" role="menuitem" onClick={() => onToggleHome(shortcut)}><House size={15} /> {onHome ? text("从主页移除", "Remove from Home") : text("添加到主页", "Add to Home")}</button>
      <button type="button" role="menuitem" onClick={() => onEdit(shortcut)}><Edit3 size={15} /> {text("更换图标与信息", "Change icon and details")}</button>
      <button type="button" role="menuitem" className="danger" onClick={() => onDelete(shortcut.id)}><Trash2 size={15} /> {text("删除", "Delete")}</button>
    </div>,
    document.body
  );
}

function FolderContextMenu({ menu, folder, onHome, onClose, onOpen, onEdit, onToggleHome, onDelete }: {
  menu: Exclude<FolderMenuState, null>;
  folder?: ShortcutFolder;
  onHome: boolean;
  onClose: () => void;
  onOpen: (folder: ShortcutFolder) => void;
  onEdit: (folder: ShortcutFolder) => void;
  onToggleHome: (folder: ShortcutFolder) => void;
  onDelete: (folder: ShortcutFolder) => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const surfaceRef = useContextMenuSurface<HTMLDivElement>(onClose);
  if (!folder) return null;
  const position = contextMenuPosition(menu.x, menu.y, 196, 188);
  return createPortal(
    <div ref={surfaceRef} className="shortcut-menu" role="menu" aria-label={text(`${folder.name}文件夹操作`, `${folder.name} folder actions`)} tabIndex={-1} style={position} onContextMenu={(event) => event.preventDefault()}>
      <button type="button" role="menuitem" onClick={() => onOpen(folder)}><Folder size={15} /> {text("打开文件夹", "Open folder")}</button>
      <button type="button" role="menuitem" onClick={() => onToggleHome(folder)}><House size={15} /> {onHome ? text("从主页移除", "Remove from Home") : text("添加到主页", "Add to Home")}</button>
      <button type="button" role="menuitem" onClick={() => onEdit(folder)}><Edit3 size={15} /> {text("编辑文件夹", "Edit folder")}</button>
      <button type="button" role="menuitem" className="danger" onClick={() => onDelete(folder)}><Trash2 size={15} /> {text("删除文件夹", "Delete folder")}</button>
    </div>,
    document.body
  );
}

function PageContextMenu({ menu, onClose, onAddFolder, onAddShortcut, onAddGroup, onSettings }: {
  menu: Exclude<PageMenuState, null>;
  onClose: () => void;
  onAddFolder: () => void;
  onAddShortcut: () => void;
  onAddGroup: () => void;
  onSettings: () => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const position = contextMenuPosition(menu.x, menu.y, 220, 260);
  const surfaceRef = useContextMenuSurface<HTMLDivElement>(onClose);
  return createPortal(
    <div ref={surfaceRef} className="shortcut-menu page-menu" role="menu" aria-label={text("页面操作", "Page actions")} tabIndex={-1} style={position} onContextMenu={(event) => event.preventDefault()}>
      <button type="button" role="menuitem" onClick={onAddShortcut}><Plus size={15} /> {text("添加网站", "Add site")}</button>
      <button type="button" role="menuitem" onClick={onAddFolder}><FolderPlus size={15} /> {text("新建文件夹", "New folder")}</button>
      <button type="button" role="menuitem" onClick={onAddGroup}><Layers size={15} /> {text("新建分类", "New category")}</button>
      <button type="button" role="menuitem" onClick={onSettings}><Palette size={15} /> {text("资源中心", "Resource center")}</button>
    </div>,
    document.body
  );
}

function WidgetSizePicker({ widgetKey, value, onChange, disabled = false, compact = false }: {
  widgetKey: WidgetKey;
  value: WidgetSize;
  onChange: (size: WidgetSize) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const meta = widgetLibraryMeta[widgetKey];
  const PreviewIcon = meta.Icon;
  return (
    <div className={`widget-size-picker ${compact ? "compact" : ""}`} role="radiogroup" aria-label={text(`${widgetNames[widgetKey]}尺寸`, `${widgetEnglishNames[widgetKey]} size`)}>
      {widgetSizeOptions[widgetKey].map((size) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === size}
          className={`widget-size-option widget-size-option-${size} ${value === size ? "active" : ""}`}
          key={size}
          onClick={() => onChange(size)}
          disabled={disabled}
        >
          <span className={`widget-size-thumbnail widget-tone-${widgetKey}`} aria-hidden="true">
            <span className="widget-size-thumbnail-head"><PreviewIcon size={compact ? 11 : 13} /><i /></span>
            <strong>{widgetPreviewFor(language, widgetKey)}</strong>
            <span className="widget-size-thumbnail-lines"><i /><i /><i /></span>
          </span>
          <span className="widget-size-option-copy">
            <strong>{language === "en-US" ? widgetEnglishSizeLabels[size] : widgetSizeLabels[size]}</strong>
            {!compact && <small>{language === "en-US" ? widgetEnglishSizeDetails[size] : widgetSizeDetails[size]}</small>}
          </span>
          <span className="widget-size-check"><Check size={13} /></span>
        </button>
      ))}
    </div>
  );
}

function WidgetContextMenu({ menu, size, siteFloating, layoutEditing, onClose, onToggleLayout, onResize, onOpenLibrary, onRefresh, onRotateWallpaper, onToggleSiteFloating, onHide }: {
  menu: Exclude<WidgetMenuState, null>;
  size?: WidgetSize;
  siteFloating: boolean;
  layoutEditing: boolean;
  onClose: () => void;
  onToggleLayout: () => void;
  onResize: (key: WidgetKey, size: WidgetSize) => void;
  onOpenLibrary: () => void;
  onRefresh: () => void;
  onRotateWallpaper: () => void;
  onToggleSiteFloating: () => void;
  onHide: (key: WidgetKey) => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const surfaceRef = useContextMenuSurface<HTMLDivElement>(onClose);
  const position = contextMenuPosition(menu.x, menu.y, 344, menu.widgetKey ? 560 : 250);
  const widgetName = menu.widgetKey ? widgetNameFor(language, menu.widgetKey) : text("主页", "Home");
  const WidgetIcon = menu.widgetKey ? widgetLibraryMeta[menu.widgetKey].Icon : Palette;
  return createPortal(
    <div ref={surfaceRef} className="shortcut-menu page-menu widget-menu" role="dialog" aria-label={text(`${widgetName}设置`, `${widgetName} settings`)} tabIndex={-1} style={position} onContextMenu={(event) => event.preventDefault()}>
      <div className="widget-menu-heading">
        <span className="widget-menu-icon"><WidgetIcon size={18} /></span>
        <span><strong>{widgetName}</strong><small>{menu.widgetKey ? text("尺寸会立即显示在主页", "Size updates immediately on Home") : text("主页外观与数据", "Home appearance and data")}</small></span>
        <button type="button" className="widget-menu-close" onClick={onClose} aria-label={text("关闭", "Close")}><X size={15} /></button>
      </div>
      {menu.widgetKey && size && (
        <WidgetSizePicker widgetKey={menu.widgetKey} value={size} onChange={(nextSize) => onResize(menu.widgetKey!, nextSize)} />
      )}
      <div className="widget-menu-actions">
        <button onClick={onToggleLayout}>{layoutEditing ? <Check size={14} /> : <LayoutGrid size={14} />} {layoutEditing ? text("完成布局编辑", "Finish layout editing") : text("编辑主页布局", "Edit Home layout")}</button>
        {!menu.widgetKey && <button onClick={onToggleSiteFloating}>{siteFloating ? <EyeOff size={14} /> : <Sparkles size={14} />} {siteFloating ? text("关闭图标浮动", "Turn off icon motion") : text("开启图标浮动", "Turn on icon motion")}</button>}
        <button onClick={onOpenLibrary}><Palette size={14} /> {text("更多小组件", "More widgets")}</button>
        <button onClick={onRefresh}><RefreshCcw size={14} /> {text("刷新数据", "Refresh data")}</button>
        <button onClick={onRotateWallpaper}><Shuffle size={14} /> {text("更换壁纸", "Change wallpaper")}</button>
        {menu.widgetKey && <button className="danger" onClick={() => onHide(menu.widgetKey!)}><EyeOff size={14} /> {text("隐藏组件", "Hide widget")}</button>}
      </div>
    </div>,
    document.body
  );
}

function LayerRail({ activeLayer, groups, shortcuts, onSelect, onAddGroup, onRenameGroup, onDeleteGroup }: {
  activeLayer: string;
  groups: AppState["shortcutGroups"];
  shortcuts: Shortcut[];
  onSelect: (layer: string) => void;
  onAddGroup: () => void;
  onRenameGroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const countFor = (groupId: string) => shortcuts.filter((shortcut) => shortcut.groupId === groupId).length;
  return (
    <nav className="layer-rail panel" aria-label={text("网站分类", "Site categories")}>
      <div className="layer-head">
        <span>{text("分类", "Categories")}</span>
        <button type="button" title={text("新增分类", "Add category")} aria-label={text("新增分类", "Add category")} onClick={onAddGroup}><Plus size={14} /></button>
      </div>
      <button className={activeLayer === "all" ? "active" : ""} onClick={() => onSelect("all")}>
        <Layers size={17} />
        <span>{text("全部", "All")}</span>
        <small>{shortcuts.length}</small>
      </button>
      <button className={activeLayer === "pinned" ? "active" : ""} onClick={() => onSelect("pinned")}>
        <Star size={17} />
        <span>{text("固定", "Pinned")}</span>
        <small>{shortcuts.filter((shortcut) => shortcut.pinned).length}</small>
      </button>
      {groups.map((group) => (
        <div className={`layer-row ${activeLayer === group.id ? "active" : ""}`} key={group.id}>
          <button className="layer-main" onClick={() => onSelect(group.id)}>
            <span className="group-dot" style={{ backgroundColor: group.color }} />
            <span>{group.name}</span>
            <small>{countFor(group.id)}</small>
          </button>
          <div className="layer-actions">
            <button type="button" title={text("重命名分类", "Rename category")} aria-label={text("重命名分类", "Rename category")} onClick={() => onRenameGroup(group.id)}><Edit3 size={13} /></button>
            <button type="button" title={text("删除分类", "Delete category")} aria-label={text("删除分类", "Delete category")} onClick={() => onDeleteGroup(group.id)}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </nav>
  );
}

function Widget({ title, meta, action, children, tone = "default", size = "medium", widgetKey }: { title: string; meta?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; tone?: string; size?: WidgetSize; widgetKey?: WidgetKey }) {
  const widgetMeta = widgetKey ? widgetLibraryMeta[widgetKey] : undefined;
  const WidgetIcon = widgetMeta?.Icon;
  return (
    <section
      className={`widget widget-${tone} widget-size-${size}`}
      data-widget-key={widgetKey}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button") || target.closest("input") || target.closest("select") || target.closest("textarea") || target.closest("a") || target.closest("label")) {
          event.stopPropagation();
        }
      }}
    >
      <div className="widget-title">
        <div className="widget-heading">
          {WidgetIcon && <span className="widget-symbol"><WidgetIcon size={17} /></span>}
          <div className="widget-heading-copy">
            <h3>{title}</h3>
            {meta && <span className="widget-meta">{meta}</span>}
          </div>
        </div>
        <div className="widget-actions">
          {action}
        </div>
      </div>
      <div className="widget-content">{children}</div>
    </section>
  );
}

function WeatherWidget({ widgetKey, size, weather, city, useLocation, refreshing, onRefresh }: { widgetKey: WidgetKey; size: WidgetSize; weather?: WeatherState; city: string; useLocation: boolean; refreshing: boolean; onRefresh: () => Promise<void> }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const source = safeHttpHref(weather?.sourceUrl || "https://open-meteo.com/");
  const dayLimit = size === "small" ? 0 : size === "medium" ? 4 : 6;
  const days = weather?.forecast?.slice(0, dayLimit) || [];
  const placeLabel = language === "en-US"
    ? (useLocation ? "Current location" : city)
    : (weather ? weather.city : city);
  const compactPlace = placeLabel
    .replace(/\s*,\s*(China|中国)$/i, "")
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ") || placeLabel;
  const precipitation = weather?.forecast?.[0]?.precipitationProbability;
  return (
    <Widget
      title={text("天气", "Weather")}
      meta={<><MapPin size={10} />{compactPlace || "Shanghai"}</>}
      widgetKey={widgetKey}
      tone={`weather weather-${weatherToneForCode(weather?.weatherCode)}`}
      size={size}
      action={<button className="weather-unit" aria-label={refreshing ? text("正在刷新天气", "Refreshing weather") : text("刷新天气", "Refresh weather")} title={refreshing ? text("正在刷新", "Refreshing") : text("刷新天气", "Refresh weather")} disabled={refreshing} onClick={() => void onRefresh()}><RefreshCcw size={14} className={refreshing ? "spin" : undefined} /></button>}
    >
      <a className={`sample-weather ${weather ? "" : "is-loading"}`} href={source} target="_blank" rel="noreferrer" title={text("打开天气数据来源", "Open weather data source")}>
        {weather ? (
          <>
            <div className="sample-weather-current">
              <div className="sample-weather-copy">
                <strong>{Math.round(weather.temperature)}°</strong>
                <span>{weatherLabelFor(weather.weatherCode, language)}</span>
                <small>{text("体感温度", "Feels like")} {Math.round(weather.temperature + Math.min(3, weather.windSpeed / 12))}°</small>
              </div>
              <div className={`sample-weather-status weather-${weatherToneForCode(weather.weatherCode)}`} aria-hidden="true">
                <WeatherConditionIcon code={weather.weatherCode} size={42} />
                <span>{weatherLabelFor(weather.weatherCode, language)}</span>
              </div>
            </div>
            {size === "small" ? (
              <div className="sample-weather-compact-facts">
                <span><Wind size={12} />{Math.round(weather.windSpeed)} km/h</span>
                <span><Droplets size={12} />{precipitation ?? 0}%</span>
              </div>
            ) : (
              <div className="sample-weather-facts" aria-label={text("当前天气详情", "Current weather details")}>
                <span><Wind size={13} /><small>{text("风速", "Wind")}</small><strong>{Math.round(weather.windSpeed)} km/h</strong></span>
                <span><Droplets size={13} /><small>{text("降水", "Rain")}</small><strong>{precipitation ?? 0}%</strong></span>
                <span><MapPin size={13} /><small>{text("位置", "Location")}</small><strong>{useLocation ? text("实时", "Live") : text("城市", "City")}</strong></span>
              </div>
            )}
          </>
        ) : (
          <div className="sample-weather-loading">
            <span><CloudSun size={25} /></span>
            <strong>{text("正在准备天气", "Preparing weather")}</strong>
            <small>{useLocation ? text("读取设备位置", "Reading device location") : text(`查询 ${city}`, `Looking up ${city}`)}</small>
          </div>
        )}
      </a>
      {days.length > 0 && (
        <div className="sample-weather-forecast" aria-label={text(`${days.length} 天天气预报`, `${days.length}-day forecast`)}>
          {days.map((day) => {
            const date = new Date(`${day.date}T00:00:00`);
            const dayTone = weatherToneForCode(day.weatherCode);
            return (
              <a className={`forecast-${dayTone}`} href={source} target="_blank" rel="noreferrer" key={day.date} title={`${day.date} ${weatherLabelFor(day.weatherCode, language)}`}>
                <span>{date.toLocaleDateString(language, { weekday: "short" })}</span>
                <span className="forecast-condition">
                  <WeatherConditionIcon code={day.weatherCode} size={23} />
                  <em>{weatherLabelFor(day.weatherCode, language)}</em>
                </span>
                <strong>{Math.round(day.temperatureMax)}° <small>{Math.round(day.temperatureMin)}°</small></strong>
              </a>
            );
          })}
        </div>
      )}
    </Widget>
  );
}

function CalendarWidget({ widgetKey, size, date, state, updateState }: { widgetKey: WidgetKey; size: WidgetSize; date: Date; state: AppState; updateState: (updater: (state: AppState) => AppState) => void }) {
  const language = useUiLanguage();
  const textFor = (zh: string, en: string) => localized(language, zh, en);
  const [editingDate, setEditingDate] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const records = state.settings.calendarRecords || {};
  const viewDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth() + monthOffset, Math.min(date.getDate(), 28)),
    [date, monthOffset]
  );
  const days = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const start = first.getDay();
    const count = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    return Array.from({ length: start + count }, (_, index) => {
      if (index < start) return undefined;
      const day = index - start + 1;
      const value = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
      return { day, key: calendarDateKey(value) };
    });
  }, [viewDate]);

  const openDate = (key: string) => {
    setEditingDate(key);
    setDraft(records[key] || "");
  };
  const saveRecord = () => {
    if (!editingDate) return;
    const text = draft.trim();
    if (text.length > MAX_CALENDAR_RECORD_CHARS) {
      window.alert(textFor("单条日历记录不能超过 10000 个字符", "A calendar entry cannot exceed 10,000 characters."));
      return;
    }
    if (text && !records[editingDate] && Object.keys(records).length >= MAX_ENTITY_RECORDS) {
      window.alert(textFor("日历记录已达到 5000 条安全上限，请先删除不再需要的记录", "Calendar entries reached the 5,000 item safety limit. Remove entries you no longer need."));
      return;
    }
    updateState((current) => {
      const nextRecords = { ...(current.settings.calendarRecords || {}) };
      if (text) nextRecords[editingDate] = text;
      else delete nextRecords[editingDate];
      return {
        ...current,
        settings: { ...current.settings, calendarRecords: nextRecords, updatedAt: nowIso() }
      };
    });
    setEditingDate(undefined);
  };
  const clearRecord = () => {
    if (!editingDate) return;
    updateState((current) => {
      const nextRecords = { ...(current.settings.calendarRecords || {}) };
      delete nextRecords[editingDate];
      return {
        ...current,
        settings: { ...current.settings, calendarRecords: nextRecords, updatedAt: nowIso() }
      };
    });
    setDraft("");
    setEditingDate(undefined);
  };

  const todayKey = calendarDateKey(date);
  const weekdayLabel = date.toLocaleDateString(language, { weekday: "long" });
  const monthPrefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;
  const monthRecordCount = Object.keys(records).filter((key) => key.startsWith(monthPrefix)).length;
  const sampleWeekDays = useMemo(() => {
    const mondayOffset = (viewDate.getDay() + 6) % 7;
    const monday = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const value = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
      return {
        date: value,
        key: calendarDateKey(value),
        label: value.toLocaleDateString(language, { weekday: "short" }).toUpperCase()
      };
    });
  }, [language, viewDate]);
  const agendaEntries = Object.entries(records)
    .filter(([, text]) => Boolean(text.trim()))
    .sort(([left], [right]) => left.localeCompare(right))
    .filter(([key]) => key >= todayKey)
    .slice(0, 3);

  if (size === "small") {
    return (
      <Widget title={viewDate.toLocaleDateString(language, { month: "long" })} meta={viewDate.getFullYear()} widgetKey={widgetKey} tone="calendar" size={size} action={<button type="button" title={textFor("记录今天", "Add today's entry")} onClick={() => openDate(todayKey)}><CalendarDays size={16} /></button>}>
        <button type="button" className="calendar-mini-card" onClick={() => openDate(todayKey)} title={records[todayKey] || textFor("点击记录今天", "Add today's entry")}>
          <span className="calendar-mini-month">{date.toLocaleDateString(language, { month: "short" })}</span>
          <strong>{date.getDate()}</strong>
          <span className="calendar-mini-weekday">{weekdayLabel}</span>
          <small>{records[todayKey] || textFor("今天", "Today")}</small>
        </button>
        {editingDate && (
          <DialogShell title={calendarDateLabel(editingDate, language)} onClose={() => setEditingDate(undefined)} className="widget-popover calendar-popover">
            <div className="calendar-editor">
              <textarea maxLength={MAX_CALENDAR_RECORD_CHARS} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={textFor("记录这一天要做的事", "Write down plans for this day")} autoFocus />
              <div className="calendar-editor-actions">
                <button type="button" onClick={clearRecord}>{textFor("清除", "Clear")}</button>
                <button type="button" className="primary-mini" onClick={saveRecord}>{textFor("保存", "Save")}</button>
              </div>
            </div>
          </DialogShell>
        )}
      </Widget>
    );
  }

  if (size === "wide") {
    return (
      <Widget
        title={textFor("日历", "Calendar")}
        widgetKey={widgetKey}
        tone="calendar"
        size={size}
        action={(
          <div className="sample-calendar-controls">
            <button type="button" title={textFor("回到今天", "Go to today")} onClick={() => setMonthOffset(0)}>{textFor("今天", "Today")}</button>
            <button type="button" title={textFor("上个月", "Previous month")} aria-label={textFor("上个月", "Previous month")} onClick={() => setMonthOffset((value) => value - 1)}><ChevronLeft size={13} /></button>
            <button type="button" title={textFor("下个月", "Next month")} aria-label={textFor("下个月", "Next month")} onClick={() => setMonthOffset((value) => value + 1)}><ChevronRight size={13} /></button>
          </div>
        )}
      >
        <div className="sample-calendar">
          <strong className="sample-calendar-month">{viewDate.toLocaleDateString(language, { month: "long", year: "numeric" })}</strong>
          <div className="sample-calendar-week" aria-label={textFor("本周日期", "Dates this week")}>
            {sampleWeekDays.map((item) => (
              <button
                type="button"
                className={item.key === todayKey ? "today" : ""}
                key={item.key}
                onClick={() => openDate(item.key)}
                title={records[item.key] || textFor("点击记录当天事项", "Add an entry for this day")}
              >
                <span>{item.label}</span>
                <strong>{item.date.getDate()}</strong>
              </button>
            ))}
          </div>
          <div className="sample-calendar-agenda">
            {agendaEntries.map(([key, text], index) => (
              <button type="button" key={key} onClick={() => openDate(key)} title={calendarDateLabel(key, language)}>
                <span>{index === 0 ? textFor("今天", "Today") : calendarDateLabel(key, language)}</span>
                <strong>{text}</strong>
              </button>
            ))}
            {!agendaEntries.length && (
              <>
                <button type="button" className="empty-event" onClick={() => openDate(todayKey)}>
                  <span>{textFor("今天", "Today")}</span>
                  <strong>{textFor("新日程", "New event")}</strong>
                </button>
                <span className="sample-calendar-placeholder" aria-hidden="true" />
                <span className="sample-calendar-placeholder" aria-hidden="true" />
              </>
            )}
          </div>
          <button type="button" className="sample-calendar-add" onClick={() => openDate(todayKey)}><Plus size={14} /> {textFor("新日程", "New event")}</button>
        </div>
        {editingDate && (
          <DialogShell title={calendarDateLabel(editingDate, language)} onClose={() => setEditingDate(undefined)} className="widget-popover calendar-popover">
            <div className="calendar-editor">
              <textarea maxLength={MAX_CALENDAR_RECORD_CHARS} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={textFor("记录这一天要做的事", "Write down plans for this day")} autoFocus />
              <div className="calendar-editor-actions">
                <button type="button" onClick={clearRecord}>{textFor("清除", "Clear")}</button>
                <button type="button" className="primary-mini" onClick={saveRecord}>{textFor("保存", "Save")}</button>
              </div>
            </div>
          </DialogShell>
        )}
      </Widget>
    );
  }

  return (
    <Widget title={viewDate.toLocaleDateString(language, { month: "long" })} meta={textFor(`${monthRecordCount} 条记录`, `${monthRecordCount} entries`)} widgetKey={widgetKey} tone="calendar" size={size} action={<button type="button" title={textFor("记录今天", "Add today's entry")} onClick={() => openDate(todayKey)}><CalendarDays size={16} /></button>}>
      <div className={`calendar-layout calendar-layout-${size}`}>
        <div className="calendar-grid calendar-clickable">
          {Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 7 + index).toLocaleDateString(language, { weekday: "narrow" })).map((day, index) => <span key={`${day}-${index}`} className="muted calendar-weekday">{day}</span>)}
          {days.map((item, index) => item ? (
            <button
              type="button"
              key={item.key}
              className={[
                item.key === todayKey ? "today" : "",
                records[item.key] ? "has-record" : ""
              ].filter(Boolean).join(" ")}
              onClick={() => openDate(item.key)}
              title={records[item.key] || textFor("点击记录当天事项", "Add an entry for this day")}
            >
              <span>{item.day}</span>
            </button>
          ) : <span key={"empty-" + index} className="calendar-empty" />)}
        </div>
      </div>
      {editingDate && (
        <DialogShell title={calendarDateLabel(editingDate, language)} onClose={() => setEditingDate(undefined)} className="widget-popover calendar-popover">
          <div className="calendar-editor">
            <textarea maxLength={MAX_CALENDAR_RECORD_CHARS} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={textFor("记录这一天要做的事", "Write down plans for this day")} autoFocus />
            <div className="calendar-editor-actions">
              <button type="button" onClick={clearRecord}>{textFor("清除", "Clear")}</button>
              <button type="button" className="primary-mini" onClick={saveRecord}>{textFor("保存", "Save")}</button>
            </div>
          </div>
        </DialogShell>
      )}
    </Widget>
  );
}

function CountdownWidget({ widgetKey, size, state, updateState }: { widgetKey: WidgetKey; size: WidgetSize; state: AppState; updateState: (updater: (state: AppState) => AppState) => void }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const defaultDate = calendarDateKey(new Date(Date.now() + 7 * 86400000));
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState(defaultDate);
  const addCountdown = () => {
    const title = draftTitle.trim();
    if (!title || !draftDate) return;
    if (title.length > MAX_ENTITY_NAME_CHARS) {
      window.alert(text("倒计时名称不能超过 1000 个字符", "A countdown name cannot exceed 1,000 characters."));
      return;
    }
    if (state.countdowns.length >= MAX_ENTITY_RECORDS) {
      window.alert(text("倒计时记录已达到 5000 条安全上限，请先删除不再需要的记录", "Countdowns reached the 5,000 item safety limit. Remove entries you no longer need."));
      return;
    }
    const item: Countdown = { id: uid(), title, date: draftDate, updatedAt: nowIso() };
    updateState((current) => ({ ...current, countdowns: [...current.countdowns, item] }));
    setDraftTitle("");
    setDraftDate(defaultDate);
    setEditorOpen(false);
  };
  const items = state.countdowns.filter((item) => !item.deletedAt);
  const countdownDays = (item: Countdown) => Math.ceil((new Date(`${item.date}T00:00:00`).getTime() - Date.now()) / 86400000);
  const removeCountdown = (id: string) => {
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      countdowns: current.countdowns.map((countdown) => countdown.id === id ? { ...countdown, deletedAt, updatedAt: deletedAt } : countdown)
    }));
  };
  const featured = items[0];
  return (
    <Widget title={text("倒计时", "Countdowns")} meta={text(`${items.length} 个日期`, `${items.length} dates`)} widgetKey={widgetKey} tone="countdown" size={size} action={<button title={text("添加", "Add")} onClick={() => setEditorOpen(true)}><Plus size={14} /></button>}>
      {featured ? (() => {
        const days = countdownDays(featured);
        return (
          <div className="countdown-feature">
            <div className="countdown-orbit" aria-label={text(`${Math.abs(days)} 天`, `${Math.abs(days)} days`)}>
              <span className="countdown-orbit-marker" aria-hidden="true" />
              <div className="countdown-value"><strong>{Math.abs(days)}</strong><span>{text("天", "days")}</span></div>
            </div>
            <div className="countdown-copy">
              <span className="countdown-status">{days >= 0 ? text("即将到来", "Upcoming") : text("已经发生", "Elapsed")}</span>
              <strong>{featured.title}</strong>
              <time dateTime={featured.date}><CalendarDays size={13} />{new Date(`${featured.date}T00:00:00`).toLocaleDateString(language, { year: "numeric", month: "long", day: "numeric" })}</time>
            </div>
            <button type="button" title={text("删除倒计时", "Delete countdown")} onClick={() => removeCountdown(featured.id)}><X size={13} /></button>
          </div>
        );
      })() : <button type="button" className="countdown-empty" onClick={() => setEditorOpen(true)}><Plus size={18} /><span>{text("添加一个重要日期", "Add an important date")}</span></button>}
      {items.length > 1 && size !== "small" && (
        <div className="countdown-list">
          {items.slice(1, size === "wide" ? 4 : 2).map((item) => {
            const days = countdownDays(item);
            return (
              <div className="list-row" key={item.id}>
                <span>{item.title}</span>
                <strong>{days >= 0 ? text(`${days} 天`, `${days} days`) : text(`已过 ${Math.abs(days)} 天`, `${Math.abs(days)} days ago`)}</strong>
                <button type="button" title={text("删除倒计时", "Delete countdown")} onClick={() => removeCountdown(item.id)}><X size={13} /></button>
              </div>
            );
          })}
        </div>
      )}
      {editorOpen && (
        <DialogShell title={text("添加倒计时", "Add countdown")} onClose={() => setEditorOpen(false)} className="widget-popover countdown-popover">
          <form className="countdown-editor" onSubmit={(event) => { event.preventDefault(); addCountdown(); }}>
            <label>
              <span>{text("名称", "Name")}</span>
              <input maxLength={MAX_ENTITY_NAME_CHARS} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder={text("例如：旅行出发", "For example: Trip departure")} autoFocus />
            </label>
            <label>
              <span>{text("日期", "Date")}</span>
              <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
            </label>
            <div className="countdown-editor-actions">
              <button type="button" onClick={() => setEditorOpen(false)}>{text("取消", "Cancel")}</button>
              <button type="submit" className="primary-mini" disabled={!draftTitle.trim() || !draftDate}>{text("添加", "Add")}</button>
            </div>
          </form>
        </DialogShell>
      )}
    </Widget>
  );
}

function TodoWidget({ widgetKey, size, state, updateState }: { widgetKey: WidgetKey; size: WidgetSize; state: AppState; updateState: (updater: (state: AppState) => AppState) => void }) {
  const language = useUiLanguage();
  const textFor = (zh: string, en: string) => localized(language, zh, en);
  const [text, setText] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const todos = state.todos.filter((item) => !item.deletedAt).sort((a, b) => a.order - b.order);
  const dueTodos = todos.filter((todo) => !todo.recurrence || isRecurringTodoDueOn(todo));
  const activeCount = dueTodos.filter((todo) => !isTodoCompletedForDate(todo)).length;
  const doneCount = dueTodos.length - activeCount;
  const completionPercent = dueTodos.length ? Math.round((doneCount / dueTodos.length) * 100) : 0;
  const visibleTodos = dueTodos.slice(0, size === "small" ? 1 : size === "medium" ? 2 : 3);
  const add = () => {
    if (!text.trim()) return;
    if (text.trim().length > MAX_TODO_TEXT_CHARS) {
      window.alert(textFor("单条待办不能超过 10000 个字符", "A task cannot exceed 10,000 characters."));
      return;
    }
    if (state.todos.length >= MAX_ENTITY_RECORDS) {
      window.alert(textFor("待办记录已达到 5000 条安全上限，请先删除不再需要的记录", "Tasks reached the 5,000 item safety limit. Remove tasks you no longer need."));
      return;
    }
    const todo: Todo = {
      id: uid(),
      text: text.trim(),
      done: false,
      order: todos.length,
      updatedAt: nowIso()
    };
    updateState((current) => ({ ...current, todos: [...current.todos, todo] }));
    setText("");
  };
  const toggleTodo = (id: string) => updateState((current) => ({
    ...current,
    todos: current.todos.map((item) => item.id === id ? { ...item, ...nextTodoCompletion(item), updatedAt: nowIso() } : item)
  }));
  const deleteTodo = (id: string) => {
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      todos: current.todos.map((item) => item.id === id ? { ...item, deletedAt, updatedAt: deletedAt } : item)
    }));
  };
  const clearDone = () => {
    const deletedAt = nowIso();
    updateState((current) => ({
      ...current,
      todos: current.todos.map((item) => {
        if (item.deletedAt || !isTodoCompletedForDate(item)) return item;
        return item.recurrence
          ? { ...item, completedOn: undefined, updatedAt: deletedAt }
          : { ...item, deletedAt, updatedAt: deletedAt };
      })
    }));
  };
  const todoRows = (items: Todo[]) => items.map((todo) => (
    <label className="todo" key={todo.id}>
      <input type="checkbox" checked={isTodoCompletedForDate(todo)} onChange={() => toggleTodo(todo.id)} />
      <span>{todoTextFor(language, todo.text)}</span>
      {todo.recurrence && <small title={recurrenceLabel(todo, language)}><Repeat2 size={11} />{todo.reminderTime || ""}</small>}
      <button type="button" title={textFor("删除", "Delete")} onClick={(event) => { event.preventDefault(); event.stopPropagation(); deleteTodo(todo.id); }}>
        <X size={13} />
      </button>
    </label>
  ));
  return (
    <Widget
      title={textFor("任务", "Tasks")}
      meta={textFor(`${activeCount} 待处理`, `${activeCount} open`)}
      widgetKey={widgetKey}
      tone="todo"
      size={size}
      action={<button type="button" className="todo-count" title={textFor("管理任务", "Manage tasks")} onClick={() => setPanelOpen(true)}>{activeCount}/{dueTodos.length}</button>}
    >
      <div className={`todo-dashboard todo-dashboard-${size}`}>
        <div className="todo-overview" aria-label={textFor(`已完成 ${doneCount} 项，共 ${dueTodos.length} 项`, `${doneCount} of ${dueTodos.length} completed`)}>
          <button
            type="button"
            className="todo-progress-dial"
            style={{ "--todo-progress": `${completionPercent * 3.6}deg` } as React.CSSProperties}
            onClick={() => setPanelOpen(true)}
            title={textFor("管理全部任务", "Manage all tasks")}
          >
            <strong>{completionPercent}</strong><span>%</span>
          </button>
          <div>
            <small>{textFor("今日进度", "Today's progress")}</small>
            <strong>{doneCount} / {dueTodos.length}</strong>
            <span>{activeCount ? textFor(`还有 ${activeCount} 项`, `${activeCount} remaining`) : textFor("全部完成", "All complete")}</span>
          </div>
        </div>
        <div className="todo-workspace">
          <div className="input-row">
            <input maxLength={MAX_TODO_TEXT_CHARS} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder={textFor("新增任务", "New task")} />
            <button type="button" title={textFor("添加", "Add")} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); add(); }}><Plus size={14} /></button>
          </div>
          <div className="todo-preview">
            {visibleTodos.length ? todoRows(visibleTodos) : <button type="button" className="todo-empty" onClick={() => setPanelOpen(true)}>{textFor("今天还没有任务", "No tasks today")}</button>}
            {dueTodos.length > visibleTodos.length && <button type="button" className="todo-more" onClick={() => setPanelOpen(true)}>{textFor(`还有 ${dueTodos.length - visibleTodos.length} 条，点击管理`, `${dueTodos.length - visibleTodos.length} more · Manage`)}</button>}
          </div>
        </div>
      </div>
      {panelOpen && (
        <DialogShell title="To Do" onClose={() => setPanelOpen(false)} className="widget-popover todo-popover">
          <div className="todo-panel">
            <div className="input-row">
              <input maxLength={MAX_TODO_TEXT_CHARS} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder={textFor("新增任务", "New task")} autoFocus />
              <button type="button" title={textFor("添加", "Add")} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); add(); }}><Plus size={14} /></button>
            </div>
            <div className="todo-panel-list">
              {todos.length ? todoRows(todos) : <p className="empty-state">{textFor("还没有任务", "No tasks yet")}</p>}
            </div>
            {doneCount > 0 && <button type="button" className="clear-done" onClick={clearDone}>{textFor("清除已完成", "Clear completed")}</button>}
          </div>
        </DialogShell>
      )}
    </Widget>
  );
}

function PhotoWidget({ widgetKey, size, state, updateState }: { widgetKey: WidgetKey; size: WidgetSize; state: AppState; updateState: (updater: (state: AppState) => AppState) => void }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const image = state.settings.photoFrameImage;
  const title = state.settings.photoFrameTitle || text("我的照片", "My photo");
  const savePhoto = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await shrinkImage(file, 1600, 0.86, language);
      updateState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          photoFrameImage: dataUrl,
          photoFrameTitle: (file.name.replace(/\.[^.]+$/, "") || text("我的照片", "My photo")).slice(0, 500),
          updatedAt: nowIso()
        }
      }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : text("照片处理失败", "Photo processing failed"));
    }
  };
  const clearPhoto = () => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        photoFrameImage: undefined,
        photoFrameTitle: undefined,
        updatedAt: nowIso()
      }
    }));
  };
  return (
    <Widget title={text("照片", "Photo")} meta={image ? title : text("未设置", "Not set")} widgetKey={widgetKey} tone={image ? "photo photo-filled" : "photo"} size={size} action={image ? <button title={text("清除照片", "Clear photo")} onClick={clearPhoto}><X size={14} /></button> : undefined}>
      <div className={`photo-frame ${image ? "has-photo" : ""}`} style={image ? { "--photo-image": cssImageUrl(image) } as React.CSSProperties : undefined}>
        {image ? (
          <>
            <img src={image} alt={title} />
            <div className="photo-caption"><span>{text("我的相册", "My album")}</span><strong>{title}</strong></div>
          </>
        ) : (
          <label className="photo-upload">
            <span className="photo-stack" aria-hidden="true"><i /><i /></span>
            <ImageIcon size={28} />
            <span>{text("上传照片", "Upload photo")}</span>
            <input type="file" accept="image/*" onChange={(event) => void savePhoto(event.target.files?.[0])} />
          </label>
        )}
      </div>
    </Widget>
  );
}

function QuoteWidget({ widgetKey, size, date }: { widgetKey: WidgetKey; size: WidgetSize; date: Date }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [offset, setOffset] = useState(0);
  const quoteIndex = (Math.floor(date.getTime() / 86400000) + offset) % dailyQuotes.length;
  const quote = dailyQuotes[quoteIndex];
  const nextQuote = () => setOffset((value) => (value + 1) % dailyQuotes.length);
  return (
    <Widget title={text("每日灵感", "Daily inspiration")} meta={text(`第 ${quoteIndex + 1} 则`, `Quote ${quoteIndex + 1}`)} widgetKey={widgetKey} tone="quote" size={size} action={<button type="button" title={text("换一句", "Next quote")} onClick={nextQuote}><Shuffle size={16} /></button>}>
      <button type="button" className="quote-card" onClick={nextQuote} title={text("点击换一句", "Show another quote")}>
        <span className="quote-mark" aria-hidden="true">“</span>
        <strong>{localized(language, quote.text, quote.en)}</strong>
        <span className="quote-source"><i />WhyNavo</span>
      </button>
    </Widget>
  );
}

function FocusWidget({ widgetKey, size, state, updateState, onOpenTasks }: {
  widgetKey: WidgetKey;
  size: WidgetSize;
  state: AppState;
  updateState: (updater: (state: AppState) => AppState) => void;
  onOpenTasks: () => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const todos = state.todos
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.order - b.order);
  const dueTodos = todos.filter((item) => !item.recurrence || isRecurringTodoDueOn(item));
  const detailTodos = dueTodos.slice(0, size === "small" ? 1 : size === "medium" ? 2 : 3);
  const focusHeadline = state.settings.quickNote
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 90) || text("让今天值得。", "Make today count.");
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 25 * 60;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  const progress = 1 - seconds / (25 * 60);
  const toggleTodo = (id: string) => updateState((current) => ({
    ...current,
    todos: current.todos.map((item) => item.id === id ? { ...item, ...nextTodoCompletion(item), updatedAt: nowIso() } : item)
  }));
  return (
    <Widget
      title={text("专注", "Focus")}
      meta={running ? text("进行中", "In progress") : undefined}
      widgetKey={widgetKey}
      tone="focus"
      size={size}
      action={(
        <button type="button" title={text("打开任务页", "Open Tasks")} aria-label={text("打开任务页", "Open Tasks")} onClick={onOpenTasks}>
          <MoreHorizontal size={15} />
        </button>
      )}
    >
      <div className="sample-focus-paper">
        <div className="sample-focus-headline">
          <Target size={16} aria-hidden="true" />
          <strong>{focusHeadline}</strong>
        </div>
        <div className="sample-focus-list">
          {detailTodos.map((todo) => (
            <label key={todo.id}>
              <input type="checkbox" checked={isTodoCompletedForDate(todo)} onChange={() => toggleTodo(todo.id)} />
              <span>{todoTextFor(language, todo.text)}</span>
            </label>
          ))}
          {!detailTodos.length && (
            <p>{text("写下一件值得专注完成的事。", "Write down one thing worth focusing on.")}</p>
          )}
        </div>
        <div className="sample-focus-footer">
          <span>{text(`今天 · ${dueTodos.length} 项`, `Today · ${dueTodos.length} items`)}</span>
          <button
            type="button"
            className={running ? "is-running" : ""}
            style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}
            onClick={() => setRunning((value) => !value)}
            onDoubleClick={() => { setRunning(false); setSeconds(25 * 60); }}
            title={running ? text("暂停专注；双击重置", "Pause focus; double-click to reset") : text("开始 25 分钟专注", "Start a 25-minute focus session")}
          >
            <b>{minutes}:{rest}</b>
            <small>{running ? text("暂停", "Pause") : text("开始", "Start")}</small>
          </button>
        </div>
      </div>
    </Widget>
  );
}

function WorldClockWidget({ widgetKey, size, date, timeZone }: { widgetKey: WidgetKey; size: WidgetSize; date: Date; timeZone: string }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const primaryZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  const zones = [
    { city: language === "zh-CN" ? (timeZoneLabels[primaryZone] || primaryZone.replace(/_/g, " ")) : primaryZone.split("/").pop()?.replace(/_/g, " ") || primaryZone, zone: primaryZone },
    { city: text("东京", "Tokyo"), zone: "Asia/Tokyo" },
    { city: text("伦敦", "London"), zone: "Europe/London" },
    { city: text("纽约", "New York"), zone: "America/New_York" }
  ].filter((item, index, list) => list.findIndex((zone) => zone.zone === item.zone) === index);
  const timeFor = (zone: string, withSeconds = false) => new Intl.DateTimeFormat(language, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false
  }).format(date);
  const dayFor = (zone: string) => new Intl.DateTimeFormat(language, {
    timeZone: zone,
    weekday: "short",
    month: "numeric",
    day: "numeric"
  }).format(date);
  const primaryTimeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zones[0].zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const dialHour = Number(primaryTimeParts.find((part) => part.type === "hour")?.value || 0) % 12;
  const dialMinute = Number(primaryTimeParts.find((part) => part.type === "minute")?.value || 0);
  const dialStyle = {
    "--clock-hour": `${dialHour * 30 + dialMinute * 0.5}deg`,
    "--clock-minute": `${dialMinute * 6}deg`
  } as React.CSSProperties;

  return (
    <Widget title={text("世界时钟", "World clock")} meta={text(`${zones.length} 个城市`, `${zones.length} cities`)} widgetKey={widgetKey} tone="clock" size={size} action={<Clock3 size={16} />}>
      <div className="world-clock-hero">
        <div className="world-clock-dial" style={dialStyle} aria-hidden="true">
          <i className="clock-hand clock-hand-hour" />
          <i className="clock-hand clock-hand-minute" />
          <b />
        </div>
        <div className="world-clock-primary">
          <strong>{timeFor(zones[0].zone, true)}</strong>
          <span>{zones[0].city}</span>
          <small>{dayFor(zones[0].zone)}</small>
        </div>
      </div>
      <div className="world-clock-list">
        {zones.slice(1, size === "small" ? 1 : size === "medium" ? 3 : 4).map((item) => (
          <div key={item.zone}>
            <span><strong>{item.city}</strong><small>{dayFor(item.zone)}</small></span>
            <time>{timeFor(item.zone)}</time>
          </div>
        ))}
      </div>
    </Widget>
  );
}

function MemoWidget({ widgetKey, size, state, updateState }: {
  widgetKey: WidgetKey;
  size: WidgetSize;
  state: AppState;
  updateState: (updater: (state: AppState) => AppState) => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const note = state.settings.quickNote || "";
  return (
    <Widget title={text("便签", "Memo")} meta={text(`${note.length} 字`, `${note.length} characters`)} widgetKey={widgetKey} tone="memo" size={size} action={<FileText size={16} />}>
      <div className="memo-paper">
        <span className="memo-pin" aria-hidden="true" />
        <textarea
          className="memo-editor"
          maxLength={MAX_QUICK_NOTE_CHARS}
          value={note}
          onChange={(event) => {
            const quickNote = event.target.value;
            updateState((current) => ({
              ...current,
              settings: { ...current.settings, quickNote, updatedAt: nowIso() }
            }));
          }}
          placeholder={text("写下此刻最重要的事", "Write down what matters most right now")}
        />
        <footer><span>{new Date().toLocaleDateString(language, { month: "short", day: "numeric" })}</span><span>{text(`${note.length} 字`, `${note.length} chars`)}</span></footer>
      </div>
    </Widget>
  );
}

function YearProgressWidget({ widgetKey, size, date }: { widgetKey: WidgetKey; size: WidgetSize; date: Date }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const start = new Date(date.getFullYear(), 0, 1).getTime();
  const end = new Date(date.getFullYear() + 1, 0, 1).getTime();
  const progress = Math.min(1, Math.max(0, (date.getTime() - start) / (end - start)));
  const elapsedDays = Math.floor((date.getTime() - start) / 86400000) + 1;
  const totalDays = Math.round((end - start) / 86400000);
  const completedWeeks = Math.round(progress * 52);
  const progressCells = size === "small" ? 12 : 52;
  const completedCells = Math.round(progress * progressCells);

  return (
    <Widget title={text(`${date.getFullYear()} 年`, `${date.getFullYear()}`)} meta={text(`剩余 ${totalDays - elapsedDays} 天`, `${totalDays - elapsedDays} days left`)} widgetKey={widgetKey} tone="year" size={size} action={<TrendingUp size={16} />}>
      <div className="year-progress-hero">
        <div className="year-progress-value">{(progress * 100).toFixed(1)}<span>%</span></div>
        <span>{text("本年度已走过", "Year elapsed")}<br />{text(`第 ${elapsedDays} 天`, `Day ${elapsedDays}`)}</span>
      </div>
      <div className="year-week-grid" aria-label={text(`已完成约 ${completedWeeks} 周，共 52 周`, `About ${completedWeeks} of 52 weeks complete`)}>
        {Array.from({ length: progressCells }, (_, index) => <i className={index < completedCells ? "complete" : ""} key={index} />)}
      </div>
      <div className="year-progress-meta">
        <span>{text("01 月", "Jan")}</span>
        <span>{text("52 周", "52 weeks")}</span>
        <span>{text("12 月", "Dec")}</span>
      </div>
    </Widget>
  );
}

function CalculatorWidget({ widgetKey, size }: { widgetKey: WidgetKey; size: WidgetSize }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [left, setLeft] = useState("64");
  const [right, setRight] = useState("2");
  const [operator, setOperator] = useState<"+" | "-" | "×" | "÷">("×");
  const a = Number(left);
  const b = Number(right);
  const result = !Number.isFinite(a) || !Number.isFinite(b)
    ? undefined
    : operator === "+" ? a + b
      : operator === "-" ? a - b
        : operator === "×" ? a * b
          : b === 0 ? undefined : a / b;
  const resultLabel = result === undefined ? "--" : Number(result.toFixed(6)).toLocaleString(language);

  return (
    <Widget title={text("计算器", "Calculator")} meta={text(`${operator} 运算`, `${operator} operation`)} widgetKey={widgetKey} tone="calculator" size={size} action={<Calculator size={16} />}>
      <div className="calculator-screen">
        <small>{left || "0"} {operator} {right || "0"}</small>
        <div className="calculator-result" aria-live="polite">{resultLabel}</div>
      </div>
      <div className="calculator-controls">
        <div className="calculator-inputs">
          <label><span>A</span><input inputMode="decimal" value={left} onChange={(event) => setLeft(event.target.value)} aria-label={text("第一个数字", "First number")} /></label>
          <label><span>B</span><input inputMode="decimal" value={right} onChange={(event) => setRight(event.target.value)} aria-label={text("第二个数字", "Second number")} /></label>
        </div>
        <div className="calculator-operators" role="radiogroup" aria-label={text("运算符", "Operator")}>
          {["+", "-", "×", "÷"].map((item) => (
            <button
              type="button"
              role="radio"
              aria-checked={operator === item}
              className={operator === item ? "active" : ""}
              onClick={() => setOperator(item as "+" | "-" | "×" | "÷")}
              key={item}
            >{item}</button>
          ))}
        </div>
      </div>
    </Widget>
  );
}

function shrinkImage(file: File, maxSide = 1600, quality = 0.86, language: UiLanguage = "zh-CN"): Promise<string> {
  const text = (zh: string, en: string) => localized(language, zh, en);
  return new Promise((resolve, reject) => {
    if (!["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase())) {
      reject(new Error(text("请选择 JPEG、PNG、WebP、AVIF 或 GIF 图片", "Choose a JPEG, PNG, WebP, AVIF, or GIF image.")));
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      reject(new Error(text("单张图片不能超过 12 MB", "An image cannot exceed 12 MB.")));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(text("照片读取失败", "The image could not be read.")));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error(text("照片解析失败", "The image could not be decoded.")));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error(text("当前浏览器无法安全处理这张图片，请更换 JPEG、PNG 或 WebP 图片", "This browser cannot process the image safely. Try a JPEG, PNG, or WebP image.")));
          return;
        }
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
          reject(new Error(text("压缩后的图片仍然过大，请选择尺寸更小的图片", "The compressed image is still too large. Choose a smaller image.")));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function RatesWidget({ widgetKey, size, rates, message, refreshing, onRefresh }: { widgetKey: WidgetKey; size: WidgetSize; rates?: RatesState; message: string; refreshing: boolean; onRefresh: () => Promise<void> }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const currencyName = (currency: CurrencyCode) => language === "en-US" ? currency : currencyNames[currency];
  const [amount, setAmount] = useState("1000");
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>("CNY");
  const currencies: CurrencyCode[] = ["CNY", "USD", "JPY"];

  const cnyPerUnit = useMemo(() => {
    const result: Record<CurrencyCode, number> = { CNY: 1, USD: 0, JPY: 0 };
    rates?.rows?.forEach((row) => {
      const values = [row.buyingRate, row.sellingRate]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (values.length) result[row.currency] = (values.reduce((sum, value) => sum + value, 0) / values.length) / 100;
    });
    return result;
  }, [rates]);

  const visibleRows = rates?.rows?.slice(0, size === "small" ? 1 : 2) || [];
  const numericAmount = Number(amount);
  const canConvert = Number.isFinite(numericAmount) && numericAmount >= 0 && cnyPerUnit.USD > 0 && cnyPerUnit.JPY > 0;
  const converted = (target: CurrencyCode) => {
    if (!canConvert) return undefined;
    const cny = numericAmount * cnyPerUnit[fromCurrency];
    return cny / cnyPerUnit[target];
  };
  const updatedLabel = rates?.updatedAt
    ? new Date(rates.updatedAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", hour12: false })
    : text("等待数据", "Waiting for data");

  return (
    <Widget title={text("中行汇率", "Exchange rates")} meta={updatedLabel} widgetKey={widgetKey} tone="rates" size={size} action={<button type="button" title={text("刷新汇率", "Refresh rates")} disabled={refreshing} onClick={() => void onRefresh()}><RefreshCcw size={14} className={refreshing ? "spin" : undefined} /></button>}>
      {visibleRows.length ? (
        <div className="rate-table">
          <div className="rate-head"><span>{text("币种", "Currency")}</span><span>{text("现汇买入", "Buy")}</span><span>{text("现汇卖出", "Sell")}</span></div>
          {visibleRows.map((row) => (
            <div className="rate-row" key={row.currency} title={text(`${row.name} 买入 ${row.buyingRate || "--"}，卖出 ${row.sellingRate || "--"}`, `${row.currency} buy ${row.buyingRate || "--"}, sell ${row.sellingRate || "--"}`)}>
              <strong><i>{row.currency.slice(0, 1)}</i><span>{row.currency}<small>{currencyName(row.currency)}</small></span></strong>
              <span>{row.buyingRate || "--"}</span>
              <span>{row.sellingRate || "--"}</span>
            </div>
          ))}
        </div>
      ) : <p className="rate-empty">{message || text("汇率暂时不可用", "Rates are temporarily unavailable")}</p>}
      {size === "wide" && (
        <div className="converter">
          <div className="converter-input">
            <input aria-label={text("换算金额", "Amount to convert")} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <select aria-label={text("换算币种", "Source currency")} value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value as CurrencyCode)}>
              {currencies.map((currency) => <option key={currency} value={currency}>{currencyName(currency)}</option>)}
            </select>
          </div>
          <div className="conversion-list">
            {currencies.filter((currency) => currency !== fromCurrency).map((currency) => {
              const value = converted(currency);
              return (
                <div key={currency}>
                  <span>{currencyName(currency)}</span>
                  <strong>{value === undefined ? "--" : value.toLocaleString(language, { maximumFractionDigits: currency === "JPY" ? 0 : 2 })}</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Widget>
  );
}

function FolderView({ folder, shortcuts, onClose, onAdd, onEditFolder }: {
  folder: ShortcutFolder;
  shortcuts: Shortcut[];
  onClose: () => void;
  onAdd: () => void;
  onEditFolder: () => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const headingId = `folder-view-${folder.id}`;
  return (
    <div className="overlay folder-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="folder-view" style={{ "--folder-accent": folder.iconColor } as React.CSSProperties} aria-labelledby={headingId} onClick={(event) => event.stopPropagation()}>
        <header className="folder-view-header">
          <div className="folder-view-heading">
            <h2 id={headingId}>{folder.name}</h2>
            <span>{text(`${shortcuts.length} 个网站`, `${shortcuts.length} sites`)}</span>
          </div>
          <div className="folder-actions">
            <button aria-label={text("添加网站", "Add site")} title={text("添加网站", "Add site")} onClick={onAdd}><Plus size={17} /></button>
            <button aria-label={text("编辑文件夹", "Edit folder")} title={text("编辑文件夹", "Edit folder")} onClick={onEditFolder}><Edit3 size={17} /></button>
            <button aria-label={text("关闭文件夹", "Close folder")} title={text("关闭文件夹", "Close folder")} onClick={onClose}><X size={19} /></button>
          </div>
        </header>
        <div className="folder-grid" style={{ "--icon": "64px" } as React.CSSProperties}>
          {shortcuts.map((shortcut) => (
            <article
              className="shortcut"
              key={shortcut.id}
              data-shortcut-id={shortcut.id}
            >
              <a href={safeHttpHref(shortcut.url)} title={shortcut.url} target="_blank" rel="noreferrer">
                <span className="shortcut-icon">
                  <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} iconText={shortcut.iconText} iconColor={shortcut.iconColor} iconUpdatedAt={shortcut.iconUpdatedAt} title={shortcut.title} fallback={shortcut.title.slice(0, 1)} />
                </span>
                <span>{shortcut.title}</span>
              </a>
            </article>
          ))}
          <button className="folder-add-shortcut" type="button" onClick={onAdd}>
            <span><Plus size={22} /></span>
            <strong>{text("添加网站", "Add site")}</strong>
          </button>
        </div>
      </section>
    </div>
  );
}

function FolderDialog({ folder, groups, onClose, onSave, onDelete }: {
  folder?: ShortcutFolder;
  groups: AppState["shortcutGroups"];
  onClose: () => void;
  onSave: (folder: Partial<ShortcutFolder>) => void;
  onDelete?: () => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const isExistingFolder = Boolean(folder?.id);
  const [draft, setDraft] = useState<Partial<ShortcutFolder>>(folder || { iconColor: "#14B8A6", groupId: groups[0]?.id });
  return (
    <DialogShell title={isExistingFolder ? text("编辑文件夹", "Edit folder") : text("新建文件夹", "New folder")} onClose={onClose}>
      <label>{text("文件夹名称", "Folder name")}<input maxLength={MAX_ENTITY_NAME_CHARS} value={draft.name || ""} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={text("例如：工作、AI、购物", "For example: Work, AI, Shopping")} /></label>
      <label>{text("所在分类", "Category")}<select value={draft.groupId || groups[0]?.id} onChange={(event) => setDraft({ ...draft, groupId: event.target.value })}>{groups.map((group) => <option value={group.id} key={group.id}>{shortcutGroupNameFor(language, group)}</option>)}</select></label>
      <label>{text("图片 URL（可选）", "Image URL (optional)")}<input maxLength={4 * 1024 * 1024} value={draft.iconUrl || ""} onChange={(event) => setDraft({ ...draft, iconUrl: event.target.value })} placeholder={text("留空使用文件夹图标", "Leave blank to use the folder icon")} /></label>
      <label className="file-pick">
        <Upload size={16} /> {text("上传文件夹图片", "Upload folder image")}
        <input
          type="file"
          accept="image/*"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const dataUrl = await shrinkImage(file, 384, 0.84, language);
              setDraft({ ...draft, iconUrl: dataUrl });
            } catch (error) {
              window.alert(error instanceof Error ? error.message : text("图片处理失败", "Image processing failed"));
            }
          }}
        />
      </label>
      <div className="folder-preview">
        <span className={`shortcut-icon folder-icon ${draft.iconUrl ? "has-image" : ""}`} style={{ "--folder-color": draft.iconColor || "#14B8A6", "--icon": "64px" } as React.CSSProperties}>
          <FolderIconContent iconUrl={draft.iconUrl} size={30} />
        </span>
        <span>{draft.name || text("文件夹预览", "Folder preview")}</span>
      </div>
      <div className="button-row split-row">
        {onDelete && <button className="danger-button" onClick={onDelete}><Trash2 size={16} /> {text("删除文件夹", "Delete folder")}</button>}
        <button className="primary" onClick={() => onSave(draft)}><Save size={16} /> {text("保存", "Save")}</button>
      </div>
    </DialogShell>
  );
}

type ShortcutIconMode = "online" | "text" | "upload";

function ShortcutDialog({ shortcut, groups, folders, onClose, onSave }: {
  shortcut?: Shortcut;
  groups: AppState["shortcutGroups"];
  folders: ShortcutFolder[];
  onClose: () => void;
  onSave: (shortcut: Partial<Shortcut>) => void | Promise<void>;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [draft, setDraft] = useState<Partial<Shortcut>>(shortcut || { iconColor: "#14B8A6", groupId: groups[0]?.id });
  const initialIconUrl = normalizeIconReference(shortcut?.iconUrl) || "";
  const [iconMode, setIconMode] = useState<ShortcutIconMode>(shortcut?.iconText
    ? "text"
    : initialIconUrl.startsWith("data:image/")
      ? "upload"
      : "online");
  const [onlineIconUrl, setOnlineIconUrl] = useState(initialIconUrl.startsWith("data:image/") ? "" : initialIconUrl);
  const [uploadedIconUrl, setUploadedIconUrl] = useState(initialIconUrl.startsWith("data:image/") ? initialIconUrl : "");
  const [customIconText, setCustomIconText] = useState(normalizeShortcutIconText(shortcut?.iconText || shortcut?.title || "网"));
  const [uploadError, setUploadError] = useState("");
  const [savingIcon, setSavingIcon] = useState(false);
  const [iconProbe, setIconProbe] = useState(0);
  const [iconChoiceStatus, setIconChoiceStatus] = useState<Record<string, "loading" | "ready" | "failed">>({});
  const iconTitle = draft.title || shortcut?.title || "";
  const iconUrl = draft.url || shortcut?.url || "";
  const iconColor = draft.iconColor || "#14B8A6";
  const collectedIconChoices = useMemo(() => {
    const siteCandidates = siteIconCandidatesFor(iconUrl).slice(0, 2);
    const rows: Array<{ label: string; url?: string }> = [
      { label: text("当前", "Current"), url: onlineIconUrl && !onlineIconUrl.startsWith(builtInIconPrefix) ? normalizeIconReference(onlineIconUrl) : undefined },
      { label: text("品牌", "Brand"), url: curatedIconFor(iconUrl, iconTitle) },
      ...siteCandidates.map((url, index) => ({ label: text(`站点 ${index + 1}`, `Site ${index + 1}`), url })),
      { label: text("备用", "Backup"), url: fallbackFaviconFor(iconUrl) }
    ];
    const availableRows = rows.filter((item): item is { label: string; url: string } => Boolean(item.url));
    const seen = new Set<string>();
    return availableRows.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [onlineIconUrl, iconTitle, iconUrl, language]);
  const visibleCollectedIconCount = collectedIconChoices.filter((choice) => iconChoiceStatus[choice.url] !== "failed").length;
  const previewIconUrl = iconMode === "online" ? onlineIconUrl : iconMode === "upload" ? uploadedIconUrl : undefined;
  const previewIconText = iconMode === "text" ? normalizeShortcutIconText(customIconText) : undefined;
  const selectedOnlineIconReady = !onlineIconUrl
    || onlineIconUrl.startsWith(builtInIconPrefix)
    || iconChoiceStatus[onlineIconUrl] === "ready";
  const canSaveIcon = iconMode === "text"
    ? Boolean(previewIconText)
    : iconMode === "upload"
      ? Boolean(uploadedIconUrl)
      : selectedOnlineIconReady;
  return (
    <DialogShell title={shortcut?.id ? text("编辑快捷导航", "Edit shortcut") : text("新增快捷导航", "Add shortcut")} onClose={onClose}>
      <label>{text("名称", "Name")}<input maxLength={MAX_ENTITY_NAME_CHARS} value={draft.title || ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>{text("网址", "URL")}<input maxLength={MAX_URL_CHARS} value={draft.url || ""} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" /></label>
      <div className="shortcut-icon-mode-tabs" role="group" aria-label={text("图标类型", "Icon type")}>
        <button type="button" className={iconMode === "online" ? "active" : ""} aria-pressed={iconMode === "online"} onClick={() => setIconMode("online")}><Globe2 size={16} />{text("在线图标", "Online")}</button>
        <button type="button" className={iconMode === "text" ? "active" : ""} aria-pressed={iconMode === "text"} onClick={() => {
          setCustomIconText((current) => normalizeShortcutIconText(current) || normalizeShortcutIconText(draft.title || "网"));
          setIconMode("text");
        }}><Palette size={16} />{text("纯色图标", "Text")}</button>
        <button type="button" className={iconMode === "upload" ? "active" : ""} aria-pressed={iconMode === "upload"} onClick={() => setIconMode("upload")}><Upload size={16} />{text("本地上传", "Upload")}</button>
      </div>

      {iconMode === "online" && <div className="shortcut-icon-mode-panel online-icon-panel">
        <div className="shortcut-icon-toolbar">
          <button type="button" onClick={() => {
            const targetUrl = draft.url || "";
            setIconChoiceStatus({});
            setIconProbe((current) => current + 1);
            setOnlineIconUrl(curatedIconFor(targetUrl, draft.title || "") || "");
          }}><RefreshCcw size={15} />{text("重新采集", "Detect again")}</button>
          <button type="button" onClick={() => setOnlineIconUrl("")}><X size={15} />{text("使用自动回退", "Use automatic fallback")}</button>
        </div>
      {collectedIconChoices.length > 0 && (
        <section className="collected-icon-picker" aria-label={text("采集图标", "Collected icons")}>
          <div className="default-icon-picker-head">
            <span>{text("采集图标", "Collected icons")}</span>
            <small>{text("从网站识别到的候选", "Candidates detected from the site")}</small>
          </div>
          {visibleCollectedIconCount > 0 ? <div className="collected-icon-grid">
            {collectedIconChoices.map((choice) => (
              <button
                type="button"
                className={`${onlineIconUrl === choice.url ? "active" : ""} ${iconChoiceStatus[choice.url] === "failed" ? "is-unavailable" : ""}`.trim()}
                aria-pressed={onlineIconUrl === choice.url}
                disabled={iconChoiceStatus[choice.url] !== "ready"}
                key={`${choice.url}:${iconProbe}`}
                onClick={() => setOnlineIconUrl(choice.url)}
                title={iconChoiceStatus[choice.url] === "failed" ? text("该图标清晰度不足或无法加载", "This icon is too small or could not be loaded") : choice.url}
              >
                <span><IconChoicePreview src={choice.url} fallback={(draft.title || "网").slice(0, 1)} onStatus={(status) => setIconChoiceStatus((current) => current[choice.url] === status ? current : { ...current, [choice.url]: status })} /></span>
                <em>{choice.label}</em>
              </button>
            ))}
          </div> : <div className="icon-detection-empty">
            <span>{text("没有识别到可用图标", "No usable icon was detected")}</span>
            <button type="button" onClick={() => {
              setCustomIconText(normalizeShortcutIconText(draft.title || "网"));
              setIconMode("text");
            }}>{text("改用文字图标", "Use a text icon")}</button>
          </div>}
        </section>
      )}
      <section className="default-icon-picker" aria-label={text("默认图标", "Default icons")}>
        <div className="default-icon-picker-head">
          <span>{text("默认图标", "Default icons")}</span>
          <small>{text("适合采集不到图标的网站", "Use when a site icon is unavailable")}</small>
        </div>
        <div className="default-icon-grid">
          {builtInShortcutIcons.map((icon) => {
            const value = builtInIconValue(icon.id);
            const Icon = icon.Icon;
            return (
              <button
                type="button"
                className={onlineIconUrl === value ? "active" : ""}
                aria-pressed={onlineIconUrl === value}
                key={icon.id}
                onClick={() => setOnlineIconUrl(value)}
                style={{ "--icon-tone": icon.tone } as React.CSSProperties}
                title={builtInShortcutIconLabelFor(language, icon)}
              >
                <span><Icon size={20} strokeWidth={2.35} /></span>
                <em>{builtInShortcutIconLabelFor(language, icon)}</em>
              </button>
            );
          })}
        </div>
      </section>
      </div>}

      {iconMode === "text" && (
        <section className="shortcut-icon-mode-panel text-icon-panel" aria-label={text("纯色文字图标", "Solid text icon")}>
          <div className="text-icon-editor-preview"><ShortcutTextIcon text={previewIconText || "网"} color={iconColor} /></div>
          <div className="text-icon-palette" role="group" aria-label={text("图标颜色", "Icon color")}>
            {shortcutIconTextPalette.map((color) => (
              <button
                type="button"
                className={iconColor.toLowerCase() === color.toLowerCase() ? "active" : ""}
                aria-pressed={iconColor.toLowerCase() === color.toLowerCase()}
                aria-label={text(`选择颜色 ${color}`, `Choose color ${color}`)}
                key={color}
                style={{ "--swatch": color } as React.CSSProperties}
                onClick={() => setDraft({ ...draft, iconColor: color })}
              />
            ))}
          </div>
          <label className="text-icon-input"><span>{text("图标文字", "Icon text")}</span><input value={customIconText} maxLength={4} onChange={(event) => setCustomIconText(normalizeShortcutIconText(event.target.value))} placeholder={text("建议 1–2 个字符", "Use 1–2 characters")} /></label>
          <small>{text("适合无法采集图标的网站；文字与颜色会在所有设备同步。", "Use when a site icon cannot be detected. Text and color sync across devices.")}</small>
        </section>
      )}

      {iconMode === "upload" && (
        <section className="shortcut-icon-mode-panel upload-icon-panel" aria-label={text("上传本地图标", "Upload a local icon")}>
          <div className="upload-icon-preview">
            {uploadedIconUrl
              ? <span className="shortcut-icon" style={{ "--icon": "88px" } as React.CSSProperties}><ShortcutIconContent url={draft.url || ""} iconUrl={uploadedIconUrl} iconColor={iconColor} title={draft.title || ""} fallback={(draft.title || "网").slice(0, 1)} /></span>
              : <span className="upload-icon-empty"><ImageIcon size={26} /><small>{text("PNG、JPG 或 WebP", "PNG, JPG, or WebP")}</small></span>}
          </div>
          <div className="upload-icon-actions">
            <label className="file-pick"><Upload size={16} />{text(uploadedIconUrl ? "更换图片" : "选择图片", uploadedIconUrl ? "Replace image" : "Choose image")}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              input.value = "";
              if (!file) return;
              setUploadError("");
              void shrinkImage(file, 512, 0.9, language)
                .then((dataUrl) => setUploadedIconUrl(dataUrl))
                .catch((error) => setUploadError(error instanceof Error ? error.message : text("图片处理失败", "Image processing failed")));
            }} /></label>
            {uploadedIconUrl && <button type="button" onClick={() => setUploadedIconUrl("")}><Trash2 size={15} />{text("移除", "Remove")}</button>}
          </div>
          {uploadError && <p className="field-error" role="alert">{uploadError}</p>}
          <small>{text("图片压缩后仅保存在本设备；其他设备会使用同色文字回退，避免把私人图片明文上传。", "The compressed image stays on this device. Other devices use the same-color text fallback so private images are not uploaded in plaintext.")}</small>
        </section>
      )}

      <div className="shortcut-dialog-preview">
        <span className="shortcut-icon" style={{ "--icon": "58px", "--fallback-color": draft.iconColor || "#737373" } as React.CSSProperties}>
          <ShortcutIconContent url={draft.url || ""} iconUrl={previewIconUrl} iconText={previewIconText} iconColor={iconColor} title={draft.title || ""} fallback={(draft.title || "网").slice(0, 1)} priority />
        </span>
        <span><strong>{draft.title || text("预览", "Preview")}</strong><small>{iconMode === "online" ? text("在线图标", "Online icon") : iconMode === "text" ? text("纯色文字", "Solid text") : text("本地上传", "Local upload")}</small></span>
      </div>
      <label>{text("分组", "Category")}<select value={draft.groupId || groups[0]?.id} onChange={(event) => setDraft({ ...draft, groupId: event.target.value })}>{groups.map((group) => <option value={group.id} key={group.id}>{shortcutGroupNameFor(language, group)}</option>)}</select></label>
      <label>{text("文件夹", "Folder")}<select value={draft.folderId || ""} onChange={(event) => setDraft({ ...draft, folderId: event.target.value || undefined })}><option value="">{text("不放入文件夹", "No folder")}</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>
      <label className="check-row"><input type="checkbox" checked={Boolean(draft.pinned)} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} /> {text("固定到 Dock", "Pin to Dock")}</label>
      <button className="primary" disabled={savingIcon || !canSaveIcon || (iconMode === "upload" && !uploadedIconUrl)} onClick={() => {
        if (savingIcon) return;
        setSavingIcon(true);
        void (async () => {
          if (iconMode === "online" && onlineIconUrl && !onlineIconUrl.startsWith(builtInIconPrefix)) {
            await cacheSelectedIcon(onlineIconUrl);
          }
          await onSave({
            ...draft,
            iconUrl: iconMode === "online" ? onlineIconUrl : iconMode === "upload" ? uploadedIconUrl : "",
            iconText: iconMode === "text" ? previewIconText : "",
            iconColor
          });
        })().finally(() => setSavingIcon(false));
      }}><Save size={16} /> {savingIcon ? text("正在固定图标…", "Pinning icon…") : text("保存并应用", "Save and apply")}</button>
    </DialogShell>
  );
}

function ImportDialog({ existingShortcuts, onClose, onImport }: {
  existingShortcuts: Shortcut[];
  onClose: () => void;
  onImport: (text: string, mode: "append" | "replace") => void;
}) {
  const language = useUiLanguage();
  const label = (zh: string, en: string) => localized(language, zh, en);
  const [text, setText] = useState("");
  const [importError, setImportError] = useState("");
  const rows = useMemo(() => parseImportText(text), [text]);
  const count = rows.length;
  const folderCount = useMemo(() => new Set(rows.map((row) => row.folderName).filter(Boolean)).size, [rows]);
  const missingCount = useMemo(() => {
    if (!rows.length) return 0;
    const existing = new Set(existingShortcuts.map((shortcut) => comparableUrl(shortcut.url)));
    return rows.filter((row) => !existing.has(comparableUrl(row.url))).length;
  }, [existingShortcuts, rows]);
  return (
    <DialogShell title={label("导入快捷导航", "Import shortcuts")} onClose={onClose}>
      <p className="hint">{label("支持 WhyNavo JSON、WeTab .data、浏览器书签 HTML、CSV。CSV 格式：名称,网址,图标URL,分组,文件夹。", "Supports WhyNavo JSON, WeTab .data, browser bookmark HTML, and CSV. CSV format: name, URL, icon URL, category, folder.")}</p>
      <label className="file-pick">
        <Upload size={16} /> {label("选择文件", "Choose file")}
        <input
          type="file"
          accept=".json,.data,.csv,.html,.htm,.txt"
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > MAX_IMPORT_TEXT_CHARS) {
              setImportError(label("导入文件超过 8 MB，请拆分后再导入", "The import file exceeds 8 MB. Split it before importing."));
              input.value = "";
              return;
            }
            setImportError("");
            try {
              setText(await file.text());
            } catch {
              setImportError(label("文件读取失败，请重新选择文件", "The file could not be read. Choose it again."));
            }
            input.value = "";
          }}
        />
      </label>
      <textarea
        className="import-text"
        value={text}
        maxLength={MAX_IMPORT_TEXT_CHARS}
        onChange={(event) => {
          setImportError("");
          setText(event.target.value);
        }}
        placeholder={label("也可以直接粘贴导入内容", "You can also paste import content here")}
      />
      {importError && <p className="warning">{importError}</p>}
      <div className="import-summary">
        <span>{label(`文件内：${count} 个`, `In file: ${count}`)}</span>
        <span>{label(`当前已有：${existingShortcuts.length} 个`, `Current: ${existingShortcuts.length}`)}</span>
        <span>{label(`按网址缺失：${missingCount} 个`, `Missing by URL: ${missingCount}`)}</span>
        <span>{label(`文件夹：${folderCount} 个`, `Folders: ${folderCount}`)}</span>
      </div>
      <div className="button-row split-row">
        <button disabled={!count} onClick={() => onImport(text, "append")}><Plus size={16} /> {label("追加导入", "Append")}</button>
        <button className="primary" disabled={!count} onClick={() => onImport(text, "replace")}><Check size={16} /> {label("按文件重建", "Rebuild from file")}</button>
      </div>
      <p className="hint">{label("想按导入文件的顺序重建时，用“按文件重建”。它会保留旧数据墓碑用于同步防回流，并按文件顺序重新生成快捷导航。", "Use Rebuild from file to match the file order. Existing tombstones are retained to prevent deleted items from returning during sync.")}</p>
    </DialogShell>
  );
}

function ResourceCenterDialog({ state, shortcuts, updateState, initialTab = "widgets", onEditShortcut, onClose }: {
  state: AppState;
  shortcuts: Shortcut[];
  updateState: (updater: (state: AppState) => AppState) => void;
  initialTab?: "widgets" | "wallpapers" | "icons";
  onEditShortcut: (shortcut: Shortcut) => void;
  onClose: () => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [tab, setTab] = useState<"widgets" | "wallpapers" | "icons">(initialTab);
  const [category, setCategory] = useState<"全部" | "信息" | "效率" | "生活">("全部");
  const [wallpaperCategory, setWallpaperCategory] = useState<"全部" | WallpaperCategory | "我的">("全部");
  const [query, setQuery] = useState("");
  const [iconQuery, setIconQuery] = useState("");
  const [iconRenderLimit, setIconRenderLimit] = useState(ICON_MANAGER_RENDER_BATCH);
  const settings = state.settings;
  const sizes = { ...defaultWidgetSizes, ...(settings.widgetSizes || {}) };
  const normalizedQuery = query.trim().toLowerCase();
  const visibleWidgets = (Object.keys(widgetNames) as WidgetKey[]).filter((key) => {
    const meta = widgetLibraryMeta[key];
    const matchesCategory = category === "全部" || meta.category === category;
    const searchText = `${widgetNameFor(language, key)} ${widgetCategoryFor(language, meta.category)}`.toLowerCase();
    const matchesQuery = !normalizedQuery || searchText.includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });
  const normalizedIconQuery = iconQuery.trim().toLowerCase();
  const matchingIconShortcuts = shortcuts.filter((shortcut) => (
    !normalizedIconQuery
    || shortcut.title.toLowerCase().includes(normalizedIconQuery)
    || shortcut.url.toLowerCase().includes(normalizedIconQuery)
  ));
  const visibleIconShortcuts = matchingIconShortcuts.slice(0, iconRenderLimit);

  useEffect(() => {
    setIconRenderLimit(ICON_MANAGER_RENDER_BATCH);
  }, [normalizedIconQuery]);

  const setSetting = <K extends keyof AppState["settings"]>(key: K, value: AppState["settings"][K]) => {
    updateState((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value, updatedAt: nowIso() }
    }));
  };

  const setWidgetEnabled = (key: WidgetKey, enabled: boolean) => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgets: { ...current.settings.widgets, [key]: enabled },
        widgetOrder: enabled
          ? [
              key,
              ...(current.settings.widgetOrder || defaultWidgetOrder).filter((item) => item !== key)
            ]
          : current.settings.widgetOrder,
        updatedAt: nowIso()
      }
    }));
  };

  const setWidgetSize = (key: WidgetKey, size: WidgetSize) => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        widgetSizes: { ...defaultWidgetSizes, ...(current.settings.widgetSizes || {}), [key]: size },
        updatedAt: nowIso()
      }
    }));
  };

  const chooseWallpaper = (id: string) => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        wallpaper: undefined,
        wallpaperPreset: id,
        wallpaperRotation: false,
        updatedAt: nowIso()
      }
    }));
  };
  const customWallpapers = settings.customWallpapers || [];
  const wallpaperCollection = settings.wallpaperCollection || [];
  const wallpaperItems = [
    ...builtInWallpapers.map((wallpaper) => ({ ...wallpaper, url: wallpaper.mobileUrl || wallpaper.url, custom: false })),
    ...customWallpapers.map((wallpaper) => ({ id: wallpaper.id, name: wallpaper.name, url: wallpaper.dataUrl, category: "我的" as const, custom: true }))
  ];
  const visibleWallpapers = wallpaperItems.filter((wallpaper) => wallpaperCategory === "全部" || wallpaper.category === wallpaperCategory);
  const selectedWallpaperCount = wallpaperItems.filter((wallpaper) => wallpaperCollection.includes(wallpaper.id)).length;

  const toggleWallpaperCollection = (id: string) => {
    const next = wallpaperCollection.includes(id)
      ? wallpaperCollection.filter((item) => item !== id)
      : [...wallpaperCollection, id];
    setSetting("wallpaperCollection", next);
  };

  const addCustomWallpapers = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = Math.max(0, MAX_CUSTOM_WALLPAPERS - customWallpapers.length);
    if (!remaining) {
      window.alert(text(`最多保存 ${MAX_CUSTOM_WALLPAPERS} 张自定义壁纸，请先删除旧壁纸。`, `You can save up to ${MAX_CUSTOM_WALLPAPERS} custom wallpapers. Remove an older one first.`));
      return;
    }
    let additions: NonNullable<AppState["settings"]["customWallpapers"]>;
    try {
      additions = await Promise.all(Array.from(files).slice(0, remaining).map(async (file) => ({
        id: `custom-${uid()}`,
        name: (file.name.replace(/\.[^.]+$/, "") || text("我的壁纸", "My wallpaper")).slice(0, 500),
        dataUrl: await shrinkImage(file, 1600, 0.82, language),
        createdAt: nowIso()
      })));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : text("壁纸处理失败", "Wallpaper processing failed"));
      return;
    }
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        customWallpapers: [...(current.settings.customWallpapers || []), ...additions],
        wallpaperCollection: [...(current.settings.wallpaperCollection || []), ...additions.map((item) => item.id)],
        wallpaperPreset: additions[0]?.id || current.settings.wallpaperPreset,
        wallpaper: undefined,
        updatedAt: nowIso()
      }
    }));
  };

  const removeCustomWallpaper = (id: string) => {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        customWallpapers: (current.settings.customWallpapers || []).filter((item) => item.id !== id),
        wallpaperCollection: (current.settings.wallpaperCollection || []).filter((item) => item !== id),
        wallpaperPreset: current.settings.wallpaperPreset === id ? builtInWallpapers[0].id : current.settings.wallpaperPreset,
        updatedAt: nowIso()
      }
    }));
  };


  return (
    <DialogShell title={text("资源中心", "Resource center")} onClose={onClose} className="resource-center-overlay">
      <div className="resource-tabs" role="tablist" aria-label={text("资源分类", "Resource categories")}>
        <button type="button" className={tab === "widgets" ? "active" : ""} onClick={() => setTab("widgets")}><Palette size={16} />{text("小组件", "Widgets")}</button>
        <button type="button" className={tab === "wallpapers" ? "active" : ""} onClick={() => setTab("wallpapers")}><ImageIcon size={16} />{text("壁纸", "Wallpapers")}</button>
        <button type="button" className={tab === "icons" ? "active" : ""} onClick={() => setTab("icons")}><Sparkles size={16} />{text("图标", "Icons")}</button>
      </div>

      {tab === "widgets" && (
        <>
          <div className="resource-toolbar">
            <label className="resource-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("搜索小组件", "Search widgets")} /></label>
            <div className="resource-filters">
              {(["全部", "信息", "效率", "生活"] as const).map((item) => (
                <button type="button" className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>{item === "全部" ? text("全部", "All") : widgetCategoryFor(language, item)}</button>
              ))}
            </div>
          </div>
          <div className="resource-widget-grid">
            {visibleWidgets.map((key) => {
              const meta = widgetLibraryMeta[key];
              const Icon = meta.Icon;
              const enabled = settings.widgets[key];
              return (
                <section className={`resource-widget-card ${enabled ? "enabled" : ""}`} key={key}>
                  <div className="resource-widget-preview">
                    <span><Icon size={19} /></span>
                    <strong>{widgetPreviewFor(language, key)}</strong>
                    <small>{widgetCategoryFor(language, meta.category)}</small>
                  </div>
                  <div className="resource-widget-row">
                    <strong>{widgetNameFor(language, key)}</strong>
                    <button type="button" className={`resource-toggle ${enabled ? "active" : ""}`} onClick={() => setWidgetEnabled(key, !enabled)} aria-pressed={enabled}>
                      {enabled ? <Check size={15} /> : <Plus size={15} />}
                    </button>
                  </div>
                  <WidgetSizePicker widgetKey={key} value={sizes[key]} onChange={(size) => setWidgetSize(key, size)} disabled={!enabled} compact />
                </section>
              );
            })}
          </div>
        </>
      )}

      {tab === "wallpapers" && (
        <>
          <div className="resource-section-head">
            <div><strong>{text("我的壁纸集", "My wallpaper collection")}</strong><small>{text(`已选择 ${selectedWallpaperCount} 张 · 自定义壁纸仅保存在本机`, `${selectedWallpaperCount} selected · Custom wallpapers stay on this device`)}</small></div>
            <div className="wallpaper-actions">
              <label className="file-pick compact-upload">
                <Upload size={15} />{text("上传多张", "Upload images")}
                <input type="file" accept="image/*" multiple onChange={(event) => { void addCustomWallpapers(event.target.files); event.currentTarget.value = ""; }} />
              </label>
              <label className="resource-switch">
                <input
                  type="checkbox"
                  checked={settings.wallpaperRotation ?? false}
                  onChange={(event) => updateState((current) => ({
                    ...current,
                    settings: {
                      ...current.settings,
                      wallpaper: event.target.checked ? undefined : current.settings.wallpaper,
                      wallpaperRotation: event.target.checked,
                      updatedAt: nowIso()
                    }
                  }))}
                />
                {text("每日轮换", "Daily rotation")}
              </label>
            </div>
          </div>
          <div className="resource-filters wallpaper-filters" aria-label={text("壁纸风格", "Wallpaper styles")}>
            {(["全部", "精选", "日系", "动漫", "猫咪", "酷感", "我的"] as const).map((item) => (
              <button type="button" className={wallpaperCategory === item ? "active" : ""} key={item} onClick={() => setWallpaperCategory(item)}>{language === "zh-CN" ? item : ({ "全部": "All", "精选": "Featured", "日系": "Japanese", "动漫": "Anime", "猫咪": "Cats", "酷感": "Bold", "我的": "Mine" } as const)[item]}</button>
            ))}
          </div>
          <div className="resource-wallpaper-grid">
            {visibleWallpapers.map((wallpaper) => (
              <div className="resource-wallpaper-item" key={wallpaper.id}>
                <button
                  type="button"
                  className={`wallpaper-preview ${!settings.wallpaper && !settings.wallpaperRotation && settings.wallpaperPreset === wallpaper.id ? "active" : ""}`}
                  onClick={() => chooseWallpaper(wallpaper.id)}
                >
                  <img src={wallpaper.url} alt="" loading="lazy" decoding="async" />
                  <span>{language === "zh-CN" || wallpaper.custom ? wallpaper.name : wallpaper.id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")}</span>
                </button>
                <button
                  type="button"
                  className={`wallpaper-collection-check ${wallpaperCollection.includes(wallpaper.id) ? "active" : ""}`}
                  onClick={() => toggleWallpaperCollection(wallpaper.id)}
                  title={wallpaperCollection.includes(wallpaper.id) ? text("从壁纸集移除", "Remove from collection") : text("加入壁纸集", "Add to collection")}
                >
                  {wallpaperCollection.includes(wallpaper.id) ? <Check size={14} /> : <Plus size={14} />}
                </button>
                {wallpaper.custom && (
                  <button type="button" className="wallpaper-remove" onClick={() => removeCustomWallpaper(wallpaper.id)} title={text("删除上传壁纸", "Delete uploaded wallpaper")}><X size={13} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "icons" && (
        <div className="resource-icon-section">
          <div className="resource-section-head">
            <div><strong>{text("图标管理", "Icon manager")}</strong><small>{text(`${curatedIconCount} 个品牌匹配 · ${builtInShortcutIcons.length} 个默认图标`, `${curatedIconCount} brand matches · ${builtInShortcutIcons.length} default icons`)}</small></div>
          </div>
          <div className="resource-icon-grid">
            {builtInShortcutIcons.map((icon) => {
              const { id, Icon, tone } = icon;
              return (
              <div key={id}>
                <span style={{ color: tone }}><Icon size={23} /></span>
                <small>{builtInShortcutIconLabelFor(language, icon)}</small>
              </div>
              );
            })}
          </div>
          <div className="resource-shortcut-icons">
            <div className="resource-shortcut-icon-toolbar">
              <div className="resource-subtitle"><strong>{text("逐个选择", "Choose individually")}</strong><small>{text(`${matchingIconShortcuts.length} 个网站`, `${matchingIconShortcuts.length} sites`)}</small></div>
              <label className="resource-search"><Search size={16} /><input value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder={text("搜索网站或网址", "Search sites or URLs")} /></label>
            </div>
            <div className="resource-shortcut-icon-list">
              {visibleIconShortcuts.map((shortcut) => (
                <button type="button" key={shortcut.id} onClick={() => onEditShortcut(shortcut)}>
                  <span className="shortcut-icon">
                    <ShortcutIconContent url={shortcut.url} iconUrl={shortcut.iconUrl} iconText={shortcut.iconText} iconColor={shortcut.iconColor} iconUpdatedAt={shortcut.iconUpdatedAt} title={shortcut.title} fallback={shortcut.title.slice(0, 1)} />
                  </span>
                  <span>
                    <strong>{shortcut.title}</strong>
                    <small>{text("选择品牌图标或默认图标", "Choose a brand or default icon")}</small>
                  </span>
                  <Edit3 size={15} />
                </button>
              ))}
            </div>
            {!matchingIconShortcuts.length && <p className="resource-icon-empty">{text("没有匹配的网站", "No matching sites")}</p>}
            {visibleIconShortcuts.length < matchingIconShortcuts.length && (
              <button
                type="button"
                className="resource-icon-load-more"
                onClick={() => setIconRenderLimit((current) => Math.min(matchingIconShortcuts.length, current + ICON_MANAGER_RENDER_BATCH))}
              >
                {text(`再显示 ${Math.min(ICON_MANAGER_RENDER_BATCH, matchingIconShortcuts.length - visibleIconShortcuts.length)} 个`, `Show ${Math.min(ICON_MANAGER_RENDER_BATCH, matchingIconShortcuts.length - visibleIconShortcuts.length)} more`)}
              </button>
            )}
          </div>
        </div>
      )}
    </DialogShell>
  );
}

function PageManagerDialog({
  customPages,
  hiddenPages,
  systemOrder,
  systemLabels,
  systemIcons,
  onAdd,
  onDelete,
  onUpdateCustom,
  onMoveCustom,
  onUpdateSystem,
  onMoveSystem,
  onToggleSystem,
  onOpenPage,
  onClose
}: {
  customPages: CustomNavPage[];
  hiddenPages: Set<Exclude<SystemNavPage, "widgets">>;
  systemOrder: SystemNavPage[];
  systemLabels: NonNullable<AppState["settings"]["navigationLabels"]>;
  systemIcons: NonNullable<AppState["settings"]["navigationIcons"]>;
  onAdd: (name: string, icon: CustomNavPageIcon) => void;
  onDelete: (page: CustomNavPage) => void;
  onUpdateCustom: (page: CustomNavPage, name: string, icon: CustomNavPageIcon) => void;
  onMoveCustom: (page: CustomNavPage, direction: -1 | 1) => void;
  onUpdateSystem: (page: SystemNavPage, name: string, icon: CustomNavPageIcon) => void;
  onMoveSystem: (page: SystemNavPage, direction: -1 | 1) => void;
  onToggleSystem: (page: Exclude<SystemNavPage, "widgets">) => void;
  onOpenPage: (page: CustomNavPage) => void;
  onClose: () => void;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<CustomNavPageIcon>("star");
  const [systemDrafts, setSystemDrafts] = useState(() => Object.fromEntries(
    systemOrder.map((page) => [page, {
      name: systemLabels[page] || localized(language, systemNavDefaults[page].title, systemNavDefaults[page].label),
      icon: systemIcons[page] || systemNavDefaults[page].icon
    }])
  ) as Record<SystemNavPage, { name: string; icon: CustomNavPageIcon }>);
  const [customDrafts, setCustomDrafts] = useState(() => Object.fromEntries(
    customPages.map((page) => [page.id, { name: page.name, icon: page.icon }])
  ) as Record<string, { name: string; icon: CustomNavPageIcon }>);
  const [savedRow, setSavedRow] = useState<string>();
  const confirmSaved = (row: string) => {
    setSavedRow(row);
    window.setTimeout(() => setSavedRow((current) => current === row ? undefined : current), 1400);
  };
  const createPage = () => {
    if (!name.trim()) return;
    onAdd(name, icon);
  };

  return (
    <DialogShell title={text("导航与页面", "Navigation and pages")} onClose={onClose} className="page-manager-dialog lucid-page-manager">
      <div className="lucid-dialog-intro">
        <SlidersHorizontal size={19} />
        <div><strong>{text("让导航只保留真正需要的入口", "Keep only the navigation entries you need")}</strong><span>{text("名称、图标、顺序和显示状态都会同步到你的其他设备。", "Names, icons, order, and visibility sync to your other devices.")}</span></div>
      </div>
      <section className="page-manager-list" aria-label={text("系统页面", "System pages")}>
        <div className="page-manager-section-title"><span>{text("系统页面", "System pages")}</span><small>{text(`${systemOrder.length} 个`, `${systemOrder.length} pages`)}</small></div>
        {systemOrder.map((page, index) => {
          const draft = systemDrafts[page] || { name: systemNavDefaults[page].label, icon: systemNavDefaults[page].icon };
          const hidden = page !== "widgets" && hiddenPages.has(page);
          const SystemPageIcon = customNavPageIcons[draft.icon]?.Icon || House;
          return (
            <div className={`page-manager-row lucid-page-row ${hidden ? "is-hidden" : ""}`} key={page}>
              <span className="page-manager-icon"><SystemPageIcon size={18} /></span>
              <input
                aria-label={text(`${systemNavDefaults[page].title}导航名称`, `${systemNavDefaults[page].label} navigation name`)}
                maxLength={24}
                value={draft.name}
                onChange={(event) => { setSavedRow(undefined); setSystemDrafts((current) => ({ ...current, [page]: { ...draft, name: event.target.value } })); }}
              />
              <select
                aria-label={text(`${systemNavDefaults[page].title}导航图标`, `${systemNavDefaults[page].label} navigation icon`)}
                value={draft.icon}
                onChange={(event) => { setSavedRow(undefined); setSystemDrafts((current) => ({ ...current, [page]: { ...draft, icon: event.target.value as CustomNavPageIcon } })); }}
              >
                {(Object.entries(customNavPageIcons) as Array<[CustomNavPageIcon, (typeof customNavPageIcons)[CustomNavPageIcon]]>).map(([key, meta]) => (
                  <option value={key} key={key}>{customNavPageIconLabelFor(language, key)}</option>
                ))}
              </select>
              <div className="lucid-page-row-actions">
                <button type="button" disabled={index === 0} title={text("向上移动", "Move up")} aria-label={text("向上移动", "Move up")} onClick={() => onMoveSystem(page, -1)}><ArrowUp size={15} /></button>
                <button type="button" disabled={index === systemOrder.length - 1} title={text("向下移动", "Move down")} aria-label={text("向下移动", "Move down")} onClick={() => onMoveSystem(page, 1)}><ArrowDown size={15} /></button>
                <button type="button" className={savedRow === `system:${page}` ? "is-saved" : ""} title={savedRow === `system:${page}` ? text("已保存", "Saved") : text("保存入口", "Save entry")} aria-label={text("保存入口", "Save entry")} onClick={() => { onUpdateSystem(page, draft.name, draft.icon); confirmSaved(`system:${page}`); }}>{savedRow === `system:${page}` ? <Check size={15} /> : <Save size={15} />}</button>
                {page === "widgets" ? <span className="page-manager-locked" title={text("主页固定显示", "Home is always visible")}><Pin size={14} /></span> : (
                  <button type="button" title={hidden ? text(`显示${draft.name}`, `Show ${draft.name}`) : text(`隐藏${draft.name}`, `Hide ${draft.name}`)} onClick={() => onToggleSystem(page)}>
                  {hidden ? <Plus size={16} /> : <EyeOff size={16} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="page-manager-list" aria-label={text("自定义页面", "Custom pages")}>
        <div className="page-manager-section-title"><span>{text("我的页面", "My pages")}</span><small>{text(`${customPages.length} 个`, `${customPages.length} pages`)}</small></div>
        {customPages.map((page, index) => {
          const draft = customDrafts[page.id] || { name: page.name, icon: page.icon };
          const PageIcon = customNavPageIcons[draft.icon]?.Icon || Star;
          return (
            <div className="page-manager-row lucid-page-row" key={page.id}>
              <button type="button" className="page-manager-icon" title={text("打开页面", "Open page")} aria-label={text(`打开${page.name}`, `Open ${page.name}`)} onClick={() => onOpenPage(page)}><PageIcon size={18} /></button>
              <input
                aria-label={text(`${page.name}页面名称`, `${page.name} page name`)}
                maxLength={24}
                value={draft.name}
                onChange={(event) => { setSavedRow(undefined); setCustomDrafts((current) => ({ ...current, [page.id]: { ...draft, name: event.target.value } })); }}
              />
              <select
                aria-label={text(`${page.name}页面图标`, `${page.name} page icon`)}
                value={draft.icon}
                onChange={(event) => { setSavedRow(undefined); setCustomDrafts((current) => ({ ...current, [page.id]: { ...draft, icon: event.target.value as CustomNavPageIcon } })); }}
              >
                {(Object.entries(customNavPageIcons) as Array<[CustomNavPageIcon, (typeof customNavPageIcons)[CustomNavPageIcon]]>).map(([key, meta]) => (
                  <option value={key} key={key}>{customNavPageIconLabelFor(language, key)}</option>
                ))}
              </select>
              <div className="lucid-page-row-actions">
                <button type="button" disabled={index === 0} title={text("向上移动", "Move up")} aria-label={text("向上移动", "Move up")} onClick={() => onMoveCustom(page, -1)}><ArrowUp size={15} /></button>
                <button type="button" disabled={index === customPages.length - 1} title={text("向下移动", "Move down")} aria-label={text("向下移动", "Move down")} onClick={() => onMoveCustom(page, 1)}><ArrowDown size={15} /></button>
                <button type="button" className={savedRow === `custom:${page.id}` ? "is-saved" : ""} title={savedRow === `custom:${page.id}` ? text("已保存", "Saved") : text("保存页面", "Save page")} aria-label={text("保存页面", "Save page")} onClick={() => { onUpdateCustom(page, draft.name, draft.icon); confirmSaved(`custom:${page.id}`); }}>{savedRow === `custom:${page.id}` ? <Check size={15} /> : <Save size={15} />}</button>
                <button type="button" className="page-manager-delete" title={text(`删除${page.name}页面`, `Delete ${page.name}`)} onClick={() => onDelete(page)}><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
        {!customPages.length && <p className="page-manager-empty">{text("还没有自定义页面", "No custom pages yet")}</p>}
      </section>

      <form className="page-create-form" onSubmit={(event) => { event.preventDefault(); createPage(); }}>
        <label>
          <span>{text("新页面名称", "New page name")}</span>
          <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder={text("例如：工作", "For example: Work")} />
        </label>
        <div className="page-icon-picker" role="radiogroup" aria-label={text("页面图标", "Page icon")}>
          {(Object.entries(customNavPageIcons) as Array<[CustomNavPageIcon, (typeof customNavPageIcons)[CustomNavPageIcon]]>).map(([key, meta]) => {
            const Icon = meta.Icon;
            return (
              <button type="button" role="radio" aria-checked={icon === key} className={icon === key ? "active" : ""} title={customNavPageIconLabelFor(language, key)} onClick={() => setIcon(key)} key={key}>
                <Icon size={18} />
              </button>
            );
          })}
        </div>
        <button type="submit" className="primary" disabled={!name.trim()}><Plus size={16} /> {text("新建页面", "Create page")}</button>
      </form>
      <p className="page-manager-safety"><ShieldCheck size={14} /> {text("删除自定义页面只移除导航入口，页面内的网站仍保留在“空间”分类中。", "Deleting a custom page removes only its navigation entry; its sites remain available in Spaces.")}</p>
    </DialogShell>
  );
}

function SettingsDialog({ state, clock, updateCheck, migrationBackupAvailable, updateState, onImport, onImportBackup, onExport, onRestoreMigrationBackup, onCheckUpdate, onOpenTimeZone, onOpenWallpapers, onWeatherUseLocationChange, onClose }: {
  state: AppState;
  clock: Date;
  updateCheck: UpdateCheckResult;
  migrationBackupAvailable: boolean;
  updateState: (updater: (state: AppState) => AppState) => void;
  onImport: () => void;
  onImportBackup: (file: File) => Promise<void>;
  onExport: () => void;
  onRestoreMigrationBackup: () => void;
  onCheckUpdate: () => void;
  onOpenTimeZone: () => void;
  onOpenWallpapers: () => void;
  onWeatherUseLocationChange: (enabled: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [section, setSection] = useState<"appearance" | "navigation" | "data" | "about">("appearance");
  const settings = state.settings;
  const language: UiLanguage = settings.language === "en-US" ? "en-US" : "zh-CN";
  const text = (zh: string, en: string) => localized(language, zh, en);
  const selectedWallpaper = builtInWallpapers.find((wallpaper) => wallpaper.id === settings.wallpaperPreset);
  const selectedCustomWallpaper = (settings.customWallpapers || []).find((wallpaper) => wallpaper.id === settings.wallpaperPreset);
  const wallpaperPreviewUrl = settings.wallpaper || selectedWallpaper?.url || selectedCustomWallpaper?.dataUrl || builtInWallpapers[0].url;
  const wallpaperName = settings.wallpaper
    ? text("自定义背景", "Custom background")
    : selectedCustomWallpaper?.name
      || (language === "zh-CN"
        ? selectedWallpaper?.name
        : selectedWallpaper?.id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "))
      || text("默认壁纸", "Default wallpaper");
  const settingsTime = new Intl.DateTimeFormat(language, {
    timeZone: settings.timeZone || "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(clock);
  const noteConflicts = state.notes.filter((note) => !note.deletedAt && note.conflictBody);
  const exportNotesMarkdown = () => {
    const notes = state.notes
      .filter((note) => !note.deletedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const markdown = notes.map((note) => [
      `# ${(note.title || text("未命名笔记", "Untitled note")).replace(/[\r\n]+/g, " ")}`,
      "",
      note.body,
      "",
      `> ${text("更新时间", "Updated")}: ${new Date(note.updatedAt).toLocaleString(language)}`
    ].join("\n")).join("\n\n---\n\n");
    downloadText(`whynavo-notes-${new Date().toISOString().slice(0, 10)}.md`, markdown, "text/markdown;charset=utf-8");
  };
  const setSetting = <K extends keyof AppState["settings"]>(key: K, value: AppState["settings"][K]) => {
    updateState((current) => ({ ...current, settings: { ...current.settings, [key]: value, updatedAt: nowIso() } }));
  };
  const updateMessage = updateCheck.status === "checking"
    ? text("正在检查更新…", "Checking for updates...")
    : updateCheck.status === "available"
      ? text(`发现新版本 ${updateCheck.manifest.latestVersion}`, `Version ${updateCheck.manifest.latestVersion} is available`)
      : updateCheck.status === "unsupported"
        ? text(`当前版本低于最低支持版本 ${updateCheck.manifest.minimumSupportedVersion}`, `This version is below the minimum supported version ${updateCheck.manifest.minimumSupportedVersion}`)
        : updateCheck.status === "current"
          ? text("当前已是最新版本", "You are up to date")
          : updateCheck.status === "error"
            ? updateCheck.message
            : text("可手动检查是否有新版", "Check manually for a new version");
  const updateTarget = updateCheck.status === "available" || updateCheck.status === "unsupported"
    ? updateCheck.manifest.updateUrl || updateCheck.manifest.releaseNotesUrl || UPDATE_TARGET_URL
    : UPDATE_TARGET_URL;
  const sections = [
    { id: "appearance" as const, label: text("外观", "Appearance"), Icon: Palette },
    { id: "navigation" as const, label: text("导航", "Navigation"), Icon: SlidersHorizontal },
    { id: "data" as const, label: text("数据", "Data"), Icon: Database },
    { id: "about" as const, label: text("版本", "About"), Icon: RefreshCcw }
  ];
  return (
    <DialogShell title={text("设置", "Settings")} onClose={onClose} className="settings-dialog-overlay lucid-settings-overlay">
      <div className="lucid-settings-layout">
        <nav className="lucid-settings-nav" aria-label={text("设置分类", "Settings sections")}>
          {sections.map((item) => (
            <button type="button" className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)} key={item.id}>
              <item.Icon size={17} /><span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="lucid-settings-content">
          {section === "appearance" && (
            <section className="lucid-settings-section">
              <header><span>{text("外观", "Appearance")}</span><h3>{text("克制、清晰，并与你的壁纸协调", "Quiet, clear, and balanced with your wallpaper")}</h3></header>
              <div className="lucid-setting-row">
                <div><strong>{text("界面语言", "Language")}</strong><span>{text("立即切换，并随账号同步到其他设备", "Switch instantly and sync across devices")}</span></div>
                <div className="settings-segments" role="radiogroup" aria-label={text("界面语言", "Interface language")}>
                  <button type="button" role="radio" aria-checked={language === "zh-CN"} className={language === "zh-CN" ? "active" : ""} onClick={() => setSetting("language", "zh-CN")}><Languages size={15} />中文</button>
                  <button type="button" role="radio" aria-checked={language === "en-US"} className={language === "en-US" ? "active" : ""} onClick={() => setSetting("language", "en-US")}><Languages size={15} />English</button>
                </div>
              </div>
              <div className="lucid-setting-row">
                <div><strong>{text("主题", "Theme")}</strong><span>{text("切换浅色或深色界面", "Choose a light or dark interface")}</span></div>
                <div className="settings-segments" role="radiogroup" aria-label={text("主题", "Theme")}>
                  <button type="button" role="radio" aria-checked={settings.theme === "light"} className={settings.theme === "light" ? "active" : ""} onClick={() => setSetting("theme", "light")}><Sun size={15} />{text("浅色", "Light")}</button>
                  <button type="button" role="radio" aria-checked={settings.theme === "dark"} className={settings.theme === "dark" ? "active" : ""} onClick={() => setSetting("theme", "dark")}><Moon size={15} />{text("深色", "Dark")}</button>
                </div>
              </div>
              <div className="lucid-setting-row lucid-wallpaper-row">
                <div><strong>{text("壁纸", "Wallpaper")}</strong><span>{wallpaperName}</span></div>
                <button type="button" className="lucid-wallpaper-button" onClick={onOpenWallpapers}>
                  <span style={{ "--settings-wallpaper": cssImageUrl(wallpaperPreviewUrl) } as React.CSSProperties} aria-hidden="true" />
                  <b>{text("选择壁纸", "Choose wallpaper")}</b>
                  <ChevronRight size={16} />
                </button>
              </div>
              <label className="lucid-setting-row">
                <div><strong>{text("搜索引擎", "Search engine")}</strong><span>{text("主页和搜索页使用同一个网络搜索引擎", "Home and Search use the same web search engine")}</span></div>
                <select className="lucid-compact-input" value={settings.searchEngine || "baidu"} onChange={(event) => setSetting("searchEngine", event.target.value as SearchEngine)}>
                  <option value="baidu">{searchEngineLabelFor(language, "baidu")}</option>
                  <option value="google">Google</option>
                </select>
              </label>
              <label className="lucid-setting-row lucid-range-row">
                <div><strong>{text("图标尺寸", "Icon size")}</strong><span>{text(`主页与空间统一为 ${settings.iconSize}px`, `Home and Spaces use ${settings.iconSize}px`)}</span></div>
                <input type="range" min="48" max="80" value={settings.iconSize} onChange={(event) => setSetting("iconSize", Number(event.target.value))} />
              </label>
              <label className="lucid-setting-row lucid-range-row">
                <div><strong>{text("界面通透度", "Transparency")}</strong><span>{text("控制组件表面的透明程度", "Control the transparency of surfaces")}</span></div>
                <input type="range" min="28" max="88" value={settings.glass} onChange={(event) => setSetting("glass", Number(event.target.value))} />
              </label>
              <div className="lucid-setting-row">
                <div><strong>{text("网站图标", "Site icons")}</strong><span>{text("高清结果会缓存在本机，不会每次重新加载", "Resolved icons are cached locally instead of reloaded each time")}</span></div>
                <label className="lucid-switch"><input type="checkbox" checked={settings.remoteIconLookup ?? true} onChange={(event) => setSetting("remoteIconLookup", event.target.checked)} /><span /></label>
              </div>
              <label className="lucid-setting-row">
                <div><strong>{text("城市", "City")}</strong><span>{text("天气小组件显示的位置", "Location shown in the weather widget")}</span></div>
                <select className="lucid-compact-input" value={settings.city} onChange={(event) => setSetting("city", event.target.value)}>
                  {!weatherCityOptions.some((city) => city.value === settings.city) && <option value={settings.city}>{settings.city}</option>}
                  {weatherCityOptions.map((city) => <option value={city.value} key={city.value}>{localized(language, city.zh, city.en)}</option>)}
                </select>
              </label>
              <div className="lucid-setting-row">
                <div><strong>{text("设备定位", "Device location")}</strong><span>{text("只在获取天气时读取当前位置", "Read your location only when fetching weather")}</span></div>
                <label className="lucid-switch"><input type="checkbox" checked={settings.weatherUseLocation ?? false} onChange={(event) => void onWeatherUseLocationChange(event.target.checked)} /><span /></label>
              </div>
              <div className="lucid-setting-row">
                <div><strong>{text("时间显示", "Time display")}</strong><span>{settingsTime} · {settings.timeZone || "Asia/Shanghai"}</span></div>
                <button type="button" className="lucid-inline-button" onClick={onOpenTimeZone}><Clock3 size={15} />{language === "zh-CN" ? (timeZoneLabels[settings.timeZone || "Asia/Shanghai"] || text("选择时区", "Choose time zone")) : (settings.timeZone || "Choose time zone").replace(/_/g, " ")}</button>
              </div>
            </section>
          )}

          {section === "navigation" && (
            <section className="lucid-settings-section">
              <header><span>{text("导航", "Navigation")}</span><h3>{text("导航固定在边缘，不改变内容中心", "Navigation stays at the edge without shifting the content")}</h3></header>
              <div className="lucid-setting-row">
                <div><strong>{text("位置", "Position")}</strong><span>{text("桌面端固定到屏幕左侧或右侧", "Pin to the left or right edge on desktop")}</span></div>
                <div className="settings-segments" role="radiogroup" aria-label={text("桌面导航位置", "Desktop navigation position")}>
                  <button type="button" role="radio" aria-checked={(settings.navigationSide || "left") === "left"} className={(settings.navigationSide || "left") === "left" ? "active" : ""} onClick={() => setSetting("navigationSide", "left")}><PanelLeft size={15} />{text("左侧", "Left")}</button>
                  <button type="button" role="radio" aria-checked={settings.navigationSide === "right"} className={settings.navigationSide === "right" ? "active" : ""} onClick={() => setSetting("navigationSide", "right")}><PanelRight size={15} />{text("右侧", "Right")}</button>
                </div>
              </div>
              <div className="lucid-setting-row lucid-setting-stack">
                <div><strong>{text("显示方式", "Visibility")}</strong><span>{text("自动隐藏使用稳定延迟，不会跟随鼠标抖动", "Auto-hide uses a stable delay to avoid pointer jitter")}</span></div>
                <div className="settings-segments settings-segments-three" role="radiogroup" aria-label={text("桌面导航显示方式", "Desktop navigation visibility")}>
                  <button type="button" role="radio" aria-checked={(settings.navigationDisplay || "always") === "always"} className={(settings.navigationDisplay || "always") === "always" ? "active" : ""} onClick={() => setSetting("navigationDisplay", "always")}><Pin size={15} />{text("始终", "Always")}</button>
                  <button type="button" role="radio" aria-checked={settings.navigationDisplay === "auto"} className={settings.navigationDisplay === "auto" ? "active" : ""} onClick={() => setSetting("navigationDisplay", "auto")}><Eye size={15} />{text("自动", "Auto")}</button>
                  <button type="button" role="radio" aria-checked={settings.navigationDisplay === "hidden"} className={settings.navigationDisplay === "hidden" ? "active" : ""} onClick={() => setSetting("navigationDisplay", "hidden")}><EyeOff size={15} />{text("隐藏", "Hidden")}</button>
                </div>
              </div>
            </section>
          )}

          {section === "data" && (
            <section className="lucid-settings-section">
              <header><span>{text("本机优先数据", "Local-first data")}</span><h3>{text("备份、恢复和迁移都由你控制", "You control backup, restore, and migration")}</h3></header>
              <div className="lucid-data-actions">
                <button type="button" onClick={onImport}><Import size={17} /><span><strong>{text("导入网站", "Import sites")}</strong><small>{text("支持 WeTab、浏览器书签与文本", "Supports WeTab, browser bookmarks, and text")}</small></span></button>
                <button type="button" onClick={exportNotesMarkdown}><FileText size={17} /><span><strong>{text("导出笔记", "Export notes")}</strong><small>{text("生成通用 Markdown 文件", "Creates a portable Markdown file")}</small></span></button>
                <button type="button" onClick={onExport}><Download size={17} /><span><strong>{text("导出完整备份", "Export complete backup")}</strong><small>{text("包含网站、笔记、任务和设置", "Includes sites, notes, tasks, and settings")}</small></span></button>
                <label className="lucid-data-action"><Upload size={17} /><span><strong>{text("恢复完整备份", "Restore complete backup")}</strong><small>{text("从 WhyNavo JSON 文件恢复", "Restore from a WhyNavo JSON file")}</small></span><input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImportBackup(file).catch((error) => window.alert(error instanceof Error ? error.message : text("备份恢复失败", "Backup restore failed"))); event.currentTarget.value = ""; }} /></label>
                <button type="button" disabled={!migrationBackupAvailable} onClick={onRestoreMigrationBackup}><TimerReset size={17} /><span><strong>{text("回到更新前数据", "Restore pre-update data")}</strong><small>{migrationBackupAvailable ? text("恢复本设备最近迁移点", "Restore the latest migration point on this device") : text("当前没有迁移恢复点", "No migration restore point is available")}</small></span></button>
              </div>
              <p className="lucid-data-notice"><ShieldCheck size={15} /> {text("备份可能包含私人便签、待办、照片和壁纸，请像保护私人文件一样保管。", "Backups may contain private notes, tasks, photos, and wallpapers. Protect them like private files.")}</p>
              {noteConflicts.length > 0 && (
                <div className="lucid-conflict-panel">
                  <strong>{text(`${noteConflicts.length} 条笔记包含同步冲突副本`, `${noteConflicts.length} notes contain sync conflict copies`)}</strong>
                  <div>
                    <button type="button" onClick={() => downloadJson(`whynavo-note-conflicts-${new Date().toISOString().slice(0, 10)}.json`, noteConflicts)}><Download size={15} />{text("导出", "Export")}</button>
                    <button type="button" onClick={() => updateState((current) => ({ ...current, notes: current.notes.map((note) => note.conflictBody ? { ...note, conflictBody: undefined, updatedAt: nowIso() } : note) }))}><Check size={15} />{text("保留当前", "Keep current")}</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {section === "about" && (
            <section className="lucid-settings-section">
              <header><span>WhyNavo</span><h3>{text("版本与兼容状态", "Version and compatibility")}</h3></header>
              <div className="lucid-version-mark"><Compass size={30} /><div><strong>WhyNavo {APP_VERSION}</strong><span>{text("本机优先的新标签页工作空间", "Local-first new tab workspace")}</span></div></div>
              <dl className="lucid-version-list">
                <div><dt>{text("应用版本", "App version")}</dt><dd>{APP_VERSION}</dd></div>
                <div><dt>{text("数据版本", "Data version")}</dt><dd>{state.dataSchemaVersion || DATA_SCHEMA_VERSION}</dd></div>
                <div><dt>{text("更新状态", "Update status")}</dt><dd className={updateCheck.status}>{updateMessage}</dd></div>
              </dl>
              <div className="lucid-version-actions">
                <button type="button" disabled={updateCheck.status === "checking"} onClick={onCheckUpdate}><RefreshCcw size={16} />{text("检查更新", "Check for updates")}</button>
                <button type="button" onClick={() => window.open(updateTarget, "_blank", "noopener,noreferrer")}><Globe2 size={16} />{text("发布页面", "Release page")}</button>
              </div>
            </section>
          )}
        </div>
      </div>
      <div className="lucid-settings-footer"><span>{text("所有界面设置会自动保存", "Interface settings save automatically")}</span><button type="button" className="primary" onClick={onClose}>{text("完成", "Done")}</button></div>
    </DialogShell>
  );
}

function TimeZoneDialog({ current, onClose, onChoose }: { current: string; onClose: () => void; onChoose: (timeZone: string) => void }) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const localizedZones = useMemo(() => timeZoneOptions.map((zone) => ({ ...zone, label: language === "zh-CN" ? zone.label : zone.value.replace(/_/g, " ") })), [language]);
  const localizedPriorityZones = useMemo(() => priorityTimeZoneOptions.map((zone) => ({ ...zone, label: language === "zh-CN" ? zone.label : zone.value.replace(/_/g, " ") })), [language]);
  const matchingTimeZones = useMemo(() => normalizedQuery
    ? localizedZones.filter((zone) => zone.label.toLowerCase().includes(normalizedQuery) || zone.value.toLowerCase().includes(normalizedQuery))
    : localizedPriorityZones, [localizedPriorityZones, localizedZones, normalizedQuery]);
  const filteredTimeZones = matchingTimeZones.slice(0, 100);
  return (
    <DialogShell title={text("选择时区", "Choose time zone")} onClose={onClose} className="timezone-popover">
      <label className="timezone-search"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("搜索城市或时区，例如 Shanghai", "Search a city or time zone, such as Shanghai")} /></label>
      <div className="timezone-result-count">
        {normalizedQuery
          ? text(`${matchingTimeZones.length} 个匹配时区${matchingTimeZones.length > filteredTimeZones.length ? "，请继续输入以缩小范围" : ""}`, `${matchingTimeZones.length} matching time zones${matchingTimeZones.length > filteredTimeZones.length ? "; keep typing to narrow the list" : ""}`)
          : text("常用时区", "Common time zones")}
      </div>
      <div className="timezone-list">
        {filteredTimeZones.map((zone) => (
          <button
            type="button"
            className={zone.value === current ? "active" : ""}
            key={zone.value}
            onClick={() => onChoose(zone.value)}
          >
            <strong>{zone.label}</strong>
            <span>{zone.value}</span>
          </button>
        ))}
        {!filteredTimeZones.length && <div className="timezone-empty">{text("没有找到匹配的时区", "No matching time zone found")}</div>}
      </div>
    </DialogShell>
  );
}

function SyncDialog({ state, sync, updateState, legacyStateAvailable, onAdoptLegacyData, onClose, onLogin, onSignOut, onSignOutAll, onDeleteAccount, onResetPassword, onResendVerification, onUpdatePassword, passwordRecovery, onPasswordRecoveryComplete, onSync, restoreAvailable, onRestore }: {
  state: AppState;
  sync: SyncStatus;
  updateState: (updater: (state: AppState) => AppState) => void;
  legacyStateAvailable: boolean;
  onAdoptLegacyData: () => Promise<void>;
  onClose: () => void;
  onLogin: (mode: "login" | "signup", email: string, password: string, captchaToken: string) => Promise<AuthResult>;
  onSignOut: () => Promise<void>;
  onSignOutAll: () => Promise<void>;
  onDeleteAccount: (password: string, captchaToken: string) => Promise<void>;
  onResetPassword: (email: string, captchaToken: string) => Promise<void>;
  onResendVerification: (email: string, captchaToken: string) => Promise<void>;
  onUpdatePassword: (password: string, currentPassword?: string, captchaToken?: string) => Promise<void>;
  passwordRecovery: boolean;
  onPasswordRecoveryComplete: () => void;
  onSync: (mode: SyncMode) => Promise<void>;
  restoreAvailable: boolean;
  onRestore: () => Promise<void>;
}) {
  const language = useUiLanguage();
  const text = (zh: string, en: string) => localized(language, zh, en);
  const passwordRequirement = text(PASSWORD_REQUIREMENT, `at least ${MIN_PASSWORD_LENGTH} characters with uppercase and lowercase letters and a number`);
  const authError = (error: unknown, zhFallback: string, enFallback: string) => (
    language === "zh-CN" ? friendlyAuthError(error, zhFallback) : enFallback
  );
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordUpdate, setShowPasswordUpdate] = useState(passwordRecovery);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordCaptchaToken, setPasswordCaptchaToken] = useState("");
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [deleteCaptchaToken, setDeleteCaptchaToken] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const authChallengeRef = useRef<TurnstileChallengeHandle>(null);
  const passwordChallengeRef = useRef<TurnstileChallengeHandle>(null);
  const deleteChallengeRef = useRef<TurnstileChallengeHandle>(null);
  useEffect(() => {
    if (passwordRecovery) setShowPasswordUpdate(true);
  }, [passwordRecovery]);
  const submit = async (mode: "login" | "signup") => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 320) {
      setError(text("请输入有效的邮箱地址", "Enter a valid email address."));
      return;
    }
    if (mode === "signup" && !isStrongPassword(password)) {
      setError(text(`密码需要${PASSWORD_REQUIREMENT}`, `The password must contain ${passwordRequirement}.`));
      return;
    }
    if (mode === "signup" && !legalConsent) {
      setError(text("请先确认已阅读并同意隐私与数据说明和服务条款", "Read and accept the Privacy and Data Notice and Terms of Service first."));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setEmail(normalizedEmail);
      const result = await onLogin(mode, normalizedEmail, password, captchaToken);
      setNotice(result.message);
      if (result.status === "verification-sent") {
        setAuthMode("login");
        setPassword("");
        setLegalConsent(false);
      }
    } catch (err) {
      setError(authError(err, mode === "signup" ? "注册失败，请稍后重试" : "登录失败，请检查邮箱和密码", mode === "signup" ? "Sign-up failed. Try again later." : "Sign-in failed. Check your email and password."));
    } finally {
      authChallengeRef.current?.reset();
      setBusy(false);
    }
  };
  const resetPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 320) {
      setError(text("请先填写邮箱地址", "Enter your email address first."));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setEmail(normalizedEmail);
      await onResetPassword(normalizedEmail, captchaToken);
      setNotice(text("密码重置邮件已发送，请前往邮箱继续操作。", "The password reset email has been sent. Continue from your inbox."));
    } catch (err) {
      setError(authError(err, "重置邮件发送失败，请稍后重试", "The reset email could not be sent. Try again later."));
    } finally {
      authChallengeRef.current?.reset();
      setBusy(false);
    }
  };
  const resendVerification = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 320) {
      setError(text("请先填写邮箱地址", "Enter your email address first."));
      return;
    }
    if (!captchaToken) {
      setError(text("请先完成安全验证", "Complete the security check first."));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setEmail(normalizedEmail);
      await onResendVerification(normalizedEmail, captchaToken);
      setNotice(text("如果该邮箱存在待验证注册，验证邮件已重新发送，请同时检查垃圾邮件。", "If this email has a pending registration, a new verification email was sent. Check your spam folder too."));
    } catch (err) {
      setError(authError(err, "验证邮件暂时无法重新发送，请稍后重试", "The verification email could not be resent. Try again later."));
    } finally {
      authChallengeRef.current?.reset();
      setBusy(false);
    }
  };
  const changePassword = async () => {
    if (!passwordRecovery && !currentPassword) {
      setError(text("请输入当前密码", "Enter your current password."));
      return;
    }
    if (!passwordRecovery && !passwordCaptchaToken) {
      setError(text("请先完成安全验证", "Complete the security check first."));
      return;
    }
    if (!isStrongPassword(newPassword)) {
      setError(text(`新密码需要${PASSWORD_REQUIREMENT}`, `The new password must contain ${passwordRequirement}.`));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError(text("两次输入的新密码不一致", "The new passwords do not match."));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onUpdatePassword(
        newPassword,
        passwordRecovery ? undefined : currentPassword,
        passwordRecovery ? undefined : passwordCaptchaToken
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordCaptchaToken("");
      setShowPasswordUpdate(false);
      if (passwordRecovery) onPasswordRecoveryComplete();
      setNotice(text("密码已更新。", "Password updated."));
    } catch (err) {
      setError(authError(err, "密码更新失败，请稍后重试", "The password could not be updated. Try again later."));
    } finally {
      passwordChallengeRef.current?.reset();
      setBusy(false);
    }
  };
  const deleteCurrentAccount = async () => {
    if (!sync.user?.email || deleteConfirmText.trim().toLowerCase() !== sync.user.email.toLowerCase()) {
      setError(text("请输入当前账号邮箱以确认永久删除", "Enter the current account email to confirm permanent deletion."));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!deletePassword) {
        setError(text("请输入当前账号密码", "Enter the current account password."));
        setBusy(false);
        return;
      }
      await onDeleteAccount(deletePassword, deleteCaptchaToken);
    } catch (err) {
      setError(authError(err, "账号删除失败，请稍后重试", "The account could not be deleted. Try again later."));
      deleteChallengeRef.current?.reset();
      setBusy(false);
    }
  };
  const signOutCurrent = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onSignOut();
    } catch (err) {
      setError(authError(err, "退出登录失败；账号数据仍保留在当前页面，请先导出备份后重试", "Sign-out failed. Account data remains on this page; export a backup before trying again."));
    } finally {
      setBusy(false);
    }
  };
  const signOutAllDevices = async () => {
    if (!window.confirm(text("退出所有设备？其他设备会在会话刷新后退出，未同步的修改可能暂时留在对应设备本机。", "Sign out on every device? Other devices will sign out after their sessions refresh, and unsynced changes may remain locally on those devices."))) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onSignOutAll();
    } catch (err) {
      setError(authError(err, "退出所有设备失败；账号数据仍保留在当前页面", "Could not sign out all devices. Account data remains on this page."));
    } finally {
      setBusy(false);
    }
  };
  const handlePasswordKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && email && password && captchaToken && CAPTCHA_CONFIGURED && !busy) {
      void submit(authMode);
    }
  };
  const importLegacyData = async () => {
    setLegacyBusy(true);
    setError("");
    setNotice("");
    try {
      await onAdoptLegacyData();
      setNotice(text("旧版本本机数据已导入当前账号，请执行一次合并同步。", "Legacy local data was imported into this account. Run a merge sync once."));
    } catch (err) {
      setError(language === "zh-CN" && err instanceof Error ? err.message : text("旧版本本机数据导入失败，请重试", "Legacy local data could not be imported. Try again."));
    } finally {
      setLegacyBusy(false);
    }
  };

  return (
    <DialogShell title={text("账号与云同步", "Account and cloud sync")} onClose={onClose} className="sync-dialog-overlay" scrollResetKey={authMode}>
      <div className="sync-hero">
        <div className="sync-hero-icon"><Database size={24} /></div>
        <div>
          <span>WHYNAVO CLOUD</span>
          <h3>{sync.user ? text("账号已连接", "Account connected") : authMode === "login" ? text("登录 WhyNavo 账号", "Sign in to WhyNavo") : text("创建 WhyNavo 账号", "Create a WhyNavo account")}</h3>
          <p>{sync.user ? text("当前设备可以和云端数据保持一致。", "This device can stay in sync with your cloud data.") : text("登录后可在电脑、手机和 iPad 间同步快捷方式、小组件、笔记和设置。", "Sign in to sync shortcuts, widgets, notes, and settings across computers, phones, and iPad.")}</p>
        </div>
      </div>

      {sync.user && (
        <>
          <div className="sync-status-grid">
            <div>
              <small>{text("账号", "Account")}</small>
              <strong>{sync.user.email}</strong>
            </div>
            <div>
              <small>{text("同步状态", "Sync status")}</small>
              <strong>{language === "zh-CN" ? sync.message : sync.syncing ? "Syncing" : sync.lastSyncedAt ? "Up to date" : "Ready"}</strong>
            </div>
            <div>
              <small>{text("最近同步", "Last sync")}</small>
              <strong>{sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString(language) : text("暂无记录", "No record yet")}</strong>
            </div>
          </div>

          <div className="sync-settings-panel">
            <label className="sync-toggle-row">
              <span>
                <strong>{text("自动同步", "Automatic sync")}</strong>
                <small>{text("打开新标签页和数据变化后自动更新云端。", "Update the cloud after opening a new tab or changing data.")}</small>
              </span>
              <input
                type="checkbox"
                checked={state.sync?.autoSync ?? true}
                onChange={(event) => updateState((current) => ({
                  ...current,
                  sync: {
                    ...current.sync,
                    autoSync: event.target.checked
                  }
                }))}
              />
            </label>
            <label className="sync-interval-row">
              <span>
                <strong>{text("同步间隔", "Sync interval")}</strong>
                <small>{text("最低 30 秒", "Minimum 30 seconds")}</small>
              </span>
              <input
                type="number"
                min="30"
                max="3600"
                value={state.sync?.intervalSeconds || 60}
                onChange={(event) => updateState((current) => ({
                  ...current,
                  sync: {
                    ...current.sync,
                    intervalSeconds: Math.min(3600, Math.max(30, Math.floor(Number(event.target.value) || 60)))
                  }
                }))}
              />
            </label>
          </div>
        </>
      )}

      {legacyStateAvailable && (
        <div className="sync-legacy-import">
          <strong>{text("检测到更新前本机数据", "Legacy local data detected")}</strong>
          <p>{text("旧版本把数据保存在未绑定账号的本机区域。为防止不同账号串数据，WhyNavo 不会自动导入。", "An older version stored this data outside an account. WhyNavo will not import it automatically, preventing data from crossing between accounts.")}</p>
          {sync.user ? (
            <button type="button" disabled={busy || legacyBusy || sync.syncing} onClick={() => void importLegacyData()}>
              <Download size={16} /> {text("确认属于当前账号并导入", "Confirm ownership and import")}
            </button>
          ) : (
            <small>{text("请先登录你在更新前使用的账号，再确认导入。", "Sign in to the account you used before the update, then confirm the import.")}</small>
          )}
        </div>
      )}

      {!sync.user && (
        <div className="sync-auth-panel">
          <div className="sync-auth-tabs" role="tablist" aria-label={text("账号操作", "Account actions")}>
            <button type="button" role="tab" aria-selected={authMode === "login"} className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setCaptchaToken(""); setError(""); setNotice(""); }}>{text("登录", "Sign in")}</button>
            <button type="button" role="tab" aria-selected={authMode === "signup"} className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setCaptchaToken(""); setError(""); setNotice(""); }}>{text("注册", "Sign up")}</button>
          </div>
          <label className="sync-field">
            <span>{text("邮箱", "Email")}</span>
            <div>
              <Mail size={17} />
              <input
                type="email"
                autoComplete="email"
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </label>
          <label className="sync-field">
            <span>{text("密码", "Password")}</span>
            <div>
              <KeyRound size={17} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                minLength={authMode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={handlePasswordKeyDown}
                placeholder={authMode === "login" ? text("输入账号密码", "Enter your password") : text("设置登录密码", "Create a password")}
              />
              <button
                type="button"
                className="sync-password-toggle"
                aria-label={showPassword ? text("隐藏密码", "Hide password") : text("显示密码", "Show password")}
                title={showPassword ? text("隐藏密码", "Hide password") : text("显示密码", "Show password")}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <p className="sync-auth-note">
            {authMode === "login"
              ? text("使用同一个账号登录其他设备，即可合并同步你的 WhyNavo 数据。未登录时在本机整理的内容也会自动带入当前账号。", "Sign in with the same account on other devices to merge and sync your WhyNavo data. Local data created before signing in is carried into this account.")
              : text(`注册密码需要${PASSWORD_REQUIREMENT}。验证邮箱后，即可在其他设备登录并同步。`, `Your password must contain ${passwordRequirement}. Verify your email before signing in and syncing on other devices.`)}
          </p>
          <p className="sync-legal-note">
            {text("请阅读", "Read the ")}
            <a href="./privacy.html" target="_blank" rel="noreferrer">{text("隐私与数据说明", "Privacy and Data Notice")}</a>
            {text("和", " and ")}
            <a href="./terms.html" target="_blank" rel="noreferrer">{text("服务条款", "Terms of Service")}</a>
            {text("。本机数据默认保存在当前浏览器，登录后才会同步可同步字段。", ". Local data stays in this browser by default; supported fields sync only after sign-in.")}
          </p>
          {authMode === "signup" && (
            <label className="sync-legal-consent">
              <input
                type="checkbox"
                checked={legalConsent}
                onChange={(event) => setLegalConsent(event.target.checked)}
              />
              <span>{text("我已阅读并同意隐私与数据说明和服务条款，并确认已达到所在地可独立同意网络服务的年龄。", "I accept the Privacy and Data Notice and Terms of Service, and confirm I meet the age required to consent to online services where I live.")}</span>
            </label>
          )}
          {CAPTCHA_CONFIGURED ? (
            <TurnstileChallenge
              key={authMode}
              ref={authChallengeRef}
              action={authMode}
              language={language}
              onToken={setCaptchaToken}
            />
          ) : (
            <p className="warning">{text("安全验证暂未配置，账号服务已暂停，请稍后再试。", "Security verification is not configured. Account services are temporarily unavailable.")}</p>
          )}
          {notice && <p className="sync-auth-success">{notice}</p>}
          {error && <p className="warning">{error}</p>}
          <button className="primary sync-submit" disabled={busy || !email || !password || !captchaToken || !CAPTCHA_CONFIGURED || (authMode === "signup" && !legalConsent)} onClick={() => submit(authMode)}>
            {busy ? text("处理中", "Processing") : authMode === "login" ? text("登录并同步", "Sign in and sync") : text("注册并同步", "Sign up and sync")}
          </button>
          {authMode === "login" && (
            <div className="sync-auth-secondary-actions">
              <button type="button" className="sync-reset-password" disabled={busy || !email || !captchaToken || !CAPTCHA_CONFIGURED} onClick={() => void resetPassword()}>{text("忘记密码", "Forgot password")}</button>
              <button type="button" className="sync-reset-password" disabled={busy || !email || !captchaToken || !CAPTCHA_CONFIGURED} onClick={() => void resendVerification()}>{text("重新发送验证邮件", "Resend verification email")}</button>
            </div>
          )}
        </div>
      )}
      {sync.user && (
        <div className="sync-connected-panel">
          <div className="sync-meta">
            <small>{text("设备 ID", "Device ID")}: {state.sync?.deviceId || text("未生成", "Not generated")}</small>
            {state.sync?.lastPulledAt && <small>{text("上次拉取", "Last pull")}: {new Date(state.sync.lastPulledAt).toLocaleString(language)}</small>}
            {state.sync?.lastPushedAt && <small>{text("上次上传", "Last push")}: {new Date(state.sync.lastPushedAt).toLocaleString(language)}</small>}
          </div>
          <div className="sync-choice-panel">
            <button className="primary" disabled={sync.syncing} onClick={() => onSync("merge")}><RefreshCcw size={16} /> {text("合并同步", "Merge and sync")}</button>
            <button disabled={sync.syncing} onClick={() => onSync("push")}><Upload size={16} /> {text("本机覆盖云端", "Replace cloud with this device")}</button>
            <button disabled={sync.syncing} onClick={() => onSync("pull")}><Download size={16} /> {text("云端覆盖本机", "Replace this device with cloud")}</button>
          </div>
          <p className="sync-hint">{text("合并同步会保留两端新增内容；同一项冲突时保留更新时间较新的版本。覆盖操作会先保存本机回退点。", "Merge sync keeps new content from both sides and keeps the newer version of a conflicting item. Replace operations save a local restore point first.")}</p>
          {passwordRecovery && <p className="sync-auth-success">{text(`密码重置链接已验证。请在下方设置${PASSWORD_REQUIREMENT}的新密码。`, `The reset link is verified. Create a new password with ${passwordRequirement} below.`)}</p>}
          {showPasswordUpdate && (
            <div className="sync-password-update">
              {!passwordRecovery && (
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder={text("输入当前密码", "Enter current password")}
                />
              )}
              <input type="password" minLength={MIN_PASSWORD_LENGTH} maxLength={256} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={text("输入符合安全要求的新密码", "Enter a secure new password")} />
              <input type="password" minLength={MIN_PASSWORD_LENGTH} maxLength={256} autoComplete="new-password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} placeholder={text("再次输入新密码", "Enter the new password again")} />
              {!passwordRecovery && (CAPTCHA_CONFIGURED ? (
                <TurnstileChallenge
                  ref={passwordChallengeRef}
                  action="password-change"
                  language={language}
                  onToken={setPasswordCaptchaToken}
                />
              ) : (
                <p className="warning">{text("安全验证暂不可用，暂时无法修改密码。", "Security verification is unavailable, so the password cannot be changed right now.")}</p>
              ))}
              <button
                type="button"
                disabled={
                  busy
                  || (!passwordRecovery && (!currentPassword || !passwordCaptchaToken || !CAPTCHA_CONFIGURED))
                  || !isStrongPassword(newPassword)
                  || newPassword !== confirmNewPassword
                }
                onClick={() => void changePassword()}
              >
                <Save size={16} /> {text("保存新密码", "Save new password")}
              </button>
            </div>
          )}
          {showDeleteAccount && (
            <div className="sync-delete-account">
              <strong>{text("永久删除账号与云端数据", "Permanently delete account and cloud data")}</strong>
              <p>{text("此操作会删除账号、云端同步数据和此设备上的账号数据，且无法恢复。请先导出完整备份。", "This permanently deletes the account, cloud sync data, and account data on this device. Export a complete backup first.")}</p>
              <input
                type="email"
                autoComplete="off"
                maxLength={320}
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder={sync.user.email || text("输入当前账号邮箱", "Enter the current account email")}
              />
              <input
                type="password"
                autoComplete="current-password"
                maxLength={256}
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder={text("输入当前账号密码", "Enter the current account password")}
              />
              {CAPTCHA_CONFIGURED ? (
                <TurnstileChallenge
                  ref={deleteChallengeRef}
                  action="delete-account"
                  language={language}
                  onToken={setDeleteCaptchaToken}
                />
              ) : (
                <p className="warning">{text("安全验证暂不可用，暂时无法删除账号。", "Security verification is unavailable, so the account cannot be deleted right now.")}</p>
              )}
              <button
                type="button"
                className="danger"
                disabled={busy || !deletePassword || !deleteCaptchaToken || !CAPTCHA_CONFIGURED || deleteConfirmText.trim().toLowerCase() !== sync.user.email?.toLowerCase()}
                onClick={() => void deleteCurrentAccount()}
              >
                <Trash2 size={16} /> {text("永久删除", "Delete permanently")}
              </button>
            </div>
          )}
          {notice && <p className="sync-auth-success">{notice}</p>}
          {error && <p className="warning">{error}</p>}
          <div className="button-row">
            <button disabled={!restoreAvailable || sync.syncing} onClick={() => void onRestore()}>{text("回到同步前版本", "Restore pre-sync version")}</button>
            <button type="button" onClick={() => { setShowPasswordUpdate((value) => !value); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); setPasswordCaptchaToken(""); setError(""); setNotice(""); }}><KeyRound size={16} /> {text("修改密码", "Change password")}</button>
            <button disabled={busy || sync.syncing} onClick={() => void signOutCurrent()}><LogOut size={16} /> {text("退出登录", "Sign out")}</button>
            <button disabled={busy || sync.syncing} onClick={() => void signOutAllDevices()}><LogOut size={16} /> {text("退出所有设备", "Sign out all devices")}</button>
            <button type="button" className="danger" onClick={() => { setShowDeleteAccount((value) => !value); setDeleteConfirmText(""); setDeletePassword(""); setDeleteCaptchaToken(""); setError(""); setNotice(""); }}><Trash2 size={16} /> {text("删除账号", "Delete account")}</button>
          </div>
        </div>
      )}
    </DialogShell>
  );
}

function DialogShell({ title, onClose, children, className, scrollResetKey }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  scrollResetKey?: string;
}) {
  const language = useUiLanguage();
  const dialogRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [title, scrollResetKey]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      const initial = dialog?.querySelector<HTMLElement>("[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]");
      initial?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, []);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    ) || []).filter((element) => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className={`overlay ${className || ""}`.trim()} onClick={onClose}>
      <section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={handleDialogKeyDown} onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label={localized(language, "关闭", "Close")} title={localized(language, "关闭", "Close")} onClick={onClose}><X size={18} /></button>
        </header>
        <div ref={bodyRef} className="dialog-body">{children}</div>
      </section>
    </div>,
    document.body
  );
}
