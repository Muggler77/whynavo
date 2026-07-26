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
  onToken: (token: string) => void;
};

const createInstanceId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint32Array(4);
  globalThis.crypto?.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16)).join("");
};

const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, TurnstileChallengeProps>(
  function TurnstileChallenge({ action, onToken }, ref) {
    const frameRef = useRef<HTMLIFrameElement>(null);
    const instance = useMemo(createInstanceId, []);
    const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 380px)").matches);
    const [frameVersion, setFrameVersion] = useState(0);
    const [status, setStatus] = useState<"loading" | "ready" | "verified" | "error">("loading");
    const [message, setMessage] = useState("正在准备安全验证");

    const reload = () => {
      onToken("");
      setStatus("loading");
      setMessage("正在重新加载安全验证");
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

        if (event.data.type === "whytab-turnstile-ready") {
          setStatus("ready");
          setMessage("请完成安全验证");
          return;
        }
        if (event.data.type === "whytab-turnstile-success" && event.data.token) {
          onToken(event.data.token);
          setStatus("verified");
          setMessage("安全验证已完成");
          return;
        }
        if (event.data.type === "whytab-turnstile-expired") {
          onToken("");
          setStatus("ready");
          setMessage("验证已过期，请重新完成");
          return;
        }
        if (event.data.type === "whytab-turnstile-error") {
          onToken("");
          setStatus("error");
          setMessage(event.data.message || "安全验证暂时不可用，请刷新后重试");
        }
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    }, [instance, onToken]);

    useEffect(() => {
      if (status !== "loading") return undefined;
      const timeout = window.setTimeout(() => {
        onToken("");
        setStatus("error");
        setMessage("安全验证加载超时，请重新加载");
      }, 15_000);
      return () => window.clearTimeout(timeout);
    }, [frameVersion, onToken, status]);

    const frameUrl = useMemo(() => {
      const params = new URLSearchParams({
        sitekey: TURNSTILE_SITE_KEY,
        instance,
        action,
        size: compact ? "compact" : "flexible",
        parentOrigin: window.location.origin
      });
      return `${CAPTCHA_FRAME_URL}#${params.toString()}`;
    }, [action, compact, instance]);

      return (
      <div className={`turnstile-challenge ${status}`} aria-live="polite">
        <iframe
          key={frameVersion}
          ref={frameRef}
          className={compact ? "compact" : ""}
          src={frameUrl}
          title="Cloudflare 安全验证"
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
        />
        <small>{message}</small>
        {status === "error" && (
          <button type="button" onClick={reload}>重新加载安全验证</button>
        )}
      </div>
    );
  }
);

export default TurnstileChallenge;
