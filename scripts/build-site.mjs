import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT, SITE } from "../site/content.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repoRoot, "site", "source");
const outputRoot = path.join(repoRoot, "site", "dist");
const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const releaseVersion = packageJson.version || SITE.version;
const chromeStoreUrl = process.env.CHROME_STORE_URL || "";
const chromeApproved = process.env.CHROME_STORE_APPROVED === "true" && Boolean(chromeStoreUrl);
const assetVersion = async (file) => createHash("sha256").update(await readFile(file)).digest("hex").slice(0, 12);
const stylesVersion = await assetVersion(path.join(sourceRoot, "styles.css"));
const scriptVersion = await assetVersion(path.join(sourceRoot, "site.js"));
const inlineScriptHashes = new Set();

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const pagePath = (locale, page = "home") => page === "home" ? `/${locale}/` : `/${locale}/${page}/`;
const pageUrl = (locale, page = "home") => `${SITE.domain}${pagePath(locale, page)}`;
const asset = (file) => `/assets/${file}`;
const externalAttrs = `target="_blank" rel="noreferrer"`;

const icon = (name, alt) => `<img src="${asset(`icons/${name}.svg`)}" alt="${escapeHtml(alt)}" width="72" height="72" loading="lazy" />`;

const installLink = (copy, approved = chromeApproved) => {
  const label = approved ? copy.home.secondaryApproved : copy.home.secondaryPending;
  const href = approved ? chromeStoreUrl : SITE.releaseUrl;
  const attrs = approved ? externalAttrs : externalAttrs;
  return `<a class="button button-quiet" data-download-link data-approved-label="${escapeHtml(copy.home.secondaryApproved)}" href="${href}" ${attrs}>${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
};

const header = (locale, copy, page) => {
  const nav = copy.nav;
  const link = (key, label) => `<a class="nav-link" href="${pagePath(locale, key)}"${page === key ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
  return `<header class="site-header">
  <a class="brand" href="${pagePath(locale)}" aria-label="WhyNavo home">
    <img src="${asset("logo.svg")}" alt="" width="30" height="30" />
    <span>WhyNavo</span>
  </a>
  <nav class="site-nav" id="site-navigation" aria-label="Primary navigation">
    ${link("features", nav.features)}
    ${link("privacy", nav.privacy)}
    ${link("download", nav.download)}
    ${link("updates", nav.updates)}
    ${link("help", nav.help)}
    <a class="nav-link" href="${copy.altHref}">${escapeHtml(copy.altLang)}</a>
  </nav>
  <a class="header-cta" href="${SITE.appUrl}" ${externalAttrs}>${escapeHtml(nav.openApp)} <span aria-hidden="true">↗</span></a>
  <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-navigation" data-open-label="${escapeHtml(nav.menu)}" data-close-label="${escapeHtml(nav.closeMenu)}">${escapeHtml(nav.menu)}</button>
</header>`;
};

const footer = (locale, copy) => `<footer class="site-footer">
  <div class="site-footer-inner">
    <div>
      <a class="footer-brand" href="${pagePath(locale)}"><img src="${asset("logo.svg")}" alt="" width="26" height="26" /> <span>WhyNavo</span></a>
      <p class="footer-meta">${escapeHtml(copy.lang === "en" ? `Local-first new tab workspace · v${releaseVersion}` : `本地优先的新标签页工作台 · v${releaseVersion}`)}</p>
    </div>
    <nav class="footer-links" aria-label="Footer navigation">
      <a href="${pagePath(locale, "features")}">${escapeHtml(copy.nav.features)}</a>
      <a href="${pagePath(locale, "privacy")}">${escapeHtml(copy.nav.privacy)}</a>
      <a href="${pagePath(locale, "download")}">${escapeHtml(copy.nav.download)}</a>
      <a href="${pagePath(locale, "updates")}">${escapeHtml(copy.nav.updates)}</a>
      <a href="${pagePath(locale, "help")}">${escapeHtml(copy.nav.help)}</a>
      <a href="${SITE.githubUrl}" ${externalAttrs}>GitHub</a>
      <a href="${SITE.githubUrl}/blob/main/THIRD_PARTY_NOTICES.md" ${externalAttrs}>${escapeHtml(copy.lang === "en" ? "Third-party notices" : "第三方声明")}</a>
      <a href="${SITE.appUrl}privacy.html" ${externalAttrs}>${escapeHtml(copy.lang === "en" ? "Full privacy notice" : "完整隐私说明")}</a>
      <a href="${SITE.appUrl}terms.html" ${externalAttrs}>${escapeHtml(copy.lang === "en" ? "Terms" : "服务条款")}</a>
    </nav>
  </div>
</footer>`;

const schema = (locale, page, copy) => {
  const pageName = page === "home" ? "WhyNavo" : copy[page]?.title || "WhyNavo";
  const pageDescription = copy[page]?.description || copy.home.description;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": SITE.name,
        "url": SITE.domain,
        "inLanguage": copy.lang
      },
      {
        "@type": "SoftwareApplication",
        "name": SITE.name,
        "applicationCategory": "ProductivityApplication",
        "operatingSystem": "Chrome, Edge, Safari, iOS, iPadOS, Android",
        "description": copy.home.description,
        "url": SITE.appUrl,
        "isAccessibleForFree": true
      }
    ]
  };
  if (page === "home") {
    schemaFaq(copy.home.faq, data["@graph"]);
  }
  const json = JSON.stringify({...data, name: pageName, description: pageDescription});
  inlineScriptHashes.add(`'sha256-${createHash("sha256").update(json).digest("base64")}'`);
  return `<script type="application/ld+json">${json}</script>`;
};

