(() => {
  const SUPABASE_ORIGIN = "https://keafulupzvfljvbzwgrq.supabase.co";
  const PUBLIC_APP_ORIGIN = "https://whynavo.pages.dev";
  const MAX_CONFIRMATION_URL_LENGTH = 4096;
  const VALID_ACTIONS = new Set([
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email",
    "email_change",
    "email_change_current",
    "email_change_new",
    "reauthentication"
  ]);
  const status = document.getElementById("confirmation-status");
  const continueButton = document.getElementById("confirmation-continue");

  const fail = () => {
    status.dataset.state = "error";
    status.textContent = "验证请求无效或已损坏，请返回 WhyNavo 后重新发起。";
    continueButton.disabled = true;
  };

  const readVerificationUrl = () => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const encoded = fragment.get("confirmation_url");
    if (encoded && encoded.length > MAX_CONFIRMATION_URL_LENGTH) return null;

    let candidate;
    if (encoded) {
      if ([...fragment.keys()].some((key) => key !== "confirmation_url")) return null;
      try {
        candidate = new URL(encoded);
      } catch {
        return null;
      }
    } else {
      const allowedFragmentParameters = new Set(["token", "type", "redirect_to"]);
      if ([...fragment.keys()].some((key) => !allowedFragmentParameters.has(key))) return null;
      if ([...allowedFragmentParameters].some((key) => fragment.getAll(key).length !== 1)) return null;
      candidate = new URL("/auth/v1/verify", SUPABASE_ORIGIN);
      candidate.searchParams.set("token", fragment.get("token") || "");
      candidate.searchParams.set("type", fragment.get("type") || "");
      candidate.searchParams.set("redirect_to", fragment.get("redirect_to") || "");
    }
    if (
      candidate.origin !== SUPABASE_ORIGIN
      || candidate.pathname !== "/auth/v1/verify"
      || candidate.username
      || candidate.password
      || candidate.hash
    ) return null;

    const allowedParameters = new Set(["token", "type", "redirect_to"]);
    if ([...candidate.searchParams.keys()].some((key) => !allowedParameters.has(key))) return null;
    if ([...allowedParameters].some((key) => candidate.searchParams.getAll(key).length !== 1)) return null;

    const tokenHash = candidate.searchParams.get("token") || "";
    const action = candidate.searchParams.get("type") || "";
    const redirectValue = candidate.searchParams.get("redirect_to") || "";
    let redirect;
    try {
      redirect = new URL(redirectValue);
    } catch {
      return null;
    }
    if (
      !/^[A-Za-z0-9_-]{20,512}$/.test(tokenHash)
      || !VALID_ACTIONS.has(action)
      || redirect.origin !== PUBLIC_APP_ORIGIN
      || redirect.protocol !== "https:"
      || redirect.username
      || redirect.password
    ) return null;

    return candidate.toString();
  };

  const verificationUrl = readVerificationUrl();
  if (!verificationUrl) {
    fail();
    return;
  }

  status.textContent = "验证请求已通过本地安全检查，请确认继续。";
  continueButton.disabled = false;
  continueButton.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    continueButton.disabled = true;
    status.textContent = "正在前往安全验证…";
    window.location.replace(verificationUrl);
  }, { once: true });
})();
