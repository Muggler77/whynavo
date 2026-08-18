const explicitScheme = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeHttpUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const candidate = explicitScheme.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function safeHttpHref(value: string) {
  return normalizeHttpUrl(value) || "about:blank";
}

export async function openHttpUrlInNewTab(value: string): Promise<void> {
  const target = normalizeHttpUrl(value);
  if (!target) throw new Error("Invalid HTTP URL");

  if (window.location.protocol === "chrome-extension:") {
    try {
      await chrome.tabs.create({ url: target });
      return;
    } catch {
      // Fall through to the browser-native target=_blank path if the API is unavailable.
    }
  }

  const opened = window.open(target, "_blank", "noopener,noreferrer");
  if (opened) return;

  const link = document.createElement("a");
  link.href = target;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