const schemaFaq = (questions, graph) => {
  graph.push({
    "@type": "FAQPage",
    mainEntity: questions.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer }
    }))
  });
};

const shell = ({locale, page, copy, title, description, body, bodyClass = ""}) => {
  const canonical = pageUrl(locale, page);
  const socialImage = locale === "en" ? "product-sample-a.png" : "product-home.png";
  const chromeAttrs = `data-chrome-approved="${chromeApproved}" data-chrome-store-url="${escapeHtml(chromeStoreUrl)}"`;
  return `<!doctype html>
<html lang="${copy.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0c1213" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="en" href="${pageUrl("en", page)}" />
    <link rel="alternate" hreflang="zh-CN" href="${pageUrl("zh-cn", page)}" />
    <link rel="alternate" hreflang="x-default" href="${pageUrl("en", page)}" />
    <link rel="icon" href="${asset("logo.svg")}" type="image/svg+xml" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="/styles.css?v=${stylesVersion}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="WhyNavo" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE.domain}${asset(`images/${socialImage}`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${SITE.domain}${asset(`images/${socialImage}`)}" />
    <title>${escapeHtml(title)}</title>
    ${schema(locale, page, copy)}
  </head>
  <body class="${bodyClass}" ${chromeAttrs}>
    <a class="skip-link" href="#main-content">${escapeHtml(copy.lang === "en" ? "Skip to content" : "跳转到主要内容")}</a>
    ${header(locale, copy, page)}
    <main id="main-content">${body}</main>
    ${footer(locale, copy)}
    <script src="/site.js?v=${scriptVersion}" defer></script>
  </body>
</html>`;
};

