import type { ImportShortcut, Shortcut, ShortcutFolder, ShortcutGroup } from "./types";
import { nowIso, uid } from "./defaultState";
import { normalizeHttpUrl } from "./urls";

export const MAX_IMPORTED_SHORTCUTS = 5000;
export const MAX_IMPORT_TEXT_CHARS = 8 * 1024 * 1024;
const MAX_IMPORT_NESTING_DEPTH = 32;
const MAX_IMPORTED_LABEL_CHARS = 1000;
const MAX_IMPORTED_URL_CHARS = 8192;
const MAX_IMPORTED_ICON_CHARS = 4 * 1024 * 1024;
const MAX_REMOTE_ICON_URL_CHARS = 8192;
const cleanLabel = (value: unknown, maxLength = MAX_IMPORTED_LABEL_CHARS) => String(value || "").trim().slice(0, maxLength);
const cleanUrl = (value: string) => {
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_IMPORTED_URL_CHARS) return "";
  return normalizeHttpUrl(candidate) || "";
};
export const normalizeIconReference = (value: unknown) => {
  if (typeof value !== "string" || value.length > MAX_IMPORTED_ICON_CHARS) return undefined;
  const candidate = value.trim();
  if (!candidate) return undefined;
  if (candidate.startsWith("whytab-icon:")) return candidate;
  if (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(candidate)) return candidate;
  if (candidate.length > MAX_REMOTE_ICON_URL_CHARS) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};
const cleanIconUrl = normalizeIconReference;
const isImportRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const decodeHtmlEntities = (value: string) => value.replace(
  /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|amp|apos|gt|lt|nbsp|quot);/gi,
  (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
    if (decimal || hexadecimal) {
      const codePoint = Number.parseInt(decimal || hexadecimal || "", hexadecimal ? 16 : 10);
      return Number.isInteger(codePoint)
        && codePoint > 0
        && codePoint <= 0x10ffff
        && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : "";
    }
    const named = entity.toLowerCase();
    if (named === "&amp;") return "&";
    if (named === "&apos;") return "'";
    if (named === "&gt;") return ">";
    if (named === "&lt;") return "<";
    if (named === "&quot;") return "\"";
    return " ";
  }
);

const readTagEnd = (html: string, start: number) => {
  let quote: "\"" | "'" | undefined;
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
};

const parseTagAttributes = (source: string) => {
  const attributes = new Map<string, string>();
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index += 1;
    if (index >= source.length || source[index] === "/") break;
    const nameStart = index;
    while (index < source.length && !/[\s=/>]/.test(source[index])) index += 1;
    const name = source.slice(nameStart, index).toLowerCase();
    while (index < source.length && /\s/.test(source[index])) index += 1;
    let value = "";
    if (source[index] === "=") {
      index += 1;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const quote = source[index] === "\"" || source[index] === "'" ? source[index] : undefined;
      if (quote) {
        index += 1;
        const valueStart = index;
        while (index < source.length && source[index] !== quote) index += 1;
        value = source.slice(valueStart, index);
        if (source[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (index < source.length && !/[\s>]/.test(source[index])) index += 1;
        value = source.slice(valueStart, index);
      }
    }
    if (name && !attributes.has(name)) attributes.set(name, decodeHtmlEntities(value));
  }
  return attributes;
};

type ParsedBookmarkAnchor = {
  href: string;
  icon?: string;
  text: string;
};

const tokenizeBookmarkAnchors = (html: string): ParsedBookmarkAnchor[] => {
  const anchors: ParsedBookmarkAnchor[] = [];
  let active: ParsedBookmarkAnchor | undefined;
  let ignoredTextTag: "script" | "style" | undefined;
  let cursor = 0;
  const completeActiveAnchor = () => {
    if (active && anchors.length < MAX_IMPORTED_SHORTCUTS) anchors.push(active);
    active = undefined;
    ignoredTextTag = undefined;
  };

  while (cursor < html.length && anchors.length < MAX_IMPORTED_SHORTCUTS) {
    const tagStart = html.indexOf("<", cursor);
    if (tagStart < 0) {
      if (active && !ignoredTextTag) active.text += decodeHtmlEntities(html.slice(cursor));
      break;
    }
    if (active && !ignoredTextTag && tagStart > cursor) {
      active.text += decodeHtmlEntities(html.slice(cursor, tagStart));
    }
    const tagEnd = readTagEnd(html, tagStart);
    if (tagEnd < 0) break;
    const rawTag = html.slice(tagStart + 1, tagEnd).trim();
    const closing = rawTag.startsWith("/");
    const tagBody = closing ? rawTag.slice(1).trimStart() : rawTag;
    const nameMatch = tagBody.match(/^([a-z][a-z0-9:-]*)/i);
    const tagName = nameMatch?.[1]?.toLowerCase();
    if (tagName === "a") {
      if (closing) {
        completeActiveAnchor();
      } else {
        completeActiveAnchor();
        const attributes = parseTagAttributes(tagBody.slice(nameMatch?.[0].length || 0));
        const href = attributes.get("href");
        if (href) active = { href, icon: attributes.get("icon"), text: "" };
      }
    } else if (active && (tagName === "script" || tagName === "style")) {
      if (closing && ignoredTextTag === tagName) ignoredTextTag = undefined;
      else if (!closing && !ignoredTextTag) ignoredTextTag = tagName;
    }
    cursor = tagEnd + 1;
  }
  if (active && anchors.length < MAX_IMPORTED_SHORTCUTS) completeActiveAnchor();
  return anchors;
};

const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value) || /^[\w.-]+\.[a-z]{2,}/i.test(value);

