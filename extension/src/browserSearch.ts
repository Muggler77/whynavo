import { openHttpUrlInNewTab } from "./urls";

export type WebSearchProvider = "browser" | "baidu";

const isExtensionPage = () => window.location.protocol === "chrome-extension:";

export async function searchWithBrowserDefault(rawQuery: string): Promise<void> {
  const query = rawQuery.trim();
  if (!query) return;

  if (isExtensionPage()) {
    if (!globalThis.chrome?.search?.query) {
      throw new Error("Chrome Search API is unavailable");
    }
    await chrome.search.query({
      text: query,
      disposition: "NEW_TAB"
    });
    return;
  }

  const hostedSearch = new URL("./web-search.html", window.location.href);
  hostedSearch.searchParams.set("q", query);
  await openHttpUrlInNewTab(hostedSearch.toString());
}

export async function searchWeb(rawQuery: string, provider: WebSearchProvider = "browser"): Promise<void> {
  const query = rawQuery.trim();
  if (!query) return;

  if (provider === "baidu") {
    const target = new URL("https://www.baidu.com/s");
    target.searchParams.set("wd", query);
    await openHttpUrlInNewTab(target.toString());
    return;
  }

  await searchWithBrowserDefault(query);
}
