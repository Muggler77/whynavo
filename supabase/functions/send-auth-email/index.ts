import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type AuthEmailAction =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email"
  | "email_change"
  | "email_change_current"
  | "email_change_new"
  | "reauthentication"
  | "password_changed_notification"
  | "email_changed_notification"
  | "phone_changed_notification"
  | "identity_linked_notification"
  | "identity_unlinked_notification"
  | "mfa_factor_enrolled_notification"
  | "mfa_factor_unenrolled_notification";

type AuthEmailPayload = {
  user: {
    email?: string;
    new_email?: string;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: AuthEmailAction;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
    old_email?: string;
    provider?: string;
    factor_type?: string;
  };
};

const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "").replace(/^v1,whsec_/, "");
const fromAddress = Deno.env.get("AUTH_EMAIL_FROM") || "";
const defaultPublicAppUrl = "https://whynavo.com/";
const configuredPublicAppUrl = Deno.env.get("AUTH_EMAIL_PUBLIC_APP_URL") || defaultPublicAppUrl;
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const normalizedPublicAppUrl = (() => {
  try {
    const url = new URL(configuredPublicAppUrl);
    if (url.protocol !== "https:" || url.username || url.password || configuredPublicAppUrl.length > 2048) {
      return defaultPublicAppUrl;
    }
    return `${url.origin}/`;
  } catch {
    return defaultPublicAppUrl;
  }
})();
const publicLogoUrl = new URL("icons/icon128.png", normalizedPublicAppUrl).toString();
const MAX_HOOK_BODY_BYTES = 64 * 1024;
const MAX_PROVIDER_ERROR_BYTES = 8 * 1024;
const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8"
};

const hookError = (message: string, status = 500) => Response.json({
  error: {
    http_code: status,
    message
  }
}, { status, headers: responseHeaders });

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const validRecipient = (value: unknown): value is string => (
  typeof value === "string"
  && value.length > 3
  && value.length <= 320
  && !/[\r\n]/.test(value)
  && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
);

async function sendEmail(
  recipient: string,
  subject: string,
  html: string,
  text: string,
  idempotencyKey: string
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [recipient],
      subject,
      html,
      text
    }),
    signal: AbortSignal.timeout(3_500)
  });
  if (response.ok) return;
  const detail = (await response.text()).slice(0, MAX_PROVIDER_ERROR_BYTES);
  throw new Error(`email provider returned ${response.status}${detail ? `: ${detail}` : ""}`);
}

