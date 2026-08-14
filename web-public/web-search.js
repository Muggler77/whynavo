(() => {
  const query = new URLSearchParams(window.location.search).get("q")?.trim() || "";
  if (!query) {
    window.location.replace("./");
    return;
  }

  const isChinese = String(navigator.language || "").toLowerCase().startsWith("zh");
  const target = new URL(isChinese ? "https://www.baidu.com/s" : "https://www.google.com/search");
  target.searchParams.set(isChinese ? "wd" : "q", query);
  window.location.replace(target);
})();
