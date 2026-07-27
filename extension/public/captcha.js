(() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const sitekey = params.get("sitekey") || "";
  const instance = params.get("instance") || "";
  const action = params.get("action") || "login";
  const size = params.get("size") === "compact" ? "compact" : "flexible";
  const parentOrigin = params.get("parentOrigin") || "";
  const error = document.getElementById("error");

  const allowedParent = parentOrigin === "https://whynavo.pages.dev"
    || /^chrome-extension:\/\/[a-p]{32}$/.test(parentOrigin);

  const send = (type, extra = {}) => {
    if (allowedParent) window.parent.postMessage({ type, instance, ...extra }, parentOrigin);
  };

  const showError = (message) => {
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
    send("whynavo-turnstile-error", { message });
  };

  window.onWhyNavoTurnstileLoad = () => {
    if (!allowedParent || !/^[A-Za-z0-9_-]{10,128}$/.test(sitekey) || !instance) {
      showError("安全验证配置无效");
      return;
    }
    if (!window.turnstile) {
      showError("安全验证加载失败");
      return;
    }

    try {
      window.turnstile.render("#turnstile-widget", {
        sitekey,
        action,
        size,
        theme: "auto",
        appearance: "always",
        retry: "auto",
        "refresh-expired": "auto",
        callback: (token) => send("whynavo-turnstile-success", { token }),
        "expired-callback": () => send("whynavo-turnstile-expired"),
        "timeout-callback": () => send("whynavo-turnstile-expired"),
        "error-callback": () => {
          showError("安全验证失败，请稍后重试");
          return true;
        }
      });
      send("whynavo-turnstile-ready");
    } catch {
      showError("安全验证加载失败");
    }
  };
})();
