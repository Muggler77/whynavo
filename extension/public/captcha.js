(() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const sitekey = params.get("sitekey") || "";
  const instance = params.get("instance") || "";
  const action = params.get("action") || "login";
  const size = params.get("size") === "compact" ? "compact" : "flexible";
  const parentOrigin = params.get("parentOrigin") || "";
  const error = document.getElementById("error");
  let widgetId;

  const allowedParent = parentOrigin === "https://whytab.pages.dev"
    || /^chrome-extension:\/\/[a-p]{32}$/.test(parentOrigin)
    || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(parentOrigin);

  const send = (type, extra = {}) => {
    if (allowedParent) window.parent.postMessage({ type, instance, ...extra }, parentOrigin);
  };

  const showError = (message) => {
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
    send("whytab-turnstile-error", { message });
  };

  window.onWhytabTurnstileLoad = () => {
    if (!allowedParent || !/^[A-Za-z0-9_-]{10,128}$/.test(sitekey) || !instance) {
      showError("安全验证配置无效");
      return;
    }
    if (!window.turnstile) {
      showError("安全验证加载失败");
      return;
    }

    try {
      widgetId = window.turnstile.render("#turnstile-widget", {
        sitekey,
        action,
        size,
        theme: "auto",
        appearance: "always",
        retry: "auto",
        "refresh-expired": "auto",
        callback: (token) => send("whytab-turnstile-success", { token }),
        "expired-callback": () => send("whytab-turnstile-expired"),
        "timeout-callback": () => send("whytab-turnstile-expired"),
        "error-callback": () => {
          showError("安全验证失败，请稍后重试");
          return true;
        }
      });
      send("whytab-turnstile-ready");
    } catch {
      showError("安全验证加载失败");
    }
  };

  window.addEventListener("message", (event) => {
    if (event.origin !== parentOrigin || event.source !== window.parent || event.data?.type !== "whytab-turnstile-reset") return;
    if (event.data?.instance !== instance || widgetId === undefined || !window.turnstile) return;
    if (error) error.hidden = true;
    window.turnstile.reset(widgetId);
    send("whytab-turnstile-ready");
  });
})();
