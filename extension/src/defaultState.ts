import type { AppState, WidgetKey, WidgetSize } from "./types";
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "./projectConfig";

let logicalNow = Date.now();

export const observeIsoTimestamp = (value?: string) => {
  if (!value) return;
  const timestamp = new Date(value).getTime();
  const latestSupportedTimestamp = Date.UTC(2100, 0, 1);
  if (Number.isFinite(timestamp) && timestamp <= latestSupportedTimestamp) {
    logicalNow = Math.max(logicalNow, timestamp);
  }
};

export const nowIso = () => {
  logicalNow = Math.max(Date.now(), logicalNow + 1);
  return new Date(logicalNow).toISOString();
};

export const uid = () => {
  if ("crypto" in window && "randomUUID" in crypto) return crypto.randomUUID();
  if ("crypto" in window && "getRandomValues" in crypto) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
};

export const defaultWidgetOrder: WidgetKey[] = ["weather", "calendar", "todos", "countdowns", "focus", "notes", "rates", "quote", "clock", "memo", "year", "calculator"];

export const defaultWidgetSizes: Record<WidgetKey, WidgetSize> = {
  weather: "wide",
  calendar: "wide",
  countdowns: "medium",
  todos: "wide",
  notes: "wide",
  rates: "wide",
  quote: "medium",
  focus: "medium",
  clock: "medium",
  memo: "medium",
  year: "medium",
  calculator: "medium"
};

const widgetDefaults: Record<WidgetKey, boolean> = {
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

export const defaultState = (): AppState => {
  const updatedAt = nowIso();
  return {
    version: 1,
    updatedAt,
    shortcutGroups: [
      { id: "default", name: "常用", color: "#14B8A6", order: 0, updatedAt }
    ],
    shortcuts: [],
    shortcutFolders: [],
    todos: [
      { id: uid(), text: "添加常用网站快捷方式", done: false, order: 0, updatedAt }
    ],
    notes: [
      { id: uid(), title: "随手笔记", body: "记录临时想法、链接或待整理的信息。", updatedAt }
    ],
    countdowns: [
      { id: uid(), title: "重要日期", date: updatedAt.slice(0, 10), updatedAt }
    ],
    settings: {
      theme: "light",
      wallpaperPreset: "coastal-glass",
      wallpaperRotation: false,
      customWallpapers: [],
      wallpaperCollection: ["coastal-glass", "neon-rain", "aurora-lake", "ocean-cliff"],
      quickNote: "",
      visualRefreshVersion: 11,
      dateTimeColor: "#ffffff",
      widgetAccentColor: "#2dd4bf",
      glass: 42,
      iconSize: 58,
      gridDensity: "comfortable",
      dockPosition: "bottom",
      city: "Shanghai",
      weatherUseLocation: false,
      searchEngine: "baidu",
      timeZone: "Asia/Shanghai",
      widgetOrder: defaultWidgetOrder,
      widgetSizes: defaultWidgetSizes,
      customNavPages: [],
      hiddenNavPages: [],
      navigationDisplay: "always",
      navigationSide: "left",
      remoteIconLookup: true,
      calendarRecords: {},
      widgets: widgetDefaults,
      supabaseUrl: DEFAULT_SUPABASE_URL,
      supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
      updatedAt
    },
    sync: {
      deviceId: uid(),
      autoSync: true,
      intervalSeconds: 60
    }
  };
};