export const faviconHostFor = (url: string) => {
  try {
    const host = new URL(cleanUrl(url)).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !host.includes(".")
      || host.includes(":")
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
      || host === "localhost"
      || /\.(?:home\.arpa|internal|invalid|lan|local|localhost|onion|test)$/.test(host)
    ) return undefined;
    return host;
  } catch {
    return undefined;
  }
};

export const faviconFor = (url: string) => {
  const host = faviconHostFor(url);
  if (!host) return undefined;
  return `https://www.google.com/s2/favicons?domain_url=https://${host}&sz=256`;
};

export const fallbackFaviconFor = (url: string) => {
  const host = faviconHostFor(url);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : undefined;
};

export const siteIconCandidatesFor = (url: string) => {
  const host = faviconHostFor(url);
  if (!host) return [];
  const origin = `https://${host}`;
  return [
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `${origin}/android-chrome-192x192.png`,
    `${origin}/favicon-192x192.png`,
    `${origin}/favicon.ico`
  ];
};

const simpleIcon = (slug: string) => `https://cdn.simpleicons.org/${slug}`;

const curatedIconRules: Array<{ hosts?: string[]; title?: string[]; iconUrl: string }> = [
  { hosts: ["maps.google.com"], title: ["google maps", "谷歌地图"], iconUrl: simpleIcon("googlemaps") },
  { hosts: ["google.com", "google.com.hk"], title: ["google"], iconUrl: simpleIcon("google") },
  { hosts: ["youtube.com", "youtu.be"], iconUrl: simpleIcon("youtube") },
  { hosts: ["chatgpt.com", "openai.com"], title: ["chatgpt", "openai", "sora"], iconUrl: simpleIcon("openai") },
  { hosts: ["gemini.google.com"], title: ["gemini"], iconUrl: simpleIcon("googlegemini") },
  { hosts: ["deepseek.com", "chat.deepseek.com"], title: ["deepseek"], iconUrl: simpleIcon("deepseek") },
  { hosts: ["xiaohongshu.com"], title: ["小红书"], iconUrl: simpleIcon("xiaohongshu") },
  { hosts: ["notion.so", "notion.site"], title: ["notion"], iconUrl: simpleIcon("notion") },
  { hosts: ["pinterest.com"], title: ["pinterest"], iconUrl: simpleIcon("pinterest") },
  { hosts: ["fiverr.com"], title: ["fiverr"], iconUrl: simpleIcon("fiverr") },
  { hosts: ["bilibili.com"], title: ["bilibili", "哔哩哔哩"], iconUrl: simpleIcon("bilibili") },
  { hosts: ["weibo.com"], title: ["微博"], iconUrl: simpleIcon("sinaweibo") },
  { hosts: ["zhihu.com"], title: ["知乎"], iconUrl: simpleIcon("zhihu") },
  { hosts: ["douban.com"], title: ["豆瓣"], iconUrl: simpleIcon("douban") },
  { hosts: ["baidu.com"], title: ["百度"], iconUrl: simpleIcon("baidu") },
  { hosts: ["jd.com"], title: ["京东"], iconUrl: simpleIcon("jd") },
  { hosts: ["taobao.com", "tmall.com"], title: ["淘宝", "天猫"], iconUrl: simpleIcon("alibabadotcom") },
  { hosts: ["iqiyi.com"], title: ["爱奇艺"], iconUrl: simpleIcon("iqiyi") },
  { hosts: ["qq.com", "mail.qq.com"], title: ["qq", "腾讯"], iconUrl: simpleIcon("tencentqq") },
  { hosts: ["ctrip.com", "trip.com"], title: ["携程"], iconUrl: simpleIcon("tripdotcom") },
  { hosts: ["github.com"], title: ["github"], iconUrl: simpleIcon("github") },
  { hosts: ["supabase.co"], title: ["supabase"], iconUrl: simpleIcon("supabase") },
  { hosts: ["telegram.org", "web.telegram.org"], title: ["telegram"], iconUrl: simpleIcon("telegram") },
  { hosts: ["discord.com"], title: ["discord"], iconUrl: simpleIcon("discord") },
  { hosts: ["x.com", "twitter.com"], title: ["twitter", "x"], iconUrl: simpleIcon("x") },
  { hosts: ["figma.com"], title: ["figma"], iconUrl: simpleIcon("figma") },
  { hosts: ["canva.com"], title: ["canva"], iconUrl: simpleIcon("canva") },
  { hosts: ["facebook.com", "business.facebook.com"], title: ["facebook", "fb"], iconUrl: simpleIcon("facebook") },
  { hosts: ["meta.com"], title: ["meta"], iconUrl: simpleIcon("meta") },
  { hosts: ["gmail.com", "mail.google.com"], title: ["gmail", "谷歌邮箱"], iconUrl: simpleIcon("gmail") },
  { hosts: ["aliyun.com"], title: ["阿里云", "aliyun"], iconUrl: simpleIcon("alibabacloud") },
  { hosts: ["cloud.tencent.com"], title: ["腾讯云"], iconUrl: simpleIcon("tencentcloud") },
  { hosts: ["cloudflare.com"], title: ["cloudflare"], iconUrl: simpleIcon("cloudflare") },
  { hosts: ["vercel.com"], title: ["vercel"], iconUrl: simpleIcon("vercel") },
  { hosts: ["netlify.com"], title: ["netlify"], iconUrl: simpleIcon("netlify") },
  { hosts: ["civitai.com"], title: ["civitai"], iconUrl: simpleIcon("civitai") },
  { hosts: ["grok.com"], title: ["grok"], iconUrl: simpleIcon("x") },
  { hosts: ["coze.cn", "coze.com"], title: ["coze", "扣子"], iconUrl: simpleIcon("bytedance") },
  { hosts: ["feishu.cn", "larksuite.com"], title: ["飞书", "feishu", "lark"], iconUrl: simpleIcon("lark") },
  { hosts: ["instagram.com"], title: ["instagram"], iconUrl: simpleIcon("instagram") },
  { hosts: ["tiktok.com", "douyin.com"], title: ["tiktok", "抖音"], iconUrl: simpleIcon("tiktok") },
  { hosts: ["microsoft.com", "live.com", "office.com"], title: ["microsoft", "office"], iconUrl: simpleIcon("microsoft") },
  { hosts: ["apple.com"], title: ["apple"], iconUrl: simpleIcon("apple") }
];

