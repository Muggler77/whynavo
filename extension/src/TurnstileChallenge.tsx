import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CAPTCHA_FRAME_URL, TURNSTILE_SITE_KEY } from "./projectConfig";

type TurnstileMessage = {
  type?: string;
  instance?: string;
  token?: string;
  message?: string;
};

export type TurnstileChallengeHandle = {
  reset: () => void;
};

type TurnstileChallengeProps = {
  action: "login" | "signup" | "recovery" | "password-change" | "delete-account";
  language: "zh-CN" | "en-US";
  onToken: (token: string) => void;
};

const createInstanceId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint32Array(4);
  globalThis.crypto?.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16)).join("");
};

const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, TurnstileChallengeProps>(
  function TurnstileChallenge({ action, language, onToken }, ref) {
    const text = (zh: string, en: string) => language === "en-US" ? en : zh;
    const frameRef = useRef<HTMLIFrameElement>(null);
    const instance = useMemo(createInstanceId, []);
    const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 380px)").matches);
    const [frameVersion, setFrameVersion] = useState(0);
    const [status, setStatus] = useState<"loading" | "ready" | "verified" | "error">("loading");
    const [message, setMessage] = useState(() => text("正在准备安全验证", "Preparing security verification"));

    const reload = () => {
      onToken("");
      setStatus("loading");
      setMessage(text("正在重新加载安全验证", "Reloading security verification"));
      setFrameVersion((value) => value + 1);
    };

    const reset = () => {
      reload();
    };

    useImperativeHandle(ref, () => ({ reset }));

    useEffect(() => {
      const media = window.matchMedia("(max-width: 380px)");
      const update = () => setCompact(media.matches);
      if (media.addEventListener) {
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
      }
      media.addListener(update);
      return () => media.removeListener(update);
    }, []);

    useEffect(() => {
      const receive = (event: MessageEvent<TurnstileMessage>) => {
        if (
          event.origin !== "null"
          || event.source !== frameRef.current?.contentWindow
          || event.data?.instance !== instance
        ) return;

        if (event.data.type === "whynavo-turnstile-ready") {
          setStatus("ready");
          setMessage(text("请完成安全验证", "Complete the security verification"));
          return;
        }
        if (event.data.type === "whynavo-turnstile-success" && event.data.token) {
          onToken(event.data.token);
          setStatus("verified");
          setMessage(text("安全验证已完成", "Security verification completed"));
          return;
        }
        if (event.data.type === "whynavo-turnstile-expired") {
          onToken("");
          setStatus("ready");
          setMessage(text("验证已过期，请重新完成", "Verification expired. Complete it again."));
          return;
        }
        if (event.data.type === "whynavo-turnstile-error") {
          onToken("");
          setStatus("error");
          setMessage(language === "zh-CN" && event.data.message ? event.data.message : text("安全验证暂时不可用，请刷新后重试", "Security verification is temporarily unavailable. Refresh and try again."));
        }
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    }, [instance, language, onToken]);

    useEffect(() => {
      if (status !== "loading") return undefined;
      const timeout = window.setTimeout(() => {
        onToken("");
        setStatus("error");
        setMessage(text("安全验证加载超时，请重新加载", "Security verification timed out. Reload it."));
      }, 15_000);
      return () => window.clearTimeout(timeout);
    }, [frameVersion, language, onToken, status]);

    const frameUrl = useMemo(() => {
      const params = new URLSearchParams({
        sitekey: TURNSTILE_SITE_KEY,
        instance,
        action,
        size: compact ? "compact" : "flexible",
        language: language === "en-US" ? "en" : "zh-CN",
        parentOrigin: window.location.origin
      });
      return `${CAPTCHA_FRAME_URL}#${params.toString()}`;
    }, [action, compact, instance, language]);

    return (
      <div className={`turnstile-challenge ${status}`} aria-live="polite">
        <iframe
          key={frameVersion}
          ref={frameRef}
          className={compact ? "compact" : ""}
          src={frameUrl}
          title={text("Cloudflare 安全验证", "Cloudflare security verification")}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
        />
        <small>{message}</small>
        {status === "error" && (
          <button type="button" onClick={reload}>{text("重新加载安全验证", "Reload security verification")}</button>
        )}
      </div>
    );
  }
);

export default TurnstileChallenge;
