export const SITE = {
  name: "WhyNavo",
  domain: "https://www.whynavo.com",
  appUrl: "https://whynavo.com/",
  githubUrl: "https://github.com/Muggler77/whynavo",
  releaseUrl: "https://github.com/Muggler77/whynavo/releases/latest",
  version: "0.9.32"
};

export const CONTENT = {
  en: {
    lang: "en",
    altLang: "中文",
    altHref: "/zh-cn/",
    nav: {
      features: "Product",
      privacy: "Privacy",
      download: "Download",
      updates: "Updates",
      help: "Help",
      openApp: "Web App · No install",
      menu: "Open menu",
      closeMenu: "Close menu"
    },
    home: {
      title: "WhyNavo - Local-first new tab workspace",
      description: "WhyNavo is a local-first new tab workspace for shortcuts, widgets, notes and everyday focus. Use it without an account, then add optional sync when you need it.",
      eyebrow: "LOCAL-FIRST · NO ACCOUNT REQUIRED",
      heroTitle: "Your new tab. Your data.",
      heroText: "Useful before you sign in. Local by default.",
      heroDetail: "Shortcuts, layouts, notes and tasks stay in this browser profile. Sign in only when you want supported data to sync.",
      primary: "Start without an account",
      secondaryPending: "Install Desktop Extension",
      secondaryApproved: "Add to Chrome",
      heroNote: "No account and no installation are required for the web app. Install the desktop extension only to replace every Chrome or Edge new tab.",
      index: ["01 Canvas", "02 Local", "03 Sync"],
      trust: ["No account required", "Local by default", "Optional sync"],
      canvas: {
        kicker: "01 / CANVAS",
        title: "Make the web feel like yours.",
        text: "Arrange the pages, icons and widgets that belong in your day. WhyNavo keeps the canvas flexible without turning it into a noisy dashboard.",
        bullets: ["Freely place shortcuts and widgets", "Full-bleed site artwork with crisp fallbacks", "Folders and personal pages that stay easy to scan"]
      },
      widgets: {
        kicker: "02 / WIDGETS",
        title: "Widgets with a shape of their own.",
        text: "Weather, focus, calendar, notes and tasks each get an information layout that fits the job. Compact views stay useful instead of leaving empty space.",
        link: "See every feature"
      },
      privacy: {
        kicker: "03 / PRIVATE BY DEFAULT",
        title: "Your data begins here. On your device.",
        text: "You can use WhyNavo without an account. Local shortcuts, layout, notes and tasks stay in the current browser until you choose to sign in.",
        columns: [
          ["01", "On your device", "Signed-out content stays in the current browser profile."],
          ["02", "When you connect", "Supported fields can sync to your account across devices."],
          ["03", "You stay in control", "Export a data backup, turn sync off, or delete your account." ]
        ],
        note: "Photos, custom images, dynamic wallpaper videos and uploaded icon images stay on the device. Cloud sync is not end-to-end encrypted."
      },
      platforms: {
        kicker: "04 / EVERY SCREEN",
        title: "One workspace, wherever you start.",
        text: "Use the desktop extension on Chromium browsers, or open the responsive web app on mobile and tablet. The same product language follows you without pretending every platform works the same way.",
        items: [
          ["Desktop", "Chrome and Edge extension", "Replace the new tab page on supported Chromium browsers."],
          ["Mobile", "iOS, iPadOS and Android", "Open the web app and add it to your home screen."],
          ["Web", "Any modern browser", "Use the dashboard directly without installing anything."]
        ],
        link: "Choose your platform"
      },
      cta: {
        title: "A new tab with room to think.",
        text: "Start locally. Connect only when it helps.",
        primary: "Open WhyNavo",
        secondary: "Read the privacy guide"
      },
      faq: [
        ["Do I need the extension?", "No. The web app works directly in any modern browser. Install the desktop extension only when you want WhyNavo to open automatically on every Chrome or Edge new tab."],
        ["Do I need an account?", "No. WhyNavo works without an account and keeps signed-out content in the current browser. Sign in only when you want supported fields to sync."],
        ["Does sync upload my photos and custom wallpapers?", "No. Device-uploaded photos, custom images, dynamic wallpaper videos and uploaded shortcut or folder images are excluded from cloud snapshots and remain on the device."],
        ["Can I use WhyNavo on a phone?", "Yes. Open the web app in Safari, Chrome or another modern browser and add it to the home screen. It is a dashboard experience, not a claim to replace a mobile browser's new-tab system."],
        ["Can I leave whenever I want?", "Yes. You can export a data backup, turn off sync, sign out locally, or permanently delete your account from the app."]
      ]
    },
    features: {
      title: "WhyNavo Features - A calmer new tab workspace",
      description: "Explore WhyNavo's flexible canvas, purposeful widgets, local-first storage, optional sync and portable backups.",
      kicker: "THE PRODUCT",
      heading: "A new tab that adapts to the way you work.",
      intro: "WhyNavo is a personal workspace before it is a list of features. Every part is designed to stay readable, movable and yours.",
      items: [
        ["01", "Canvas and spaces", "Create personal pages for work, study or life. Arrange shortcuts, folders and widgets without losing the quiet center of the page."],
        ["02", "Purpose-built widgets", "Weather, focus, calendar, notes, tasks, countdowns, clocks, rates and more use distinct layouts suited to their content."],
        ["03", "Clear site icons", "WhyNavo persists successful icon choices, rejects weak candidates and keeps a crisp text fallback when a site does not provide a usable mark."],
        ["04", "Notes and recurring tasks", "Capture a thought, plan a task and set a local reminder for recurring work without adding another service to your stack."],
        ["05", "Static and dynamic wallpapers", "Use the built-in collection or upload an MP4, WebM or image. Personal media remains on this device and never enters a cloud snapshot."],
        ["06", "Portable data", "Import WeTab data, browser bookmarks, CSV, Markdown and WhyNavo backups. Export your workspace data whenever you need it; video wallpaper bytes remain device-only."]
      ],
      closing: "Small details add up to a page that feels like a place, not a blank tab."
    },
    privacy: {
      title: "WhyNavo Privacy and Data",
      description: "Understand what WhyNavo stores locally, what optional sync includes and how to keep control of your workspace.",
      kicker: "PRIVACY, WITHOUT THE FOG",
      heading: "Local first means the default is useful before you sign in.",
      intro: "WhyNavo is designed so an account is an option for synchronization, not a gate around the basic product.",
      localTitle: "What stays on this device",
      localItems: ["Shortcuts, folders and personal pages", "Widget layout, notes, tasks and countdowns", "Theme, wallpaper and appearance settings", "Private photos, custom images, dynamic wallpaper videos and uploaded icon images", "Local icon, weather and location caches"],
      cloudTitle: "What can sync after sign-in",
      cloudItems: ["Shortcuts, groups and folders", "Widgets, notes and tasks", "Countdowns, calendar and supported settings", "Account-bound snapshots protected by authentication, RLS and revision checks"],
      limitsTitle: "The honest limits",
      limits: ["Cloud synchronization is not end-to-end encrypted.", "Browser storage depends on the browser profile, device lock and disk encryption.", "Dynamic wallpaper video bytes are device-only and are not embedded in JSON data backups.", "External icon, weather, email and anti-abuse providers process only the requests needed for those features.", "Do not put passwords, recovery codes or other highly sensitive secrets in notes or shortcut titles."],
      actionsTitle: "Your controls",
      actions: ["Use the product without signing in", "Turn automatic sync or remote icon lookup off", "Export and restore a data backup", "Sign out locally or sign out all devices", "Permanently delete the account and online data"],
      fullNotice: "Read the complete privacy and data notice"
    },
    download: {
      title: "Download WhyNavo",
      description: "Choose the WhyNavo experience that fits your screen: desktop extension, web app or home-screen dashboard.",
      kicker: "START IN THE RIGHT PLACE",
      heading: "Open it anywhere. Keep your data yours.",
      intro: "The web app is the fastest way to try WhyNavo. The desktop extension adds a focused new-tab experience on supported Chromium browsers.",
      desktopTitle: "Desktop extension",
      desktopText: "Use the signed release archive while the Chrome Web Store listing is under review. Chrome does not automatically update unpacked extensions.",
      desktopSteps: ["Download the latest release archive", "Unzip it to a permanent folder", "Open chrome://extensions or edge://extensions", "Enable Developer mode and choose Load unpacked"],
      webTitle: "Web app",
      webText: "Open the official app in any modern browser. No installation or account is required for local use.",
      mobileTitle: "Phone and tablet",
      mobileText: "Open the web app in Safari, Chrome or another modern browser, then choose Add to Home Screen or Install app.",
      links: {web: "Open Web App", release: "View GitHub Releases", source: "Read the source"},
      note: "WhyNavo does not ask everyday users for a service URL, access key or advanced connection setting."
    },
    updates: {
      title: "WhyNavo Updates",
      description: "Read the latest WhyNavo release notes and follow the product's public development history.",
      kicker: "PUBLIC CHANGELOG",
      heading: "A product that explains its changes.",
      intro: "The public repository is the source of truth for release notes, security documentation and build provenance.",
      current: "Current release",
      versionText: "0.9.32",
      versionSummary: "The current release brings local MP4 and WebM dynamic wallpapers, makes the no-account local-first promise visible in the first viewport, and fixes the full-width website header on large displays.",
      viewRelease: "Read the release notes",
      viewGithub: "View the public repository",
      cadenceTitle: "How updates work",
      cadence: ["Hosted web app changes deploy through a staged Cloudflare Pages release.", "Signed-in data is validated before a new client can write it.", "Local browser data remains outside the release folder and is preserved across normal updates.", "Important workspace data should still be exported regularly." ]
    },
    help: {
      title: "WhyNavo Help and FAQ",
      description: "Find practical answers about installation, accounts, synchronization, backups, icons and mobile use.",
      kicker: "HELP WITHOUT THE RUNAROUND",
      heading: "Answers for the moments that matter.",
      intro: "Start here for the common paths. For a bug report, include only a redacted screenshot and never publish account data or a data backup.",
      questions: [
        ["Why is my local data not visible after I sign out?", "Local sign-out intentionally switches to an empty signed-out data partition. Sign back in to return to the account's data; local content created while signed out remains in the local partition."],
        ["How do I move from WeTab?", "Open Settings in WhyNavo, choose the import entry and select the exported .data file. Keep the original file until the imported layout and icons have been checked."],
        ["Why can an icon be replaced with text?", "Some websites do not expose a clear, high-resolution brand icon. WhyNavo keeps a crisp monogram or user-provided label rather than displaying a blurry image."],
        ["What happens when I change devices?", "Without sign-in, each browser profile has its own local workspace. With sign-in, supported content can sync to the same account. Static device media can be moved in a data backup; dynamic wallpaper video files must be selected again on the new device."],
        ["How do I report a security issue?", "Use GitHub's private vulnerability reporting. Do not put passwords, verification links, tokens, exported backups or private screenshots in a public issue."]
      ],
      support: "Open support and security reporting"
    }
  },
  "zh-cn": {
    lang: "zh-CN",
    altLang: "EN",
    altHref: "/en/",
    nav: {
      features: "产品",
      privacy: "隐私",
      download: "下载",
      updates: "更新",
      help: "帮助",
      openApp: "网页版 · 无需安装",
      menu: "打开菜单",
      closeMenu: "关闭菜单"
    },
    home: {
      title: "WhyNavo｜本地优先的新标签页工作台",
      description: "WhyNavo 是一个本地优先的新标签页工作台，用来管理快捷入口、小组件、笔记和日常专注。无需登录即可使用，需要时再开启可选同步。",
      eyebrow: "本地优先 · 无需登录",
      heroTitle: "你的新标签页，数据也属于你。",
      heroText: "无需登录，也能完整使用。本地优先，是默认方式。",
      heroDetail: "快捷方式、布局、笔记和任务先保存在当前浏览器；只有需要多设备同步时再登录。",
      primary: "无需登录，直接使用",
      secondaryPending: "安装桌面扩展",
      secondaryApproved: "安装 Chrome 插件",
      heroNote: "网页版无需账号、无需安装；只有希望 WhyNavo 自动接管 Chrome 或 Edge 的每个新标签页时，才需要安装桌面扩展。",
      index: ["01 画布", "02 本机", "03 同步"],
      trust: ["无需账号", "默认本地保存", "按需同步"],
      canvas: {
        kicker: "01 / 画布",
        title: "让网页真正属于你。",
        text: "把属于你的一天放在同一个空间里。WhyNavo 保持布局自由，也让页面始终清楚、安静、容易扫读。",
        bullets: ["快捷入口和小组件可以自由摆放", "真实网站图标占满图标区域，并保留清晰备用方案", "用文件夹和个人页面整理不同场景"]
      },
      widgets: {
        kicker: "02 / 小组件",
        title: "每个小组件，都有自己的形状。",
        text: "天气、专注、日历、笔记和任务各自使用适合内容的布局。即使缩小到紧凑尺寸，也不会浪费空间。",
        link: "查看全部功能"
      },
      privacy: {
        kicker: "03 / 默认保护隐私",
        title: "你的数据，先从本机开始。",
        text: "无需账号也能使用 WhyNavo。未登录时，快捷方式、布局、笔记和任务会留在当前浏览器，只有你主动登录后才会同步支持的内容。",
        columns: [
          ["01", "保存在本机", "未登录内容留在当前浏览器配置文件中。"],
          ["02", "主动连接后", "支持的字段可以同步到账号，在多台设备上使用。"],
          ["03", "始终由你控制", "可以完整导出、关闭同步，或删除账号。"]
        ],
        note: "照片、自定义图片、动态壁纸视频和上传的图标图片保留在设备上。云端同步不是端到端加密。"
      },
      platforms: {
        kicker: "04 / 每块屏幕",
        title: "从哪里开始，都能回到同一个工作台。",
        text: "在 Chromium 浏览器中使用桌面插件，在手机和平板上打开响应式在线版。我们会诚实区分不同平台的能力，不把网页应用包装成手机浏览器插件。",
        items: [
          ["桌面", "Chrome 和 Edge 插件", "在支持的 Chromium 浏览器中替换新标签页。"],
          ["手机", "iOS、iPadOS 和 Android", "打开在线版，再添加到主屏幕。"],
          ["网页", "任何现代浏览器", "无需安装，直接使用完整工作台。"]
        ],
        link: "选择你的使用方式"
      },
      cta: {
        title: "给思考留一点空间。",
        text: "先从本机开始，只在真正有帮助时连接账号。",
        primary: "打开 WhyNavo",
        secondary: "阅读隐私说明"
      },
      faq: [
        ["必须安装扩展吗？", "不需要。网页版可以在任何现代浏览器中直接使用。只有希望 WhyNavo 自动出现在 Chrome 或 Edge 的每个新标签页时，才需要安装桌面扩展。"],
        ["必须注册账号吗？", "不需要。WhyNavo 无需账号即可使用，未登录内容保存在当前浏览器。只有需要同步支持的字段时才登录。"],
        ["照片和自定义壁纸会上传吗？", "不会。本机照片、自定义图片、动态壁纸视频以及上传的快捷图标和文件夹图标不会进入云端快照，会保留在设备上。"],
        ["手机可以使用吗？", "可以。在 Safari、Chrome 或其他现代浏览器打开在线版，再添加到主屏幕。它是个人工作台，不宣称替换手机浏览器的新标签页系统。"],
        ["以后可以离开吗？", "可以。你可以完整导出备份、关闭同步、退出当前设备，或在应用中永久删除账号。"]
      ]
    },
    features: {
      title: "WhyNavo 功能｜更安静的新标签页工作台",
      description: "了解 WhyNavo 的自由画布、专用小组件、本地优先存储、可选同步和可携带备份。",
      kicker: "产品能力",
      heading: "一个会适应你工作方式的新标签页。",
      intro: "WhyNavo 首先是一个属于你的空间，其次才是一串功能。每个部分都保持清楚、可移动、可掌控。",
      items: [
        ["01", "画布与空间", "为工作、学习和生活创建个人页面，自由整理快捷入口、文件夹和小组件。"],
        ["02", "有明确形状的小组件", "天气、专注、日历、笔记、任务、倒计时、时钟和汇率等，都使用适合内容的布局。"],
        ["03", "清晰的网站图标", "WhyNavo 会保存成功的图标选择，拒绝低质量候选，并在网站没有清晰图标时保留清楚的文字备用方案。"],
        ["04", "笔记与长期任务", "随手记录想法，安排任务，并为周期任务设置本地提醒，不必再引入额外的提醒服务。"],
        ["05", "静态与动态壁纸", "使用内置壁纸，或上传 MP4、WebM 和图片。本机个人媒体不会进入云端快照。"],
        ["06", "可携带的数据", "支持导入 WeTab 数据、浏览器书签、CSV、Markdown 和 WhyNavo 备份，也可以随时导出工作台数据；动态壁纸视频文件仍只保存在当前设备。"]
      ],
      closing: "细节合在一起，页面才会像一个真正的空间，而不是一张空白标签页。"
    },
    privacy: {
      title: "WhyNavo 隐私与数据",
      description: "了解 WhyNavo 默认保存在本机的内容、登录后可同步的内容，以及如何始终掌控自己的工作台。",
      kicker: "不含糊的隐私说明",
      heading: "本地优先，意味着登录之前也能完整使用。",
      intro: "WhyNavo 把账号设计成同步选项，而不是基本功能的门槛。",
      localTitle: "留在这台设备上的内容",
      localItems: ["快捷方式、文件夹和个人页面", "小组件布局、笔记、任务和倒计时", "主题、壁纸和外观设置", "私人照片、自定义图片、动态壁纸视频和上传的图标图片", "本机图标、天气和位置缓存"],
      cloudTitle: "登录后可以同步的内容",
      cloudItems: ["快捷方式、分组和文件夹", "小组件、笔记和任务", "倒计时、日历和支持的设置", "受认证、RLS 和版本校验保护的账号快照"],
      limitsTitle: "需要如实说明的边界",
      limits: ["云端同步不是端到端加密。", "浏览器本机存储依赖浏览器配置文件、设备锁和磁盘加密。", "动态壁纸视频文件只保存在当前设备，不会嵌入 JSON 数据备份。", "图标、天气、邮件和反滥用服务商只会处理完成对应功能所需的请求。", "不要在笔记或快捷方式标题中保存密码、恢复码或其他高度敏感的秘密。"],
      actionsTitle: "你可以做的事",
      actions: ["不登录也能使用", "关闭自动同步或远程图标查找", "完整导出并恢复备份", "退出当前设备或退出所有设备", "永久删除账号和在线数据"],
      fullNotice: "阅读完整的隐私与数据说明"
    },
    download: {
      title: "下载 WhyNavo",
      description: "根据你的设备选择 WhyNavo：桌面插件、在线版，或手机和平板主屏幕工作台。",
      kicker: "从适合你的地方开始",
      heading: "在哪里打开，都能保留自己的数据。",
      intro: "在线版是体验 WhyNavo 最快的方式。桌面插件则为支持的 Chromium 浏览器带来专注的新标签页。",
      desktopTitle: "桌面插件",
      desktopText: "Chrome 应用商店版本审核期间，可以使用 GitHub 上的正式发布包。未打包扩展不会由 Chrome 自动更新。",
      desktopSteps: ["下载最新发布包", "解压到固定文件夹", "打开 chrome://extensions 或 edge://extensions", "开启开发者模式并选择“加载已解压的扩展程序”"],
      webTitle: "在线版",
      webText: "在任何现代浏览器打开官方在线版。不登录也能使用本地功能。",
      mobileTitle: "手机和平板",
      mobileText: "在 Safari、Chrome 或其他现代浏览器打开在线版，然后选择“添加到主屏幕”或“安装应用”。",
      links: {web: "打开在线版", release: "查看 GitHub 发布包", source: "查看源代码"},
      note: "普通用户不需要填写服务地址、访问密钥、API Key 或任何高级连接配置。"
    },
    updates: {
      title: "WhyNavo 更新日志",
      description: "查看 WhyNavo 的最新版本和公开开发记录。",
      kicker: "公开更新记录",
      heading: "每次变化，都应该说清楚。",
      intro: "公开仓库是版本说明、安全文档和构建来源证明的真实来源。",
      current: "当前版本",
      versionText: "0.9.32",
      versionSummary: "当前版本支持只保存在本机的 MP4 和 WebM 动态壁纸，把无需登录与本地优先提升到官网首屏，并修复超宽屏上的官网导航背景。",
      viewRelease: "阅读版本说明",
      viewGithub: "查看公开仓库",
      cadenceTitle: "更新如何工作",
      cadence: ["在线版通过 Cloudflare Pages 的分阶段发布更新。", "新客户端写入前会校验已登录数据。", "本机浏览器数据位于发布文件夹之外，正常更新不会删除。", "重要工作台数据仍建议定期导出。"]
    },
    help: {
      title: "WhyNavo 帮助与常见问题",
      description: "查看安装、账号、同步、备份、图标和手机使用的实际帮助。",
      kicker: "直接回答关键问题",
      heading: "在需要的时候，找到清楚的答案。",
      intro: "先从这里处理常见情况。报告问题时只提供脱敏截图，不要公开账号信息或数据备份。",
      questions: [
        ["为什么退出登录后看不到本地数据？", "退出登录会切换到空的未登录数据分区，这是为了隔离账号。重新登录即可回到账号数据；退出后新建的未登录内容仍在本机分区中。"],
        ["如何从 WeTab 迁移？", "打开 WhyNavo 设置中的导入入口，选择导出的 .data 文件。确认布局和图标正常前，请保留原始文件。"],
        ["为什么图标可以换成文字？", "部分网站没有提供清晰的高分辨率品牌图标。WhyNavo 会保留清晰的文字或用户自定义标签，不显示模糊图片。"],
        ["换设备后会发生什么？", "不登录时，每个浏览器配置文件都有独立的本地工作台。登录后，支持的内容可以同步到同一账号；静态本机媒体可随数据备份迁移，动态壁纸视频需要在新设备重新选择。"],
        ["如何报告安全问题？", "使用 GitHub 私密漏洞报告，不要在公开 Issue 中提交密码、验证链接、Token、数据备份或私人截图。"]
      ],
      support: "打开支持与安全报告"
    }
  }
};