export const curatedIconCount = curatedIconRules.length;

const hostMatches = (host: string, patterns?: string[]) => {
  if (!patterns?.length) return false;
  return patterns.some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
};

export const curatedIconFor = (url: string, title = "") => {
  const host = faviconHostFor(url)?.replace(/^www\./, "").toLowerCase();
  const normalizedTitle = title.trim().toLowerCase();
  if (!host && !normalizedTitle) return undefined;
  const rule = curatedIconRules.find((item) => {
    const matchedHost = host ? hostMatches(host, item.hosts) : false;
    const matchedTitle = normalizedTitle && item.title?.some((keyword) => normalizedTitle.includes(keyword.toLowerCase()));
    return matchedHost || matchedTitle;
  });
  return rule?.iconUrl;
};

export function parseImportText(input: string): ImportShortcut[] {
  if (input.length > MAX_IMPORT_TEXT_CHARS) throw new Error("Import text exceeds the safe size limit");
  const text = input.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) && Array.isArray(parsed.shortcuts) && (Array.isArray(parsed.shortcutFolders) || Array.isArray(parsed.shortcutGroups))) {
      return normalizeAppStateRows(parsed as Record<string, unknown>);
    }
    const rows = Array.isArray(parsed) ? parsed : parsed.shortcuts || parsed.items || parsed.icons;
    if (Array.isArray(rows)) return normalizeImportRows(rows);
  } catch {
    // Try CSV or bookmarks HTML below.
  }

  if (/<a\s/i.test(text)) return parseBookmarksHtml(text);
  return parseCsv(text);
}