async function deliveryIdempotencyKey(eventId: string, recipient: string, deliveryIndex: number) {
  const input = new TextEncoder().encode(`${eventId}\0${recipient.toLowerCase()}\0${deliveryIndex}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `whynavo-auth/${hex}`;
}

const subjects: Record<AuthEmailAction, string> = {
  signup: "确认你的 WhyNavo 同步账号",
  invite: "你被邀请使用 WhyNavo",
  magiclink: "登录你的 WhyNavo 账号",
  recovery: "重置你的 WhyNavo 密码",
  email: "确认你的 WhyNavo 操作",
  email_change: "确认你的 WhyNavo 邮箱变更",
  email_change_current: "确认你的 WhyNavo 原邮箱",
  email_change_new: "确认你的 WhyNavo 新邮箱",
  reauthentication: "确认你的 WhyNavo 操作",
  password_changed_notification: "你的 WhyNavo 密码已修改",
  email_changed_notification: "你的 WhyNavo 邮箱已修改",
  phone_changed_notification: "你的 WhyNavo 账号信息已修改",
  identity_linked_notification: "WhyNavo 已添加新的登录方式",
  identity_unlinked_notification: "WhyNavo 已移除登录方式",
  mfa_factor_enrolled_notification: "WhyNavo 已添加新的验证方式",
  mfa_factor_unenrolled_notification: "WhyNavo 已移除验证方式"
};

const englishSubjects: Record<AuthEmailAction, string> = {
  signup: "Confirm your WhyNavo sync account",
  invite: "You are invited to WhyNavo",
  magiclink: "Sign in to your WhyNavo account",
  recovery: "Reset your WhyNavo password",
  email: "Confirm your WhyNavo action",
  email_change: "Confirm your WhyNavo email change",
  email_change_current: "Confirm your current WhyNavo email",
  email_change_new: "Confirm your new WhyNavo email",
  reauthentication: "Confirm your WhyNavo action",
  password_changed_notification: "Your WhyNavo password was changed",
  email_changed_notification: "Your WhyNavo email was changed",
  phone_changed_notification: "Your WhyNavo account information was changed",
  identity_linked_notification: "A sign-in method was added to WhyNavo",
  identity_unlinked_notification: "A sign-in method was removed from WhyNavo",
  mfa_factor_enrolled_notification: "A verification method was added to WhyNavo",
  mfa_factor_unenrolled_notification: "A verification method was removed from WhyNavo"
};

const notificationContent: Partial<Record<AuthEmailAction, { intro: string; nextStep: string }>> = {
  password_changed_notification: {
    intro: "你的 WhyNavo 账号密码刚刚被修改。",
    nextStep: "如果这不是你本人操作，请立即使用密码重置功能重新保护账号。"
  },
  email_changed_notification: {
    intro: "你的 WhyNavo 账号邮箱刚刚被修改。",
    nextStep: "如果这不是你本人操作，请立即联系项目维护者并保护原邮箱账号。"
  },
  phone_changed_notification: {
    intro: "你的 WhyNavo 账号信息刚刚被修改。",
    nextStep: "如果这不是你本人操作，请立即检查账号安全。"
  },
  identity_linked_notification: {
    intro: "你的 WhyNavo 账号刚刚添加了新的登录方式。",
    nextStep: "如果这不是你本人操作，请立即检查并移除未知登录方式。"
  },
  identity_unlinked_notification: {
    intro: "你的 WhyNavo 账号刚刚移除了一个登录方式。",
    nextStep: "如果这不是你本人操作，请立即检查账号安全。"
  },
  mfa_factor_enrolled_notification: {
    intro: "你的 WhyNavo 账号刚刚添加了新的多因素验证方式。",
    nextStep: "如果这不是你本人操作，请立即检查账号安全。"
  },
  mfa_factor_unenrolled_notification: {
    intro: "你的 WhyNavo 账号刚刚移除了一个多因素验证方式。",
    nextStep: "如果这不是你本人操作，请立即检查账号安全。"
  }
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[character] || character));

function safeRedirectUrl(value?: string) {
  try {
    const candidate = new URL(value || normalizedPublicAppUrl);
    const expected = new URL(normalizedPublicAppUrl);
    return candidate.protocol === "https:" && candidate.origin === expected.origin
      ? candidate.toString()
      : normalizedPublicAppUrl;
  } catch {
    return normalizedPublicAppUrl;
  }
}

function buildVerificationUrl(emailData: AuthEmailPayload["email_data"], tokenHash?: string) {
  if (!supabaseUrl || !tokenHash) return "";

  const url = new URL("/auth/v1/verify", supabaseUrl);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", emailData.email_action_type);
  url.searchParams.set("redirect_to", safeRedirectUrl(emailData.redirect_to));
  return url.toString();
}

function buildConfirmationPageUrl(verificationUrl: string) {
  if (!verificationUrl) return "";
  const url = new URL("confirm.html", normalizedPublicAppUrl);
  url.hash = `confirmation_url=${encodeURIComponent(verificationUrl)}`;
  return url.toString();
}

function renderEmail(action: AuthEmailAction, verificationUrl: string, token?: string) {
  const isSignup = action === "signup";
  const title = subjects[action] || "确认你的 WhyNavo 账号";
  const englishTitle = englishSubjects[action] || "Confirm your WhyNavo account";
  const notification = notificationContent[action];
  const intro = notification?.intro || (isSignup
    ? "你刚刚使用此邮箱注册了 WhyNavo 同步账号。WhyNavo 会优先把你的快捷方式、小组件、笔记、待办和设置保存在当前浏览器本地。"
    : "你刚刚请求了 WhyNavo 账号相关操作。");
  const nextStep = notification?.nextStep || (isSignup ? "完成邮箱验证后，你可以在其他设备登录同一个账号，用于同步自己的 WhyNavo 数据。" : "请确认这是你本人发起的操作，然后继续。");
  const buttonText = isSignup ? "确认邮箱并启用同步 / Confirm email" : "确认并继续 / Confirm and continue";
  const englishIntro = notification
    ? "A security-related change was just made or requested for your WhyNavo account."
    : isSignup
      ? "This message was sent because this email address was used to create a WhyNavo synchronization account."
      : "This message was sent because a WhyNavo account action was requested for this email address.";
  const englishNextStep = notification
    ? "If this was not you, protect your email account and use WhyNavo password recovery immediately."
    : isSignup
      ? "Confirm the address to sign in on other devices and synchronize your own WhyNavo data."
      : "Continue only if you initiated this request.";

  const confirmationPageUrl = buildConfirmationPageUrl(verificationUrl);
  const escapedConfirmationPageUrl = escapeHtml(confirmationPageUrl);
  const escapedToken = escapeHtml(token || "");
  const fallback = confirmationPageUrl
    ? `<p style="margin:0 0 14px;color:#64748b;font-size:13px;">如果按钮无法打开，请复制以下链接到浏览器地址栏：</p>
       <p style="margin:0 0 18px;word-break:break-all;color:#475569;font-size:12px;">${escapedConfirmationPageUrl}</p>`
    : escapedToken
      ? `<p style="margin:0 0 18px;color:#475569;font-size:14px;">验证码：<strong>${escapedToken}</strong></p>`
      : "";

  const actionBlock = confirmationPageUrl
    ? `<p style="margin:0 0 24px;text-align:center;">
         <a href="${escapedConfirmationPageUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:700;">${buttonText}</a>
       </p>`
    : escapedToken
      ? `<p style="margin:0 0 24px;color:#475569;font-size:14px;">请在 WhyNavo 页面中输入上面的验证码。</p>`
      : "";

  return {
    subject: title,
    html: `<div style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#102033;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0;padding:32px 16px;background:#f6f8fb;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e6ebf2;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:30px 32px 18px;text-align:center;">
              <img src="${publicLogoUrl}" width="64" height="64" alt="WhyNavo" style="display:block;margin:0 auto 16px;border-radius:16px;">
              <div style="font-size:22px;font-weight:700;letter-spacing:0;color:#0f172a;">${title}</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.7;color:#64748b;">请完成验证，以保护你的账号安全。</div>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 32px 30px;font-size:15px;line-height:1.8;color:#243449;">
              <p style="margin:0 0 14px;">你好，</p>
              <p style="margin:0 0 14px;">${intro}</p>
              <p style="margin:0 0 22px;">${nextStep}</p>
              ${actionBlock}
              ${fallback}
              <p style="margin:0;color:#64748b;font-size:13px;">如果你没有发起这项操作，可以忽略这封邮件。</p>
              <div lang="en" style="margin-top:22px;padding-top:20px;border-top:1px solid #edf2f7;color:#475569;">
                <p style="margin:0 0 10px;font-weight:700;color:#243449;">${englishTitle}</p>
                <p style="margin:0 0 10px;">${englishIntro}</p>
                <p style="margin:0;">${englishNextStep} If you did not request this action, you can ignore this email.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #edf2f7;color:#64748b;font-size:12px;line-height:1.7;text-align:center;">
              WhyNavo · local-first new tab dashboard<br>
              <a href="${normalizedPublicAppUrl}" style="color:#0f766e;text-decoration:none;">${normalizedPublicAppUrl}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`,
    text: `${title}

${intro}

${nextStep}

${confirmationPageUrl || (token ? `验证码：${token}` : "")}

如果你没有发起这项操作，可以忽略这封邮件。

${englishTitle}

${englishIntro}

${englishNextStep} If you did not request this action, you can ignore this email.

WhyNavo
${normalizedPublicAppUrl}`
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return hookError("method not allowed", 405);
  if (
    !resendApiKey
    || !hookSecret
    || !/^.+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/.test(fromAddress)
    || fromAddress.includes("@example.com")
  ) return hookError("email provider is not configured");

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_HOOK_BODY_BYTES) {
    return hookError("request is too large", 413);
  }
  const body = await req.text();
  if (new TextEncoder().encode(body).byteLength > MAX_HOOK_BODY_BYTES) {
    return hookError("request is too large", 413);
  }
  const headers = Object.fromEntries(req.headers);
  const signedEventId = req.headers.get("webhook-id")
    || `${req.headers.get("webhook-timestamp") || ""}:${body}`;

  let verifiedPayload: unknown;
  try {
    verifiedPayload = new Webhook(hookSecret).verify(body, headers);
  } catch {
    return hookError("invalid hook signature", 401);
  }

  if (
    !isRecord(verifiedPayload)
    || !isRecord(verifiedPayload.user)
    || !isRecord(verifiedPayload.email_data)
    || typeof verifiedPayload.email_data.email_action_type !== "string"
  ) {
    return hookError("invalid hook payload", 400);
  }
  const payload = verifiedPayload as unknown as AuthEmailPayload;
  const action = payload.email_data.email_action_type;
  if (!Object.prototype.hasOwnProperty.call(subjects, action)) {
    return hookError("unsupported email action", 400);
  }
  const secureEmailChange = action === "email_change"
    && Boolean(payload.user.email && payload.user.new_email && payload.email_data.token_hash_new && payload.email_data.token_hash);
  const emailChangeRecipient = payload.user.new_email || payload.user.email;
  const splitEmailChangeRecipient = action === "email_change_new"
    ? payload.user.new_email || payload.user.email
    : payload.user.email;
  const deliveries = secureEmailChange
    ? [
        { to: payload.user.email, tokenHash: payload.email_data.token_hash_new, token: payload.email_data.token },
        { to: payload.user.new_email, tokenHash: payload.email_data.token_hash, token: payload.email_data.token_new }
      ]
    : [{
        to: action === "email_changed_notification"
          ? payload.email_data.old_email || payload.user.email
          : action === "email_change"
            ? emailChangeRecipient
            : splitEmailChangeRecipient,
        tokenHash: payload.email_data.token_hash,
        token: payload.email_data.token_new || payload.email_data.token
      }];

  if (deliveries.some((delivery) => !validRecipient(delivery.to))) {
    return hookError("invalid recipient", 400);
  }
  if (
    !notificationContent[action]
    && deliveries.some((delivery) => !delivery.tokenHash && !delivery.token)
  ) {
    return hookError("verification token is missing", 400);
  }

  try {
    await Promise.all(deliveries.map(async (delivery, deliveryIndex) => {
      const verificationUrl = notificationContent[action] ? "" : buildVerificationUrl(payload.email_data, delivery.tokenHash);
      const message = renderEmail(action, verificationUrl, delivery.token);
      await sendEmail(
        delivery.to,
        message.subject,
        message.html,
        message.text,
        await deliveryIdempotencyKey(signedEventId, delivery.to, deliveryIndex)
      );
    }));
  } catch {
    return hookError("email provider failed or timed out", 502);
  }

  return Response.json({}, { headers: responseHeaders });
});