const renderHero = (copy) => {
  const titleMarkup = copy.lang === "en"
    ? "Own your <em>new tab.</em>"
    : "把新标签页，<em>变成你的空间。</em>";
  const productImage = copy.lang === "en" ? "product-sample-a.png" : "product-home.png";
  const productDimensions = copy.lang === "en" ? [1536, 1024] : [1280, 800];
  return `<section class="hero" aria-labelledby="hero-title">
    <div class="hero-inner">
      <div class="hero-copy reveal">
        <p class="eyebrow">${escapeHtml(copy.home.eyebrow)}</p>
        <h1 id="hero-title">${titleMarkup}</h1>
        <p class="hero-lede">${escapeHtml(copy.home.heroText)}</p>
        <p class="hero-detail">${escapeHtml(copy.home.heroDetail)}</p>
        <div class="hero-actions">
          <a class="button button-primary" href="${SITE.appUrl}" ${externalAttrs}>${escapeHtml(copy.home.primary)} <span aria-hidden="true">↗</span></a>
          ${installLink(copy)}
        </div>
        <p class="hero-note">${escapeHtml(copy.home.heroNote)}</p>
      </div>
      <figure class="hero-product reveal" aria-label="${escapeHtml(copy.lang === "en" ? "WhyNavo product preview" : "WhyNavo 产品预览")}">
        <img src="${asset(`images/${productImage}`)}" alt="${escapeHtml(copy.lang === "en" ? "WhyNavo workspace with shortcuts, weather, focus and calendar widgets" : "WhyNavo 工作台，展示快捷入口、天气、专注和日历小组件")}" width="${productDimensions[0]}" height="${productDimensions[1]}" fetchpriority="high" />
      </figure>
      <nav class="hero-index" aria-label="${escapeHtml(copy.lang === "en" ? "Homepage sections" : "首页章节")}">
        <a href="#canvas">${escapeHtml(copy.home.index[0])}</a>
        <a href="#privacy">${escapeHtml(copy.home.index[1])}</a>
        <a href="#platforms">${escapeHtml(copy.home.index[2])}</a>
      </nav>
    </div>
  </section>`;
};

const renderTrust = (copy) => `<div class="trust-strip" aria-label="${escapeHtml(copy.lang === "en" ? "WhyNavo principles" : "WhyNavo 原则")}">
  ${copy.home.trust.map((item) => `<div class="trust-item">${escapeHtml(item)}</div>`).join("")}
</div>`;

const renderCanvas = (copy) => `<section class="section section-light" id="canvas" aria-labelledby="canvas-title">
  <div class="section-inner chapter-grid reveal">
    <div class="chapter-copy">
      <p class="chapter-kicker">${escapeHtml(copy.home.canvas.kicker)}</p>
      <h2 id="canvas-title">${escapeHtml(copy.home.canvas.title)}</h2>
      <p>${escapeHtml(copy.home.canvas.text)}</p>
      <ul class="chapter-list">${copy.home.canvas.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
    <div class="chapter-visual">
      <div class="icon-stage" aria-label="${escapeHtml(copy.lang === "en" ? "WhyNavo shortcut icon canvas" : "WhyNavo 快捷图标画布")}">
        <span class="icon-label">${escapeHtml(copy.lang === "en" ? "Your sites" : "我的网站")}</span>
        <div class="icon-field">
          ${icon("google", "Google")}
          ${icon("youtube", "YouTube")}
          ${icon("notion", "Notion")}
          ${icon("figma", "Figma")}
          ${icon("slack", "Slack")}
          ${icon("github", "GitHub")}
          ${icon("salesforce", "Salesforce")}
          ${icon("x", "X")}
          ${icon("baidu", "Baidu")}
          ${icon("google", "Google")}
          ${icon("notion", "Notion")}
          ${icon("github", "GitHub")}
        </div>
      </div>
    </div>
  </div>
</section>`;

const renderWidgets = (copy) => `<section class="section section-quiet" id="widgets" aria-labelledby="widgets-title">
  <div class="section-inner chapter-grid reverse reveal">
    <div class="chapter-copy">
      <p class="chapter-kicker">${escapeHtml(copy.home.widgets.kicker)}</p>
      <h2 id="widgets-title">${escapeHtml(copy.home.widgets.title)}</h2>
      <p>${escapeHtml(copy.home.widgets.text)}</p>
      <a class="text-link" href="${pagePath(copy.lang === "en" ? "en" : "zh-cn", "features")}">${escapeHtml(copy.home.widgets.link)}</a>
    </div>
    <div class="chapter-visual">
      <div class="widget-theater" aria-label="${escapeHtml(copy.lang === "en" ? "WhyNavo widget gallery" : "WhyNavo 小组件展示")}">
        <article class="widget widget-weather">
          <h3>${escapeHtml(copy.lang === "en" ? "Weather" : "天气")}</h3>
          <p>${escapeHtml(copy.lang === "en" ? "Shanghai · Partly cloudy" : "上海 · 多云")}</p>
          <div class="temperature">26°</div>
          <div class="forecast"><span>Mon<br /><strong>27°</strong></span><span>Tue<br /><strong>28°</strong></span><span>Wed<br /><strong>26°</strong></span><span>Thu<br /><strong>27°</strong></span></div>
        </article>
        <article class="widget widget-focus">
          <h3>${escapeHtml(copy.lang === "en" ? "Focus" : "专注")}</h3>
          <div class="focus-ring">25:00</div>
          <p>${escapeHtml(copy.lang === "en" ? "One clear thing at a time." : "一次，只专注一件事。")}</p>
        </article>
        <article class="widget widget-calendar">
          <h3>${escapeHtml(copy.lang === "en" ? "Calendar" : "日历")}</h3>
          <div class="calendar-grid">${["M", "T", "W", "T", "F", "S", "S", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31"].map((item) => `<span>${item}</span>`).join("")}</div>
        </article>
        <article class="widget widget-note">
          <h3>${escapeHtml(copy.lang === "en" ? "Notes" : "笔记")}</h3>
          <p>${escapeHtml(copy.lang === "en" ? "Keep the useful thought close." : "把有用的想法留在手边。")}</p>
          <div class="rule" aria-hidden="true"></div>
        </article>
      </div>
    </div>
  </div>
</section>`;