function normalizeImportRows(rows: unknown[], inheritedFolderName?: string): ImportShortcut[] {
  const result: ImportShortcut[] = [];
  const stack = rows.slice(0, MAX_IMPORTED_SHORTCUTS * 2).reverse().map((raw) => ({ raw, folderName: inheritedFolderName, depth: 0 }));

  while (stack.length && result.length < MAX_IMPORTED_SHORTCUTS) {
    const item = stack.pop();
    if (!item || !item.raw || typeof item.raw !== "object" || Array.isArray(item.raw)) continue;
    const row = item.raw as Record<string, unknown>;
    const children = row.children || row.items || row.icons || row.shortcuts;
    const title = cleanLabel(row.title || row.name || row.label);
    const folderName = cleanLabel(row.folderName || row.folder || row.parentName || item.folderName, 500) || undefined;
    if (Array.isArray(children)) {
      if (item.depth >= MAX_IMPORT_NESTING_DEPTH) continue;
      const nextFolder = title || folderName;
      children.slice(0, MAX_IMPORTED_SHORTCUTS * 2).reverse().forEach((child) => {
        stack.push({ raw: child, folderName: nextFolder, depth: item.depth + 1 });
      });
      continue;
    }
    const url = cleanUrl(String(row.url || row.href || row.link || "").trim());
    if (!title || !url) continue;
    result.push({
      title,
      url,
      iconUrl: cleanIconUrl(row.iconUrl || row.icon),
      groupName: cleanLabel(row.groupName || row.group, 500) || undefined,
      folderName,
      folderIconUrl: cleanIconUrl(row.folderIconUrl || row.folderIcon),
      pinned: typeof row.pinned === "boolean" ? row.pinned : undefined
    });
  }
  return result;
}

function normalizeAppStateRows(parsed: Record<string, unknown>): ImportShortcut[] {
  const groups = new Map<string, string>();
  const folders = new Map<string, string>();
  const folderIcons = new Map<string, string>();
  for (const raw of ((parsed.shortcutGroups as unknown[] | undefined) || []).filter(isImportRecord).slice(0, MAX_IMPORTED_SHORTCUTS)) {
    if (raw.deletedAt) continue;
    const id = String(raw.id || "");
    const name = cleanLabel(raw.name, 500);
    if (id && name) groups.set(id, name);
  }
  for (const raw of ((parsed.shortcutFolders as unknown[] | undefined) || []).filter(isImportRecord).slice(0, MAX_IMPORTED_SHORTCUTS)) {
    if (raw.deletedAt) continue;
    const id = String(raw.id || "");
    const name = cleanLabel(raw.name, 500);
    if (id && name) folders.set(id, name);
    const iconUrl = cleanIconUrl(raw.iconUrl);
    if (id && iconUrl) folderIcons.set(id, iconUrl);
  }
  return ((parsed.shortcuts as unknown[] | undefined) || [])
    .filter(isImportRecord)
    .filter((row) => !row.deletedAt)
    .slice(0, MAX_IMPORTED_SHORTCUTS)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((row) => ({
      title: cleanLabel(row.title),
      url: cleanUrl(String(row.url || "").trim()),
      iconUrl: cleanIconUrl(row.iconUrl),
      groupName: cleanLabel(row.groupName, 500) || groups.get(String(row.groupId || "")),
      folderName: cleanLabel(row.folderName, 500) || folders.get(String(row.folderId || "")),
      folderIconUrl: cleanIconUrl(row.folderIconUrl) || folderIcons.get(String(row.folderId || "")),
      pinned: typeof row.pinned === "boolean" ? row.pinned : undefined
    }))
    .filter((row) => row.title && row.url);
}

