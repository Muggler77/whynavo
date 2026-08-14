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
      disposition: "CURRENT_TAB"
    });
    return;
  }

  const hostedSearch = new URL("./web-search.html", window.location.href);
  hostedSearch.searchParams.set("q", query);
  const opened = window.open(hostedSearch.toString(), "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(hostedSearch);
}