const renderPrivacy = (copy) => `<section class="section section-light section-privacy" id="privacy" aria-labelledby="privacy-title">
  <div class="section-inner">
    <div class="privacy-intro reveal">
      <div>
        <p class="chapter-kicker">${escapeHtml(copy.home.privacy.kicker)}</p>
        <h2 class="section-heading" id="privacy-title">${escapeHtml(copy.home.privacy.title)}</h2>
      </div>
      <p>${escapeHtml(copy.home.privacy.text)}</p>
    </div>
    <div class="data-flow reveal">
      ${copy.home.privacy.columns.map(([number, title, text]) => `<article class="data-flow-item"><span class="number">${escapeHtml(number)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join("")}
    </div>
    <p class="privacy-note">${escapeHtml(copy.home.privacy.note)} <a class="text-link" href="${pagePath(copy.lang === "en" ? "en" : "zh-cn", "privacy")}">${escapeHtml(copy.lang === "en" ? "Read the full guide" : "阅读完整说明")}</a></p>
  </div>
</section>`;

const renderPlatforms = (copy) => `<section class="section section-dark platform-section" id="platforms" aria-labelledby="platforms-title">
  <div class="section-inner">
    <div class="chapter-copy reveal">
      <p class="chapter-kicker">${escapeHtml(copy.home.platforms.kicker)}</p>
      <h2 id="platforms-title">${escapeHtml(copy.home.platforms.title)}</h2>
      <p>${escapeHtml(copy.home.platforms.text)}</p>
    </div>
    <div class="platform-grid reveal">
      ${copy.home.platforms.items.map(([label, title, text]) => `<article class="platform-item"><span class="platform-label">${escapeHtml(label)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join("")}
    </div>
    <a class="text-link" href="${pagePath(copy.lang === "en" ? "en" : "zh-cn", "download")}">${escapeHtml(copy.home.platforms.link)}</a>
  </div>
</section>`;

const renderCta = (copy) => `<section class="cta-band" aria-labelledby="cta-title">
  <div class="section-inner cta-layout reveal">
    <div><h2 id="cta-title">${escapeHtml(copy.home.cta.title)}</h2><p>${escapeHtml(copy.home.cta.text)}</p></div>
    <div class="cta-actions"><a class="button button-primary" href="${SITE.appUrl}" ${externalAttrs}>${escapeHtml(copy.home.cta.primary)} <span aria-hidden="true">↗</span></a><a class="button button-outline-dark" href="${pagePath(copy.lang === "en" ? "en" : "zh-cn", "privacy")}">${escapeHtml(copy.home.cta.secondary)}</a></div>
  </div>
</section>`;

const renderFaq = (copy) => `<section class="section section-dark faq-section" aria-labelledby="faq-title">
  <div class="section-inner faq-layout reveal">
    <h2 id="faq-title">${escapeHtml(copy.lang === "en" ? "Questions before you start." : "开始之前，先回答几个问题。")}</h2>
    <div class="faq-list">${copy.home.faq.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join("")}</div>
  </div>
</section>`;

const renderHome = (locale, copy) => `${renderHero(copy)}${renderTrust(copy)}${renderCanvas(copy)}${renderWidgets(copy)}${renderPrivacy(copy)}${renderPlatforms(copy)}${renderCta(copy)}${renderFaq(copy)}`;

const renderPageHero = (copy, page) => `<section class="page-hero" aria-labelledby="page-title"><div class="page-hero-inner reveal"><p class="page-kicker">${escapeHtml(copy[page].kicker)}</p><h1 id="page-title">${escapeHtml(copy[page].heading)}</h1><p>${escapeHtml(copy[page].intro)}</p></div></section>`;

const renderFeatures = (copy) => `<div class="page-body">${renderPageHero(copy, "features")}<section class="page-section"><div class="section-inner"><div class="feature-list">${copy.features.items.map(([number, title, text]) => `<article class="feature-item reveal"><span class="feature-number">${escapeHtml(number)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join("")}</div><p class="closing-line reveal">${escapeHtml(copy.features.closing)}</p></div></section></div>`;

const renderPrivacyPage = (copy, locale) => `<div class="page-body">${renderPageHero(copy, "privacy")}<section class="page-section"><div class="section-inner"><div class="two-column-content"><article class="content-block reveal"><h2>${escapeHtml(copy.privacy.localTitle)}</h2><ul class="content-list">${copy.privacy.localItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article><article class="content-block reveal"><h2>${escapeHtml(copy.privacy.cloudTitle)}</h2><ul class="content-list">${copy.privacy.cloudItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article></div><div class="two-column-content"><article class="content-block reveal"><h2>${escapeHtml(copy.privacy.limitsTitle)}</h2><ul class="content-list">${copy.privacy.limits.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article><article class="content-block reveal"><h2>${escapeHtml(copy.privacy.actionsTitle)}</h2><ul class="content-list">${copy.privacy.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article></div><div class="callout reveal"><p>${escapeHtml(copy.home.privacy.note)}</p><p class="callout-link"><a class="text-link" href="${SITE.appUrl}privacy.html" ${externalAttrs}>${escapeHtml(copy.privacy.fullNotice)} ↗</a></p></div></div></section></div>`;

const renderDownload = (copy) => `<div class="page-body">${renderPageHero(copy, "download")}<section class="page-section"><div class="section-inner"><div class="download-grid"><article class="download-item reveal"><span class="platform-mark">Mac<br />PC</span><h2>${escapeHtml(copy.download.desktopTitle)}</h2><p>${escapeHtml(copy.download.desktopText)}</p><ol class="steps">${copy.download.desktopSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol><div class="release-links">${installLink(copy)}<a class="text-link" href="${SITE.githubUrl}" ${externalAttrs}>${escapeHtml(copy.download.links.source)} ↗</a></div></article><article class="download-item reveal"><span class="platform-mark">Web</span><h2>${escapeHtml(copy.download.webTitle)}</h2><p>${escapeHtml(copy.download.webText)}</p><a class="button button-primary" href="${SITE.appUrl}" ${externalAttrs}>${escapeHtml(copy.download.links.web)} ↗</a></article><article class="download-item reveal"><span class="platform-mark">iOS<br />Android</span><h2>${escapeHtml(copy.download.mobileTitle)}</h2><p>${escapeHtml(copy.download.mobileText)}</p><a class="button button-outline-dark" href="${SITE.appUrl}" ${externalAttrs}>${escapeHtml(copy.download.links.web)} ↗</a></article></div><div class="callout reveal"><p>${escapeHtml(copy.download.note)}</p></div></div></section></div>`;

const renderUpdates = (copy) => `<div class="page-body">${renderPageHero(copy, "updates")}<section class="page-section"><div class="section-inner"><div class="release-card reveal"><div><span class="page-kicker">${escapeHtml(copy.updates.current)}</span><div class="release-version">${escapeHtml(copy.updates.versionText)}</div></div><div><h2>WhyNavo ${escapeHtml(copy.updates.versionText)}</h2><p>${escapeHtml(copy.updates.versionSummary)}</p><div class="release-links"><a class="button button-primary" href="${SITE.releaseUrl}" ${externalAttrs}>${escapeHtml(copy.updates.viewRelease)} ↗</a><a class="button button-outline-dark" href="${SITE.githubUrl}" ${externalAttrs}>${escapeHtml(copy.updates.viewGithub)} ↗</a></div></div></div><div class="content-intro updates-cadence-intro reveal"><h2>${escapeHtml(copy.updates.cadenceTitle)}</h2></div><ul class="cadence-list">${copy.updates.cadence.map((item) => `<li class="reveal">${escapeHtml(item)}</li>`).join("")}</ul></div></section></div>`;

const renderHelp = (copy) => `<div class="page-body">${renderPageHero(copy, "help")}<section class="page-section"><div class="section-inner"><div class="help-list">${copy.help.questions.map(([question, answer]) => `<details class="reveal"><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join("")}</div><div class="callout reveal"><p>${escapeHtml(copy.help.intro)}</p><p class="callout-link"><a class="text-link" href="${SITE.appUrl}support.html" ${externalAttrs}>${escapeHtml(copy.help.support)} ↗</a></p></div></div></section></div>`;

const pageBody = (locale, copy, page) => {
  if (page === "home") return renderHome(locale, copy);
  if (page === "features") return renderFeatures(copy);
  if (page === "privacy") return renderPrivacyPage(copy, locale);
  if (page === "download") return renderDownload(copy);
  if (page === "updates") return renderUpdates(copy);
  return renderHelp(copy);
};

await rm(outputRoot, { recursive: true, force: true });
await cp(sourceRoot, outputRoot, { recursive: true });

const pages = ["home", "features", "privacy", "download", "updates", "help"];
for (const [locale, copy] of Object.entries(CONTENT)) {
  for (const page of pages) {
    const directory = path.join(outputRoot, locale, page === "home" ? "" : page);
    await mkdir(directory, { recursive: true });
    const title = page === "home" ? copy.home.title : copy[page].title;
    const description = page === "home" ? copy.home.description : copy[page].description;
    const bodyClass = page === "home" ? "" : "light-page";
    await writeFile(path.join(directory, "index.html"), shell({locale, page, copy, title, description, body: pageBody(locale, copy, page), bodyClass}), "utf8");
  }
}

await writeFile(path.join(outputRoot, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0; url=/en/"><link rel="canonical" href="${SITE.domain}/en/"><title>WhyNavo</title></head><body><p><a href="/en/">Open WhyNavo</a> · <a href="/zh-cn/">打开中文官网</a></p></body></html>`, "utf8");
await writeFile(path.join(outputRoot, "404.html"), shell({locale: "en", page: "help", copy: CONTENT.en, title: "WhyNavo Help", description: CONTENT.en.help.description, body: renderHelp(CONTENT.en), bodyClass: "light-page"}), "utf8");
await writeFile(path.join(outputRoot, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE.domain}/sitemap.xml\n`, "utf8");
await writeFile(path.join(outputRoot, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(CONTENT).flatMap((locale) => pages.map((page) => `  <url><loc>${pageUrl(locale, page)}</loc><changefreq>${page === "updates" ? "weekly" : "monthly"}</changefreq></url>`)).join("\n")}\n</urlset>\n`, "utf8");
await writeFile(path.join(outputRoot, "site.webmanifest"), JSON.stringify({name: "WhyNavo", short_name: "WhyNavo", start_url: "/en/", display: "standalone", background_color: "#0c1213", theme_color: "#0c1213", icons: [{src: asset("logo.svg"), sizes: "any", type: "image/svg+xml"}]}, null, 2), "utf8");
const schemaHashes = [...inlineScriptHashes].join(" ");
await writeFile(path.join(outputRoot, "_headers"), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload\n  Content-Security-Policy: default-src 'self'; script-src 'self' ${schemaHashes}; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/styles.css\n  Cache-Control: public, max-age=86400\n\n/site.js\n  Cache-Control: public, max-age=86400\n`, "utf8");

console.log(`Built WhyNavo website ${releaseVersion} at ${path.relative(repoRoot, outputRoot)}`);