export function parseBookmarksHtml(html: string): ImportShortcut[] {
  if (html.length > MAX_IMPORT_TEXT_CHARS) throw new Error("Bookmarks HTML exceeds the safe size limit");
  return tokenizeBookmarkAnchors(html)
    .flatMap((anchor) => {
      const url = cleanUrl(anchor.href);
      if (!url) return [];
      return [{
        title: cleanLabel(anchor.text) || new URL(url).hostname.slice(0, MAX_IMPORTED_LABEL_CHARS),
        url,
        iconUrl: cleanIconUrl(anchor.icon)
      }];
    })
    .filter((row) => row.title);
}

export function parseCsv(csv: string): ImportShortcut[] {
  return csv
    .split(/\r?\n/)
    .slice(0, MAX_IMPORTED_SHORTCUTS)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((part) => part.trim().replace(/^"|"$/g, "")))
    .map((parts) => {
      const [first, second, third, fourth] = parts;
      const urlFirst = isLikelyUrl(first);
      return {
        title: cleanLabel(urlFirst ? second || first : first),
        url: cleanUrl(urlFirst ? first : second || ""),
        iconUrl: cleanIconUrl(third),
        groupName: cleanLabel(fourth, 500) || undefined,
        folderName: cleanLabel(parts[4], 500) || undefined,
        folderIconUrl: cleanIconUrl(parts[5])
      };
    })
    .filter((row) => row.title && row.url);
}

export function importedToShortcuts(
  rows: ImportShortcut[],
  existingGroups: ShortcutGroup[],
  startOrder: number,
  existingFolders: ShortcutFolder[] = []
): { shortcuts: Shortcut[]; groups: ShortcutGroup[]; folders: ShortcutFolder[] } {
  const updatedAt = nowIso();
  const groups = [...existingGroups];
  const folders = [...existingFolders];
  const liveGroups = groups.filter((group) => !group.deletedAt);
  const groupByName = new Map(liveGroups.map((group) => [group.name.toLowerCase(), group]));
  const folderByKey = new Map(
    folders
      .filter((folder) => !folder.deletedAt)
      .map((folder) => [`${folder.groupId || ""}::${folder.name.toLowerCase()}`, folder])
  );

  const ensureGroup = (name?: string) => {
    const label = name?.trim() || "导入快捷导航";
    const key = label.toLowerCase();
    let group = groupByName.get(key);
    if (!group) {
      if (groups.length >= MAX_IMPORTED_SHORTCUTS) return liveGroups[0];
      group = { id: uid(), name: label, color: "#14B8A6", order: groups.length, updatedAt };
      groups.push(group);
      liveGroups.push(group);
      groupByName.set(key, group);
    }
    return group;
  };

  const ensureFolder = (name: string | undefined, groupId: string | undefined) => {
    const label = name?.trim();
    if (!label) return undefined;
    const key = `${groupId || ""}::${label.toLowerCase()}`;
    let folder = folderByKey.get(key);
    if (!folder) {
      if (folders.length >= MAX_IMPORTED_SHORTCUTS) return undefined;
      folder = { id: uid(), name: label, groupId, iconUrl: undefined, iconColor: colorFor(label), order: folders.length, updatedAt };
      folders.push(folder);
      folderByKey.set(key, folder);
    }
    return folder;
  };

  const shortcuts = rows.slice(0, MAX_IMPORTED_SHORTCUTS).flatMap((row, index) => {
    const group = ensureGroup(row.groupName);
    if (!group) return [];
    const folder = ensureFolder(row.folderName, group.id);
    if (folder && row.folderIconUrl && !folder.iconUrl) folder.iconUrl = row.folderIconUrl;
    return [{
      id: uid(),
      title: row.title,
      url: row.url,
      iconUrl: row.iconUrl || faviconFor(row.url),
      iconColor: colorFor(row.title),
      groupId: group.id,
      folderId: folder?.id,
      pinned: Boolean(row.pinned),
      order: startOrder + index,
      updatedAt
    }];
  });

  return { shortcuts, groups, folders };
}

export function colorFor(seed: string) {
  const colors = ["#14B8A6", "#EF4444", "#F59E0B", "#3B82F6", "#8B5CF6", "#EC4899", "#22C55E", "#64748B"];
  const sum = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
}
