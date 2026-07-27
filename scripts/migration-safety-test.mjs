import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = new URL("..", import.meta.url).pathname;
const tempDir = await mkdtemp(join(tmpdir(), "whynavo-migration-test-"));
const migrationsOutput = join(tempDir, "migrations.mjs");
const syncOutput = join(tempDir, "sync.mjs");
const dbOutput = join(tempDir, "db.mjs");
const defaultStateOutput = join(tempDir, "default-state.mjs");
const urlsOutput = join(tempDir, "urls.mjs");
const importersOutput = join(tempDir, "importers.mjs");
const updatesOutput = join(tempDir, "updates.mjs");
const edgeFunctionOutputs = ["send-auth-email", "delete-account", "boc-rates"]
  .map((name) => ({
    input: join(repoRoot, `supabase/functions/${name}/index.ts`),
    output: join(tempDir, `${name}.mjs`)
  }));

globalThis.window = { crypto: globalThis.crypto };

try {
  await Promise.all(edgeFunctionOutputs.map(({ input, output }) => build({
    entryPoints: [input],
    outfile: output,
    bundle: true,
    platform: "neutral",
    format: "esm",
    external: ["*"],
    logLevel: "silent"
  })));
  await build({
    entryPoints: [join(repoRoot, "extension/src/migrations.ts")],
    outfile: migrationsOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });
  await build({
    entryPoints: [join(repoRoot, "extension/src/sync.ts")],
    outfile: syncOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });
  await build({
    entryPoints: [join(repoRoot, "extension/src/db.ts")],
    outfile: dbOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });
  await build({
    entryPoints: [join(repoRoot, "extension/src/defaultState.ts")],
    outfile: defaultStateOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });
  await build({
    entryPoints: [join(repoRoot, "extension/src/urls.ts")],
    outfile: urlsOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    logLevel: "silent"
  });
  await build({
    entryPoints: [join(repoRoot, "extension/src/importers.ts")],
    outfile: importersOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });
  await build({
    entryPoints: [join(repoRoot, "extension/src/updates.ts")],
    outfile: updatesOutput,
    bundle: true,
    platform: "browser",
    format: "esm",
    define: {
      "import.meta.env": "{}"
    },
    logLevel: "silent"
  });

  const { createStateBackup, isAppState, migrateState, stateSchemaVersion } = await import(pathToFileURL(migrationsOutput).href);
  const { adoptPortableStateForAccount, assertPasswordNotKnownLeaked, cloudStatesEquivalent, isTerminalAuthError, localStatesEquivalent, markPulled, markPushed, mergeLocalPeerState, mergePortableStateIntoAccount, mergeRemote, normalizeState, nowIso: logicalNowIso, prepareCloudState, prepareCompleteBackupState, reconcileCompletedSync, restoreCompleteBackupForDevice, stampSettingsChanges, stampStateSnapshot, validateAppStatePayload } = await import(pathToFileURL(syncOutput).href);
  const { accountScopedKey } = await import(pathToFileURL(dbOutput).href);
  const { defaultState } = await import(pathToFileURL(defaultStateOutput).href);
  const { normalizeHttpUrl, safeHttpHref } = await import(pathToFileURL(urlsOutput).href);
  const { MAX_IMPORTED_SHORTCUTS, faviconHostFor, importedToShortcuts, normalizeIconReference, parseBookmarksHtml, parseImportText } = await import(pathToFileURL(importersOutput).href);
  const { checkForUpdate } = await import(pathToFileURL(updatesOutput).href);
  const projectConfigSource = await readFile(join(repoRoot, "extension/src/projectConfig.ts"), "utf8");
  const privacyNoticeSource = await readFile(join(repoRoot, "extension/public/privacy.html"), "utf8");
  const termsSource = await readFile(join(repoRoot, "extension/public/terms.html"), "utf8");
  assert.match(projectConfigSource, /LEGAL_DOCUMENT_VERSION = "2026-07-26"/, "registration consent must use the current public legal-document version");
  assert.match(privacyNoticeSource, /更新日期：2026 年 7 月 26 日[\s\S]*Effective date: July 26, 2026/, "the bilingual privacy notice must expose the consent version date");
  assert.match(termsSource, /更新日期：2026 年 7 月 26 日[\s\S]*Effective date: July 26, 2026/, "the bilingual terms must match the recorded consent version");
  const now = new Date("2026-07-15T00:00:00.000Z").toISOString();
  const originalFetch = globalThis.fetch;
  let leakedPasswordRequest;
  try {
    globalThis.fetch = async (url, options) => {
      leakedPasswordRequest = { url: String(url), options };
      return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:100\n", {
        headers: { "content-length": "42" }
      });
    };
    await assert.rejects(
      assertPasswordNotKnownLeaked("password"),
      /已出现在已知数据泄露中/,
      "known leaked passwords must be rejected"
    );
    assert.equal(leakedPasswordRequest?.url, "https://api.pwnedpasswords.com/range/5BAA6", "only the SHA-1 prefix may leave the device");
    assert.equal(new Headers(leakedPasswordRequest?.options?.headers).get("Add-Padding"), "true", "the HIBP range request must request response padding");
    assert.equal(leakedPasswordRequest?.options?.credentials, "omit", "the HIBP range request must omit credentials");

    globalThis.fetch = async () => new Response("00000000000000000000000000000000000:0\n");
    await assertPasswordNotKnownLeaked("a-local-test-password-that-is-not-in-the-mock");
  } finally {
    globalThis.fetch = originalFetch;
  }
  const legacyState = {
    version: 1,
    updatedAt: now,
    shortcuts: [{ id: "s1", title: "OpenAI", url: "https://openai.com", iconColor: "#14B8A6", pinned: true, order: 0, updatedAt: now }],
    shortcutFolders: [{ id: "folder1", name: "工作资料", groupId: "default", order: 0, updatedAt: now }],
    shortcutGroups: [{ id: "default", name: "常用", color: "#14B8A6", order: 0, updatedAt: now }],
    todos: [{ id: "todo1", text: "保留任务", done: false, order: 0, updatedAt: now }],
    notes: [{ id: "note1", title: "保留笔记", body: "重要数据", updatedAt: now }],
    countdowns: [{ id: "countdown1", title: "项目上线", date: "2026-12-31", updatedAt: now }],
    settings: {
      theme: "dark",
      glass: 42,
      iconSize: 64,
      gridDensity: "comfortable",
      dockPosition: "bottom",
      city: "Shanghai",
      widgets: { weather: true },
      widgetOrder: ["notes", "weather", "calendar"],
      widgetSizes: { notes: "wide", weather: "medium" },
      updatedAt: now
    },
    sync: { deviceId: "device-1", autoSync: true, intervalSeconds: 60 }
  };

  const migrated = migrateState(legacyState);
  assert.equal(migrated.migrated, true, "legacy state should be marked as migrated");
  assert.equal(migrated.state.shortcuts[0].title, "OpenAI", "shortcut data must be preserved");
  assert.equal(migrated.state.todos[0].text, "保留任务", "todo data must be preserved");
  assert.equal(migrated.state.notes[0].body, "重要数据", "note data must be preserved");
  assert.equal(migrated.state.shortcutFolders[0].name, "工作资料", "folder data must be preserved");
  assert.equal(migrated.state.countdowns[0].title, "项目上线", "countdown data must be preserved");
  assert.equal(migrated.backup?.state.notes[0].body, "重要数据", "backup must preserve original state");
  assert.equal(stateSchemaVersion(migrated.state), 1, "schema version should remain supported");
  assert.doesNotThrow(() => validateAppStatePayload(migrated.state, "test state"), "valid app data must pass structural validation");
  const normalizedLegacyImages = normalizeState({
    ...migrated.state,
    shortcuts: [{ ...migrated.state.shortcuts[0], iconUrl: "http://example.com/icon.png" }],
    shortcutFolders: [{ ...migrated.state.shortcutFolders[0], iconUrl: "http://example.com/folder.png" }],
    settings: {
      ...migrated.state.settings,
      wallpaper: "http://example.com/wallpaper.jpg",
      photoFrameImage: "http://example.com/photo.jpg"
    }
  });
  assert.equal(normalizedLegacyImages.shortcuts[0].id, migrated.state.shortcuts[0].id, "insecure legacy icons must not remove shortcut records");
  assert.equal(normalizedLegacyImages.shortcuts[0].iconUrl, undefined, "plaintext legacy shortcut icons must be removed");
  assert.equal(normalizedLegacyImages.shortcutFolders[0].id, migrated.state.shortcutFolders[0].id, "insecure legacy icons must not remove folder records");
  assert.equal(normalizedLegacyImages.shortcutFolders[0].iconUrl, undefined, "plaintext legacy folder icons must be removed");
  assert.equal(normalizedLegacyImages.settings.wallpaper, undefined, "plaintext legacy wallpaper references must be removed");
  assert.equal(normalizedLegacyImages.settings.photoFrameImage, undefined, "plaintext legacy photo-frame references must be removed");
  assert.throws(
    () => validateAppStatePayload({ ...migrated.state, notes: [{ ...migrated.state.notes[0], body: { injected: true } }] }, "test state"),
    /记录字段/,
    "malformed record fields must be rejected before they reach the UI"
  );
  assert.throws(
    () => validateAppStatePayload({ ...migrated.state, settings: { ...migrated.state.settings, widgetOrder: {} } }, "test state"),
    /设置列表/,
    "malformed settings collections must be rejected before persistence"
  );
  assert.throws(
    () => validateAppStatePayload({ ...migrated.state, settings: { ...migrated.state.settings, unexpected: { deeply: { nested: true } } } }, "test state"),
    /未知的设置字段/,
    "unknown nested settings must not reach deterministic merge recursion"
  );
  assert.throws(
    () => validateAppStatePayload({
      ...migrated.state,
      shortcuts: [{ ...migrated.state.shortcuts[0], iconUrl: "javascript:alert(1)" }]
    }, "test state"),
    /记录字段/,
    "stored icon references must reject executable and unsupported schemes"
  );
  assert.throws(
    () => validateAppStatePayload({
      ...migrated.state,
      shortcuts: [{ ...migrated.state.shortcuts[0], url: "file:///private/example" }]
    }, "test state"),
    /网站地址/,
    "stored shortcuts must remain limited to HTTP and HTTPS"
  );
  assert.throws(
    () => validateAppStatePayload({
      ...migrated.state,
      shortcuts: [migrated.state.shortcuts[0], { ...migrated.state.shortcuts[0] }]
    }, "test state"),
    /记录字段/,
    "duplicate record IDs must not collapse unpredictably during synchronization"
  );
  assert.throws(
    () => validateAppStatePayload({
      ...migrated.state,
      countdowns: [{ ...migrated.state.countdowns[0], date: "2026-02-31" }]
    }, "test state"),
    /记录字段/,
    "invalid calendar dates must be rejected before rendering"
  );
  assert.throws(
    () => validateAppStatePayload({ ...migrated.state, updatedAt: "9999-12-31T23:59:59.999Z" }, "test state"),
    /版本或更新时间/,
    "unbounded timestamps must not poison the client logical clock"
  );
  assert.throws(
    () => validateAppStatePayload({ ...migrated.state, sync: { ...migrated.state.sync, intervalSeconds: Number.MAX_VALUE } }, "test state"),
    /同步元数据/,
    "unbounded sync intervals must not create a near-continuous browser timer"
  );
  assert.throws(
    () => validateAppStatePayload({
      ...migrated.state,
      settings: { ...migrated.state.settings, widgets: { ...migrated.state.settings.widgets, injected: true } }
    }, "test state"),
    /小组件开关/,
    "unknown widget keys must not enter render or merge paths"
  );
  assert.throws(
    () => validateAppStatePayload({
      ...migrated.state,
      settings: { ...migrated.state.settings, fieldUpdatedAt: { injected: now } }
    }, "test state"),
    /设置时间戳/,
    "field clocks must only refer to supported settings"
  );
  assert.throws(
    () => validateAppStatePayload({
      ...migrated.state,
      settings: { ...migrated.state.settings, timeZone: "Invalid/Zone" }
    }, "test state"),
    /设置字段/,
    "invalid time zones must be rejected before Intl rendering"
  );
  assert.throws(
    () => validateAppStatePayload({
      ...migrated.state,
      settings: {
        ...migrated.state.settings,
        customWallpapers: [{
          id: "unsafe",
          name: "unsafe",
          dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
          createdAt: now
        }]
      }
    }, "test state"),
    /自定义壁纸/,
    "active SVG content must not be persisted as a custom local image"
  );

  const backup = createStateBackup("测试备份", legacyState, "user-1");
  assert.equal(backup.state.shortcuts[0].url, "https://openai.com", "manual backup must preserve shortcuts");
  assert.equal(backup.ownerId, "user-1", "migration backups must retain their account owner");
  assert.notEqual(accountScopedKey("sync-restore-point", "user-1"), accountScopedKey("sync-restore-point", "user-2"), "restore points must be account scoped");
  assert.notEqual(accountScopedKey("migration-backup", "user-1"), accountScopedKey("migration-backup"), "signed-in and anonymous backups must not share a key");

  const current = migrateState({ ...migrated.state });
  assert.equal(current.migrated, false, "current state should not create another migration");

  const invalid = migrateState({ bad: true });
  assert.equal(invalid.state.version, 1, "invalid state should recover to a valid default state");
  assert.equal(isAppState({ ...legacyState, notes: [null] }), false, "malformed local record collections must be quarantined instead of reaching the UI");
  assert.equal(isAppState(legacyState), true, "valid legacy local data must remain accepted");

  const oldDefaultVisual = normalizeState({
    ...legacyState,
    settings: { ...legacyState.settings, iconSize: 64, visualRefreshVersion: 7 }
  });
  assert.equal(oldDefaultVisual.settings.iconSize, 58, "old default icon size should migrate to the new unified default");
  assert.equal(oldDefaultVisual.settings.visualRefreshVersion, 14, "visual refresh version should advance");
  assert.deepEqual(oldDefaultVisual.settings.customNavPages, [], "legacy state should receive an empty custom page list");
  assert.deepEqual(oldDefaultVisual.settings.hiddenNavPages, ["tools"], "legacy state should adopt the restrained Sample A navigation");
  assert.equal(oldDefaultVisual.settings.navigationDisplay, "always", "legacy state should receive a visible desktop navigation");
  assert.equal(oldDefaultVisual.settings.navigationSide, "left", "legacy state should keep desktop navigation on the left");
  assert.equal(oldDefaultVisual.settings.widgetOrder[0], "notes", "custom widget order must be preserved");
  assert.equal(oldDefaultVisual.settings.widgetSizes.notes, "wide", "custom widget size must be preserved");

  const legacyDefaultWidgetOrder = ["weather", "calendar", "todos", "countdowns", "focus", "notes", "rates", "quote", "clock", "memo", "year", "calculator"];
  const sampleAWidgetOrder = normalizeState({
    ...legacyState,
    settings: { ...legacyState.settings, widgetOrder: legacyDefaultWidgetOrder, visualRefreshVersion: 12 }
  });
  assert.deepEqual(
    sampleAWidgetOrder.settings.widgetOrder.slice(0, 3),
    ["weather", "focus", "calendar"],
    "untouched legacy widget order should adopt the Sample A primary row"
  );

  const customIconSize = normalizeState({
    ...legacyState,
    settings: { ...legacyState.settings, iconSize: 72, visualRefreshVersion: 7 }
  });
  assert.equal(customIconSize.settings.iconSize, 72, "custom icon size should be preserved");
  assert.equal(
    normalizeState({ ...legacyState, settings: { ...legacyState.settings, timeZone: "Invalid/Zone" } }).settings.timeZone,
    "Asia/Shanghai",
    "invalid local time zones must recover to a render-safe default"
  );
  assert.equal(defaultState().settings.weatherUseLocation, false, "new installations must not request precise location before the user opts in");
  assert.equal(
    normalizeState({ ...legacyState, settings: { ...legacyState.settings, weatherUseLocation: undefined } }).settings.weatherUseLocation,
    false,
    "legacy data without an explicit location preference must remain opt-in"
  );
  assert.equal(normalizeState({ ...legacyState, settings: { ...legacyState.settings, glass: 70 } }).settings.glass, 70, "saved transparency must remain inside the UI's supported range after reload");
  assert.equal(normalizeState({ ...legacyState, sync: { ...legacyState.sync, intervalSeconds: Number.MAX_VALUE } }).sync.intervalSeconds, 3600, "sync intervals must be clamped to a safe maximum");
  const untrustedServiceConfig = normalizeState({
    ...legacyState,
    settings: {
      ...legacyState.settings,
      supabaseUrl: "https://attacker.invalid",
      supabaseAnonKey: "untrusted-key"
    }
  });
  assert.notEqual(untrustedServiceConfig.settings.supabaseUrl, "https://attacker.invalid", "saved data must not replace the official sync service URL");
  assert.notEqual(untrustedServiceConfig.settings.supabaseAnonKey, "untrusted-key", "saved data must not replace the official publishable client key");

  const customNavigation = normalizeState({
    ...legacyState,
    settings: {
      ...legacyState.settings,
      visualRefreshVersion: 9,
      customNavPages: [
        { id: "page-work", name: "工作", groupId: "default", icon: "briefcase", order: 0, updatedAt: now }
      ],
      hiddenNavPages: ["tools"],
      navigationDisplay: "auto",
      navigationSide: "right"
    }
  });
  assert.equal(customNavigation.settings.customNavPages[0].name, "工作", "custom navigation pages must be preserved");
  assert.deepEqual(customNavigation.settings.hiddenNavPages, ["tools"], "hidden built-in pages must be preserved");
  assert.equal(customNavigation.settings.navigationDisplay, "auto", "custom navigation visibility must be preserved");
  assert.equal(customNavigation.settings.navigationSide, "right", "custom navigation side must be preserved");
  assert.equal(customNavigation.shortcuts[0].title, "OpenAI", "navigation migration must not alter shortcuts");
  assert.equal(customNavigation.notes[0].body, "重要数据", "navigation migration must not alter notes");

  const localMediaState = normalizeState({
    ...legacyState,
    shortcuts: [{ ...legacyState.shortcuts[0], iconUrl: "data:image/png;base64,private-shortcut-icon" }],
    shortcutFolders: [{ ...legacyState.shortcutFolders[0], iconUrl: "data:image/png;base64,private-folder-icon" }],
    settings: {
      ...legacyState.settings,
      photoFrameImage: "data:image/webp;base64,private-photo",
      photoFrameTitle: "private-photo-filename",
      wallpaper: "data:image/webp;base64,private-wallpaper",
      wallpaperPreset: "custom-private",
      wallpaperCollection: ["aurora-lake", "custom-private"],
      customWallpapers: [{ id: "custom-private", name: "私人壁纸", dataUrl: "data:image/webp;base64,private-wallpaper", createdAt: now }],
      city: "Hangzhou",
      weatherUseLocation: true,
      fieldUpdatedAt: {
        ...(legacyState.settings.fieldUpdatedAt || {}),
        city: now,
        weatherUseLocation: now
      }
    }
  });
  const cloudState = prepareCloudState(localMediaState);
  assert.equal(cloudState.settings.photoFrameImage, undefined, "private photos must remain local-only");
  assert.equal(cloudState.settings.photoFrameTitle, undefined, "private photo filenames must remain local-only");
  assert.equal(cloudState.shortcuts[0].iconUrl, undefined, "inline shortcut icons must remain local-only");
  assert.equal(cloudState.shortcutFolders[0].iconUrl, undefined, "inline folder icons must remain local-only");
  assert.deepEqual(cloudState.settings.customWallpapers, [], "custom wallpaper payloads must remain local-only");
  assert.equal(cloudState.settings.wallpaper, undefined, "inline wallpaper data must not be uploaded");
  assert.deepEqual(cloudState.settings.wallpaperCollection, ["aurora-lake"], "cloud wallpaper collection must exclude local assets");
  assert.equal(cloudState.settings.city, "Shanghai", "selected weather cities must not be uploaded");
  assert.equal(cloudState.settings.weatherUseLocation, false, "location-weather preferences must not be uploaded");
  assert.equal(cloudState.settings.fieldUpdatedAt?.city, undefined, "weather city clocks must remain device-local");
  assert.equal(cloudState.settings.fieldUpdatedAt?.weatherUseLocation, undefined, "location preference clocks must remain device-local");
  assert.equal(cloudState.settings.supabaseUrl, undefined, "service URLs must not be stored in user snapshots");
  assert.equal(cloudState.settings.supabaseAnonKey, undefined, "public client configuration must not be stored in user snapshots");
  assert.deepEqual(
    cloudState.sync,
    { deviceId: "cloud", autoSync: true, intervalSeconds: 60, remoteRevision: 0 },
    "device-local sync metadata must not make otherwise identical cloud snapshots change"
  );
  assert.equal(
    cloudStatesEquivalent(localMediaState, { ...localMediaState, sync: { ...localMediaState.sync, lastPulledAt: logicalNowIso(), remoteRevision: 99 } }),
    true,
    "cloud equality must ignore local polling timestamps and database revision metadata"
  );
  assert.equal(
    cloudStatesEquivalent(localMediaState, {
      ...localMediaState,
      settings: stampSettingsChanges(localMediaState.settings, {
        ...localMediaState.settings,
        city: "Osaka",
        weatherUseLocation: false
      }, "2026-07-24T08:00:00.000Z"),
      updatedAt: "2026-07-24T08:00:00.000Z"
    }),
    true,
    "device-local weather changes must not trigger cloud writes"
  );
  assert.doesNotThrow(() => validateAppStatePayload(cloudState, "cloud state"), "prepared cloud snapshots must satisfy the closed data model");

  const completeBackupSource = normalizeState({
    ...localMediaState,
    shortcuts: [{ ...localMediaState.shortcuts[0], iconUrl: "data:image/png;base64,aGVsbG8=" }],
    shortcutFolders: [{ ...localMediaState.shortcutFolders[0], iconUrl: "data:image/png;base64,Zm9sZGVy" }],
    settings: {
      ...localMediaState.settings,
      photoFrameImage: "data:image/png;base64,cGhvdG8=",
      wallpaper: "data:image/png;base64,d2FsbHBhcGVy",
      customWallpapers: [{
        id: "custom-private",
        name: "私人壁纸",
        dataUrl: "data:image/png;base64,d2FsbHBhcGVy",
        createdAt: now
      }]
    }
  });
  const completeBackup = prepareCompleteBackupState(completeBackupSource);
  assert.doesNotThrow(
    () => validateAppStatePayload(completeBackup, "complete backup"),
    "complete backups must remain valid while retaining device-local media"
  );
  assert.equal(completeBackup.settings.photoFrameImage, completeBackupSource.settings.photoFrameImage, "complete backups must include local photos");
  assert.equal(completeBackup.settings.customWallpapers?.[0]?.dataUrl, completeBackupSource.settings.customWallpapers?.[0]?.dataUrl, "complete backups must include custom wallpapers");
  assert.equal(completeBackup.shortcuts[0].iconUrl, completeBackupSource.shortcuts[0].iconUrl, "complete backups must include uploaded shortcut icons");
  assert.equal(completeBackup.settings.city, "Shanghai", "complete backups must exclude device-local weather cities");
  assert.equal(completeBackup.settings.supabaseUrl, undefined, "complete backups must exclude service URLs");
  assert.equal(completeBackup.sync.deviceId, "backup", "complete backups must exclude the originating device identifier");

  const currentBackupDevice = normalizeState({
    ...completeBackupSource,
    settings: {
      ...completeBackupSource.settings,
      city: "Osaka",
      weatherUseLocation: false,
      photoFrameImage: "data:image/png;base64,b2xkLXBob3Rv",
      customWallpapers: []
    },
    sync: {
      ...completeBackupSource.sync,
      deviceId: "current-device",
      autoSync: false,
      intervalSeconds: 300,
      remoteRevision: 12
    }
  });
  const restoredBackup = restoreCompleteBackupForDevice(completeBackup, currentBackupDevice);
  assert.equal(restoredBackup.settings.photoFrameImage, completeBackup.settings.photoFrameImage, "backup restore must restore the backed-up local photo");
  assert.equal(restoredBackup.settings.customWallpapers?.[0]?.dataUrl, completeBackup.settings.customWallpapers?.[0]?.dataUrl, "backup restore must restore backed-up custom wallpapers");
  assert.equal(restoredBackup.shortcuts[0].iconUrl, completeBackup.shortcuts[0].iconUrl, "backup restore must restore backed-up shortcut icons");
  assert.equal(restoredBackup.settings.city, currentBackupDevice.settings.city, "backup restore must preserve the current device weather city");
  assert.equal(restoredBackup.settings.weatherUseLocation, currentBackupDevice.settings.weatherUseLocation, "backup restore must preserve the current device location preference");
  assert.deepEqual(restoredBackup.sync, currentBackupDevice.sync, "backup restore must preserve the current device sync partition and revision");

  const mergedWithRemote = mergeRemote(localMediaState, normalizeState({
    ...legacyState,
    updatedAt: new Date("2026-07-16T00:00:00.000Z").toISOString(),
    settings: { ...legacyState.settings, updatedAt: new Date("2026-07-16T00:00:00.000Z").toISOString() },
    sync: { ...legacyState.sync, remoteRevision: 7 }
  }));
  assert.equal(mergedWithRemote.settings.photoFrameImage, localMediaState.settings.photoFrameImage, "remote merges must preserve local photos");
  assert.equal(mergedWithRemote.settings.photoFrameTitle, localMediaState.settings.photoFrameTitle, "remote merges must preserve local photo titles");
  assert.equal(mergedWithRemote.settings.customWallpapers?.[0]?.id, "custom-private", "remote merges must preserve local wallpapers");
  assert.equal(mergedWithRemote.settings.city, "Hangzhou", "remote merges must preserve the device-local weather city");
  assert.equal(mergedWithRemote.settings.weatherUseLocation, true, "remote merges must preserve the device-local location preference");
  assert.equal(mergedWithRemote.shortcuts[0].iconUrl, localMediaState.shortcuts[0].iconUrl, "remote merges must preserve local shortcut icons");
  assert.equal(mergedWithRemote.shortcutFolders[0].iconUrl, localMediaState.shortcutFolders[0].iconUrl, "remote merges must preserve local folder icons");
  assert.equal(mergedWithRemote.sync.remoteRevision, 7, "remote revision must survive merges");

  const pulled = markPulled(localMediaState, { ...mergedWithRemote, sync: { ...mergedWithRemote.sync, remoteRevision: 9 } });
  assert.equal(pulled.sync.remoteRevision, 9, "pull metadata must retain the server revision");

  const emptyAccountBase = normalizeState({
    ...legacyState,
    shortcuts: [],
    settings: { ...legacyState.settings, theme: "light" },
    sync: { ...legacyState.sync, deviceId: "account-device", intervalSeconds: 120, remoteRevision: 9 }
  });
  const adoptedAnonymous = adoptPortableStateForAccount(localMediaState, emptyAccountBase);
  assert.equal(adoptedAnonymous.settings.theme, localMediaState.settings.theme, "a new account must keep the user's anonymous settings instead of empty account defaults");
  assert.equal(adoptedAnonymous.shortcuts[0].id, localMediaState.shortcuts[0].id, "a new account must carry anonymous shortcuts");
  assert.equal(adoptedAnonymous.settings.photoFrameImage, localMediaState.settings.photoFrameImage, "device-local media must survive account adoption on the same device");
  assert.equal(adoptedAnonymous.sync.deviceId, "account-device", "account adoption must retain the account device identity");
  assert.equal(adoptedAnonymous.sync.intervalSeconds, 120, "account adoption must retain account sync preferences");
  assert.equal(adoptedAnonymous.sync.remoteRevision, 9, "account adoption must retain the current remote revision");

  const existingAccount = normalizeState({
    ...emptyAccountBase,
    shortcuts: [{ ...legacyState.shortcuts[0], id: "account-shortcut", title: "账号网站" }],
    settings: { ...emptyAccountBase.settings, theme: "light" }
  });
  const portableWithMedia = normalizeState({
    ...localMediaState,
    shortcuts: [{ ...legacyState.shortcuts[0], id: "anonymous-shortcut", title: "未登录网站" }]
  });
  const mergedPortable = mergePortableStateIntoAccount(existingAccount, portableWithMedia);
  assert.equal(mergedPortable.shortcuts.some((shortcut) => shortcut.id === "account-shortcut"), true, "portable merge must preserve existing account records");
  assert.equal(mergedPortable.shortcuts.some((shortcut) => shortcut.id === "anonymous-shortcut"), true, "portable merge must carry anonymous records into an existing account");
  assert.equal(mergedPortable.settings.theme, "light", "anonymous defaults must not overwrite existing account preferences");
  assert.equal(mergedPortable.settings.photoFrameImage, localMediaState.settings.photoFrameImage, "portable merge must preserve device-local media on the current device");
  const portableWithNewerSettings = {
    ...portableWithMedia,
    settings: stampSettingsChanges(portableWithMedia.settings, {
      ...portableWithMedia.settings,
      city: "Osaka",
      navigationSide: "right"
    }, "2026-07-24T00:00:00.000Z"),
    updatedAt: "2026-07-24T00:00:00.000Z"
  };
  const mergedPortableSettings = mergePortableStateIntoAccount(existingAccount, portableWithNewerSettings);
  assert.equal(mergedPortableSettings.settings.city, "Osaka", "newer anonymous settings must be merged into an existing account");
  assert.equal(mergedPortableSettings.settings.navigationSide, "right", "anonymous layout settings must not disappear after sign-in");
  const userGoogleShortcut = normalizeState({
    ...legacyState,
    shortcuts: [{
      ...legacyState.shortcuts[0],
      id: "user-google",
      title: "Google",
      url: "https://www.google.com",
      groupId: "default"
    }]
  });
  assert.equal(userGoogleShortcut.shortcuts[0]?.id, "user-google", "normalization must never delete a user-created shortcut that resembles an old starter item");

  const firstNoteConflict = mergeRemote(
    normalizeState({
      ...legacyState,
      notes: [{ ...legacyState.notes[0], body: "设备 A 内容", updatedAt: "2026-07-24T00:00:00.000Z" }]
    }),
    normalizeState({
      ...legacyState,
      notes: [{ ...legacyState.notes[0], body: "设备 B 内容", updatedAt: "2026-07-24T00:01:00.000Z" }]
    })
  );
  const repeatedNoteConflict = mergeRemote(
    firstNoteConflict,
    normalizeState({
      ...legacyState,
      notes: [{ ...legacyState.notes[0], body: "设备 C 内容", updatedAt: "2026-07-24T00:02:00.000Z" }]
    })
  );
  assert.match(repeatedNoteConflict.notes[0]?.conflictBody || "", /设备 A 内容/, "repeated note conflicts must preserve the first alternate body");
  assert.match(repeatedNoteConflict.notes[0]?.conflictBody || "", /设备 B 内容/, "repeated note conflicts must preserve the later alternate body");
  const knownNoteBaseline = "2026-07-24T00:00:00.000Z";
  const sequentialNoteEdit = mergeRemote(
    normalizeState({
      ...legacyState,
      notes: [{ ...legacyState.notes[0], body: "本机顺序编辑", updatedAt: "2026-07-24T00:01:00.000Z" }],
      updatedAt: "2026-07-24T00:01:00.000Z",
      sync: { ...legacyState.sync, lastRemoteUpdatedAt: knownNoteBaseline }
    }),
    normalizeState({
      ...legacyState,
      notes: [{ ...legacyState.notes[0], body: "已见过的云端正文", updatedAt: knownNoteBaseline }],
      updatedAt: knownNoteBaseline
    })
  );
  assert.equal(sequentialNoteEdit.notes[0]?.body, "本机顺序编辑", "a local edit based on an already-seen cloud note must remain authoritative");
  assert.equal(sequentialNoteEdit.notes[0]?.conflictBody, undefined, "sequential note editing must not accumulate every previous body as a false conflict");
  const concurrentNoteEdit = mergeRemote(
    normalizeState({
      ...legacyState,
      notes: [{ ...legacyState.notes[0], body: "并发本机正文", updatedAt: "2026-07-24T00:02:00.000Z" }],
      updatedAt: "2026-07-24T00:02:00.000Z",
      sync: { ...legacyState.sync, lastRemoteUpdatedAt: knownNoteBaseline }
    }),
    normalizeState({
      ...legacyState,
      notes: [{ ...legacyState.notes[0], body: "并发云端正文", updatedAt: "2026-07-24T00:03:00.000Z" }],
      updatedAt: "2026-07-24T00:03:00.000Z"
    })
  );
  assert.match(concurrentNoteEdit.notes[0]?.conflictBody || "", /并发本机正文/, "genuine two-device note conflicts must preserve the alternate body");
  const largeBodyA = "A".repeat(300_000);
  const largeBodyB = "B".repeat(300_000);
  const largeBodyC = "C".repeat(300_000);
  const firstLargeConflict = mergeRemote(
    normalizeState({ ...legacyState, notes: [{ ...legacyState.notes[0], body: largeBodyA, updatedAt: "2026-07-24T00:03:00.000Z" }] }),
    normalizeState({ ...legacyState, notes: [{ ...legacyState.notes[0], body: largeBodyB, updatedAt: "2026-07-24T00:04:00.000Z" }] })
  );
  const repeatedLargeConflict = mergeRemote(
    firstLargeConflict,
    normalizeState({ ...legacyState, notes: [{ ...legacyState.notes[0], body: largeBodyC, updatedAt: "2026-07-24T00:05:00.000Z" }] })
  );
  assert.equal(repeatedLargeConflict.notes.some((note) => note.body === largeBodyA), true, "oversized conflict history must be preserved as a deterministic conflict-copy note");
  assert.doesNotThrow(() => validateAppStatePayload(repeatedLargeConflict, "large conflict state"), "conflict preservation must stay inside the closed state limits");
  assert.equal(isTerminalAuthError({ status: 401, message: "invalid JWT" }), true, "invalid authenticated sessions must switch to the anonymous partition");
  assert.equal(isTerminalAuthError(new TypeError("Failed to fetch")), false, "temporary network failures must not discard a cached account session");
  const untrustedUpdateManifest = await checkForUpdate(async () => Response.json({
    latestVersion: "9.9.9",
    minimumSupportedVersion: "0.6.0",
    dataSchemaVersion: 1,
    severity: "important",
    releaseNotesUrl: "https://attacker.invalid/release",
    updateUrl: "javascript:alert(1)"
  }));
  assert.equal(untrustedUpdateManifest.status, "available", "a valid update manifest must still report an available version");
  if (untrustedUpdateManifest.status === "available") {
    assert.equal(untrustedUpdateManifest.manifest.updateUrl, "https://github.com/Muggler77/whynavo/releases/latest", "untrusted update links must fall back to the official release page");
    assert.equal(untrustedUpdateManifest.manifest.releaseNotesUrl, undefined, "untrusted release-note links must not reach the interface");
  }
  const malformedUpdateManifest = await checkForUpdate(async () => Response.json({
    latestVersion: "latest",
    minimumSupportedVersion: "0.6.0",
    dataSchemaVersion: Number.MAX_SAFE_INTEGER,
    severity: "emergency"
  }));
  assert.equal(malformedUpdateManifest.status, "error", "malformed update metadata must fail closed");
  const oversizedUpdateManifest = await checkForUpdate(async () => new Response("{}", {
    headers: { "content-length": String(65 * 1024) }
  }));
  assert.equal(oversizedUpdateManifest.status, "error", "oversized update metadata must be rejected before parsing");
  const futureClock = "2030-01-01T00:00:00.000Z";
  normalizeState({ ...legacyState, updatedAt: futureClock });
  assert.ok(new Date(logicalNowIso()).getTime() > new Date(futureClock).getTime(), "logical mutation clocks must advance beyond timestamps already observed from another device");

  const deviceA = normalizeState({
    ...legacyState,
    shortcuts: [
      legacyState.shortcuts[0],
      { id: "device-a", title: "设备 A", url: "https://a.example", iconColor: "#14B8A6", pinned: false, order: 1, updatedAt: "2026-07-16T01:00:00.000Z" }
    ],
    updatedAt: "2026-07-16T01:00:00.000Z",
    sync: { ...legacyState.sync, remoteRevision: 10 }
  });
  const deviceB = normalizeState({
    ...legacyState,
    shortcuts: [
      legacyState.shortcuts[0],
      { id: "device-b", title: "设备 B", url: "https://b.example", iconColor: "#14B8A6", pinned: false, order: 2, updatedAt: "2026-07-16T02:00:00.000Z" }
    ],
    updatedAt: "2026-07-16T02:00:00.000Z",
    sync: { ...legacyState.sync, remoteRevision: 11 }
  });
  const concurrentMerge = mergeRemote(deviceA, deviceB);
  assert.deepEqual(
    concurrentMerge.shortcuts.map((shortcut) => shortcut.id).sort(),
    ["device-a", "device-b", "s1"],
    "concurrent writes on different records must merge without dropping either device"
  );
  assert.equal(concurrentMerge.sync.remoteRevision, 11, "concurrent merge must retain the newest server revision");
  const localPeerMerge = mergeLocalPeerState(deviceA, deviceB);
  assert.deepEqual(
    localPeerMerge.shortcuts.map((shortcut) => shortcut.id).sort(),
    ["device-a", "device-b", "s1"],
    "two tabs saving the same local account must retain changes from both tabs"
  );
  assert.equal(localPeerMerge.sync.remoteRevision, 11, "local peer merging must retain the newest known cloud revision");
  assert.equal(localStatesEquivalent(localPeerMerge, mergeLocalPeerState(deviceB, deviceA)), true, "local peer merges must converge regardless of save order");

  const tieClock = "2026-07-24T02:30:00.000Z";
  const tieDeviceA = normalizeState({
    ...deviceA,
    shortcuts: [{ ...legacyState.shortcuts[0], title: "同毫秒 A", updatedAt: tieClock }],
    updatedAt: tieClock
  });
  const tieDeviceB = normalizeState({
    ...deviceB,
    shortcuts: [{ ...legacyState.shortcuts[0], title: "同毫秒 B", updatedAt: tieClock }],
    updatedAt: tieClock
  });
  assert.equal(
    mergeRemote(tieDeviceA, tieDeviceB).shortcuts[0].title,
    mergeRemote(tieDeviceB, tieDeviceA).shortcuts[0].title,
    "same-millisecond record conflicts must converge to one deterministic result on every device"
  );
  const tieLocalPreferencesA = normalizeState({
    ...tieDeviceA,
    sync: { ...tieDeviceA.sync, deviceId: "same-browser-a", autoSync: false, intervalSeconds: 30 }
  });
  const tieLocalPreferencesB = normalizeState({
    ...tieDeviceB,
    sync: { ...tieDeviceB.sync, deviceId: "same-browser-b", autoSync: true, intervalSeconds: 120 }
  });
  assert.equal(
    localStatesEquivalent(
      mergeLocalPeerState(tieLocalPreferencesA, tieLocalPreferencesB),
      mergeLocalPeerState(tieLocalPreferencesB, tieLocalPreferencesA)
    ),
    true,
    "same-millisecond local sync preferences must converge regardless of IndexedDB transaction order"
  );

  const completedSync = markPushed(deviceA, 12);
  const editedWhileSyncing = normalizeState({
    ...deviceA,
    shortcuts: [
      ...deviceA.shortcuts,
      { id: "during-sync", title: "同步期间新增", url: "https://during.example", iconColor: "#14B8A6", pinned: false, order: 3, updatedAt: "2026-07-24T02:45:00.000Z" }
    ],
    updatedAt: "2026-07-24T02:45:00.000Z"
  });
  const reconciledAfterSync = reconcileCompletedSync(deviceA, completedSync, editedWhileSyncing);
  assert.equal(
    reconciledAfterSync.shortcuts.some((shortcut) => shortcut.id === "during-sync"),
    true,
    "a completed sync must not overwrite edits made while the network request was in flight"
  );
  assert.equal(reconciledAfterSync.sync.remoteRevision, 12, "in-flight edit reconciliation must retain the committed server revision");

  const settingsBase = normalizeState({
    ...legacyState,
    settings: {
      ...legacyState.settings,
      city: "Shanghai",
      widgets: { ...legacyState.settings.widgets, weather: true, notes: true },
      calendarRecords: { "2026-07-24": "基础日程" },
      customNavPages: [{ id: "page-1", name: "工作", groupId: "default", icon: "briefcase", order: 0, updatedAt: now }],
      updatedAt: now
    }
  });
  const settingsDeviceA = {
    ...settingsBase,
    settings: stampSettingsChanges(settingsBase.settings, {
      ...settingsBase.settings,
      theme: "light",
      widgets: { ...settingsBase.settings.widgets, weather: false }
    }, "2026-07-24T01:00:00.000Z"),
    updatedAt: "2026-07-24T01:00:00.000Z"
  };
  const settingsDeviceB = {
    ...settingsBase,
    settings: stampSettingsChanges(settingsBase.settings, {
      ...settingsBase.settings,
      city: "Tokyo",
      iconSize: 70,
      widgets: { ...settingsBase.settings.widgets, notes: false },
      calendarRecords: { ...settingsBase.settings.calendarRecords, "2026-07-25": "设备 B 日程" }
    }, "2026-07-24T02:00:00.000Z"),
    updatedAt: "2026-07-24T02:00:00.000Z"
  };
  const concurrentSettingsMerge = mergeRemote(settingsDeviceA, settingsDeviceB);
  assert.equal(concurrentSettingsMerge.settings.theme, "light", "different concurrent setting fields must both survive");
  assert.equal(concurrentSettingsMerge.settings.iconSize, 70, "newer unrelated setting fields must survive");
  assert.equal(concurrentSettingsMerge.settings.city, settingsDeviceA.settings.city, "weather cities must remain local to each device");
  assert.equal(concurrentSettingsMerge.settings.widgets.weather, false, "nested widget changes from device A must survive");
  assert.equal(concurrentSettingsMerge.settings.widgets.notes, false, "nested widget changes from device B must survive");
  assert.equal(concurrentSettingsMerge.settings.calendarRecords["2026-07-25"], "设备 B 日程", "nested calendar records must merge by date");
  const localSettingsMerge = mergeLocalPeerState(settingsDeviceA, settingsDeviceB);
  assert.equal(localSettingsMerge.settings.city, "Tokyo", "same-device peer merging must preserve the newest local weather choice");
  assert.equal(localSettingsMerge.settings.theme, "light", "same-device peer merging must retain unrelated settings from both tabs");
  const tiedSettingsA = {
    ...settingsBase,
    settings: stampSettingsChanges(settingsBase.settings, { ...settingsBase.settings, iconSize: 58 }, tieClock),
    updatedAt: tieClock
  };
  const tiedSettingsB = {
    ...settingsBase,
    settings: stampSettingsChanges(settingsBase.settings, { ...settingsBase.settings, iconSize: 72 }, tieClock),
    updatedAt: tieClock
  };
  assert.equal(
    mergeRemote(tiedSettingsA, tiedSettingsB).settings.iconSize,
    mergeRemote(tiedSettingsB, tiedSettingsA).settings.iconSize,
    "same-millisecond setting conflicts must converge deterministically"
  );
  const tiedNestedSettingsA = {
    ...settingsBase,
    settings: stampSettingsChanges(settingsBase.settings, {
      ...settingsBase.settings,
      widgets: { ...settingsBase.settings.widgets, weather: false },
      calendarRecords: { ...settingsBase.settings.calendarRecords, "2026-07-26": "同毫秒 A 日程" }
    }, tieClock),
    updatedAt: tieClock
  };
  const tiedNestedSettingsB = {
    ...settingsBase,
    settings: stampSettingsChanges(settingsBase.settings, {
      ...settingsBase.settings,
      widgets: { ...settingsBase.settings.widgets, weather: true },
      calendarRecords: { ...settingsBase.settings.calendarRecords, "2026-07-26": "同毫秒 B 日程" }
    }, tieClock),
    updatedAt: tieClock
  };
  const nestedTieFromA = mergeRemote(tiedNestedSettingsA, tiedNestedSettingsB);
  const nestedTieFromB = mergeRemote(tiedNestedSettingsB, tiedNestedSettingsA);
  assert.equal(
    nestedTieFromA.settings.widgets.weather,
    nestedTieFromB.settings.widgets.weather,
    "same-millisecond nested widget conflicts must converge deterministically"
  );
  assert.equal(
    nestedTieFromA.settings.calendarRecords["2026-07-26"],
    nestedTieFromB.settings.calendarRecords["2026-07-26"],
    "same-millisecond calendar conflicts must converge deterministically"
  );

  const deletedPageState = {
    ...settingsBase,
    settings: stampSettingsChanges(settingsBase.settings, {
      ...settingsBase.settings,
      customNavPages: settingsBase.settings.customNavPages.map((page) => ({
        ...page,
        deletedAt: "2026-07-24T03:00:00.000Z",
        updatedAt: "2026-07-24T03:00:00.000Z"
      }))
    }, "2026-07-24T03:00:00.000Z"),
    updatedAt: "2026-07-24T03:00:00.000Z"
  };
  const pageDeletionMerge = mergeRemote(settingsBase, deletedPageState);
  assert.equal(pageDeletionMerge.settings.customNavPages[0].deletedAt, "2026-07-24T03:00:00.000Z", "deleted custom pages must not be resurrected by another device");

  const restoreTarget = normalizeState({
    ...deviceA,
    shortcuts: [legacyState.shortcuts[0]],
    updatedAt: "2026-07-24T04:00:00.000Z"
  });
  const stampedRestore = stampStateSnapshot(deviceA, restoreTarget, "2026-07-24T04:00:00.000Z");
  const restoredShortcut = stampedRestore.shortcuts.find((shortcut) => shortcut.id === "device-a");
  assert.equal(restoredShortcut?.deletedAt, "2026-07-24T04:00:00.000Z", "restores must tombstone records removed from the restored snapshot");
  assert.equal(restoredShortcut?.updatedAt, "2026-07-24T04:00:00.000Z", "restores must stamp changed records with the restore time");
  const restoreMerge = mergeRemote(stampedRestore, deviceA);
  assert.equal(restoreMerge.shortcuts.find((shortcut) => shortcut.id === "device-a")?.deletedAt, "2026-07-24T04:00:00.000Z", "restore tombstones must win over stale remote records");

  assert.equal(normalizeHttpUrl("example.com"), "https://example.com/", "hostnames should normalize to HTTPS");
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), undefined, "script URLs must be rejected");
  assert.equal(normalizeHttpUrl("data:text/html,test"), undefined, "data URLs must be rejected for shortcuts");
  assert.equal(normalizeHttpUrl("https://user:secret@localhost"), undefined, "URLs containing embedded credentials must be rejected");
  assert.equal(safeHttpHref("file:///tmp/private"), "about:blank", "unsupported shortcut protocols must open a safe blank page");
  assert.deepEqual(
    parseImportText(JSON.stringify([null, { title: "安全导入", url: "https://import.example" }])).map((row) => row.title),
    ["安全导入"],
    "malformed null rows must be skipped without crashing the app"
  );
  const boundedImport = parseImportText(JSON.stringify([{
    title: "x".repeat(5000),
    url: "https://bounded.example",
    iconUrl: "javascript:alert(1)",
    groupName: "g".repeat(2000)
  }]))[0];
  assert.equal(boundedImport.title.length, 1000, "imported labels must be bounded before they enter app state");
  assert.equal(boundedImport.groupName?.length, 500, "imported group labels must be bounded before rendering");
  assert.equal(boundedImport.iconUrl, undefined, "imported icons must reject executable and unsupported URL schemes");
  assert.equal(
    parseImportText(JSON.stringify([{ title: "unsafe image", url: "https://safe.example", iconUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }]))[0]?.iconUrl,
    undefined,
    "imported inline SVG content must be rejected"
  );
  assert.equal(normalizeIconReference("javascript:alert(1)"), undefined, "manually entered icon references must reject script schemes");
  assert.equal(normalizeIconReference("http://example.com/icon.png"), undefined, "automatically loaded remote icons must reject plaintext HTTP");
  assert.equal(normalizeIconReference("https://user:secret@127.0.0.1/icon.png"), undefined, "icon references must reject embedded credentials");
  assert.equal(normalizeIconReference("https://example.com/icon.png"), "https://example.com/icon.png", "HTTPS icon references must remain supported");
  assert.equal(normalizeIconReference(`https://example.com/${"x".repeat(8192)}`), undefined, "remote icon URLs must have an independent memory-safe length limit");
  assert.equal(faviconHostFor("https://docs.example.com/page"), "docs.example.com", "public hostnames must remain eligible for automatic icon discovery");
  assert.equal(faviconHostFor("http://localhost:8080"), undefined, "localhost shortcut names must not be disclosed to favicon providers");
  assert.equal(faviconHostFor("https://192.168.1.1/admin"), undefined, "private IP shortcut names must not be disclosed to favicon providers");
  assert.equal(faviconHostFor("https://printer.local"), undefined, "special-use local hostnames must not be disclosed to favicon providers");
  assert.equal(faviconHostFor("https://intranet"), undefined, "single-label intranet hostnames must not be disclosed to favicon providers");
  assert.deepEqual(
    parseBookmarksHtml(`
      <!doctype netscape-bookmark-file-1>
      <a href="https://bookmarks.example/path?a=1&amp;b=2" icon="https://assets.example/icon.png">Docs &amp; Notes</a>
      <a href="javascript:alert(1)"><script>throw new Error("must not execute")</script>Unsafe</a>
      <a href='https://quoted.example/a>b'>Quoted</a>
    `),
    [
      {
        title: "Docs & Notes",
        url: "https://bookmarks.example/path?a=1&b=2",
        iconUrl: "https://assets.example/icon.png"
      },
      {
        title: "Quoted",
        url: "https://quoted.example/a%3Eb",
        iconUrl: undefined
      }
    ],
    "bookmark imports must use the inert tokenizer, preserve quoted attributes, decode text, and reject executable URLs"
  );
  assert.throws(
    () => parseBookmarksHtml(`<a href="https://large.example">${"x".repeat(8 * 1024 * 1024)}</a>`),
    /safe size limit/,
    "bookmark parsing must enforce its memory boundary even when called directly"
  );
  let deeplyNestedImport = { title: "过深目录", children: [{ title: "目标", url: "https://deep.example" }] };
  for (let depth = 0; depth < 40; depth += 1) deeplyNestedImport = { title: `目录 ${depth}`, children: [deeplyNestedImport] };
  assert.doesNotThrow(() => parseImportText(JSON.stringify([deeplyNestedImport])), "deeply nested imports must be bounded without recursive stack failures");
  assert.ok(parseImportText(JSON.stringify(Array.from({ length: MAX_IMPORTED_SHORTCUTS + 100 }, (_, index) => ({ title: `站点 ${index}`, url: `https://${index}.example` })))).length <= MAX_IMPORTED_SHORTCUTS, "imports must never exceed the reload-safe collection boundary");
  const deletedImportClock = "2026-07-24T05:00:00.000Z";
  const importedAroundTombstones = importedToShortcuts(
    [
      { title: "新分组网站", url: "https://new-group.example", groupName: "已删除分组" },
      { title: "新文件夹网站", url: "https://new-folder.example", groupName: "现有分组", folderName: "已删除文件夹" }
    ],
    [
      { id: "deleted-group", name: "已删除分组", color: "#14B8A6", order: 0, updatedAt: deletedImportClock, deletedAt: deletedImportClock },
      { id: "live-group", name: "现有分组", color: "#14B8A6", order: 1, updatedAt: deletedImportClock }
    ],
    0,
    [
      { id: "deleted-folder", name: "已删除文件夹", groupId: "live-group", iconColor: "#14B8A6", order: 0, updatedAt: deletedImportClock, deletedAt: deletedImportClock }
    ]
  );
  assert.notEqual(
    importedAroundTombstones.groups.find((group) => !group.deletedAt && group.name === "已删除分组")?.id,
    "deleted-group",
    "imports must not attach new shortcuts to a tombstoned group"
  );
  assert.notEqual(
    importedAroundTombstones.folders.find((folder) => !folder.deletedAt && folder.name === "已删除文件夹")?.id,
    "deleted-folder",
    "imports must not attach new shortcuts to a tombstoned folder"
  );

  const hardeningMigration = await readFile(join(repoRoot, "supabase/migrations/0006_harden_sync_boundaries.sql"), "utf8");
  assert.match(hardeningMigration, /p_name is distinct from 'primary'/, "sync RPC must reject unbounded snapshot names");
  assert.match(hardeningMigration, /current_user_id uuid := auth\.uid\(\)/, "sync RPC must bind writes to the authenticated user");
  assert.match(hardeningMigration, /revision = p_expected_revision/, "sync RPC must use optimistic revision checks");
  assert.match(hardeningMigration, /2097152/, "sync RPC must enforce a payload size limit");
  assert.match(hardeningMigration, /revoke all[\s\S]*public\.shortcut_groups/, "legacy direct access must remain disabled");

  const deleteAccountFunction = await readFile(join(repoRoot, "supabase/functions/delete-account/index.ts"), "utf8");
  assert.match(deleteAccountFunction, /req\.headers\.get\("authorization"\)/, "account deletion must require the caller's bearer token");
  assert.match(deleteAccountFunction, /auth\.getUser\(\)/, "account deletion must resolve the authenticated user on the server");
  assert.match(deleteAccountFunction, /auth\.signInWithPassword/, "account deletion must verify the current password on the server");
  assert.match(deleteAccountFunction, /options: \{ captchaToken \}/, "account deletion must consume a one-time CAPTCHA token on the server");
  assert.match(deleteAccountFunction, /EXTENSION_ORIGIN/, "account deletion CORS must be limited to the official web app and extension origins");
  assert.match(deleteAccountFunction, /Boolean\(origin && \(origin === OFFICIAL_WEB_ORIGIN \|\| EXTENSION_ORIGIN\.test\(origin\)\)\)/, "account deletion must reject requests that omit the browser origin");
  assert.doesNotMatch(deleteAccountFunction, /"access-control-allow-origin": "\*"/, "account deletion must not allow arbitrary browser origins");
  assert.match(deleteAccountFunction, /auth\.admin\.deleteUser\(userData\.user\.id\)/, "account deletion must only delete the authenticated user");
  assert.match(deleteAccountFunction, /userData\.user\.id !== expectedUserId/, "account deletion must reject a cross-tab account change before reauthentication");
  assert.doesNotMatch(deleteAccountFunction, /serviceRoleKey[^]*Response\.json/, "the service role key must never be returned to the client");
  const syncClientSource = await readFile(join(repoRoot, "extension/src/sync.ts"), "utf8");
  assert.match(syncClientSource, /signInWithPassword\(\{[\s\S]*email: currentUserData\.user\.email[\s\S]*password: currentPassword/, "normal password changes must reauthenticate the current email and password");
  assert.match(syncClientSource, /options: \{ captchaToken \}[\s\S]*verificationData\.user\?\.id !== currentUserData\.user\.id/, "password changes must consume a CAPTCHA token and stay bound to the current account");
  assert.match(syncClientSource, /current_password: currentPassword/, "normal password changes must send the current password to the server-enforced policy");
  assert.match(syncClientSource, /let supabase: SupabaseClient \| undefined[\s\S]*clearLocalAuthSession\(url\)[\s\S]*return false/, "local sign-out must clear the persisted session when the Auth client cannot load");
  assert.match(syncClientSource, /auth\.resend\(\{[\s\S]*type: "signup"[\s\S]*captchaToken/, "unverified users must be able to request another confirmation email through a fresh CAPTCHA");
  const authEmailFunction = await readFile(join(repoRoot, "supabase/functions/send-auth-email/index.ts"), "utf8");
  assert.match(authEmailFunction, /new Webhook\(hookSecret\)\.verify/, "Auth email requests must verify the Supabase hook signature");
  assert.match(authEmailFunction, /MAX_HOOK_BODY_BYTES/, "the public email hook must reject oversized unauthenticated request bodies");
  assert.match(authEmailFunction, /candidate\.origin === expected\.origin/, "Auth email redirects must stay on the official app origin");
  assert.match(authEmailFunction, /url\.protocol !== "https:"[\s\S]*url\.username[\s\S]*url\.password/, "email branding URLs must reject insecure or credential-bearing configuration");
  assert.match(authEmailFunction, /new URL\("icons\/icon128\.png", normalizedPublicAppUrl\)/, "email logo URLs must be built from a parsed trusted origin");
  assert.match(authEmailFunction, /url\.searchParams\.set\("token", tokenHash\)/, "Supabase verification URLs must pass the token hash through the endpoint's required token parameter");
  assert.doesNotMatch(authEmailFunction, /url\.searchParams\.set\("token_hash"/, "email links must not use an unsupported verification query parameter");
  assert.match(authEmailFunction, /new URL\("confirm\.html", normalizedPublicAppUrl\)[\s\S]*url\.hash = `confirmation_url=/, "one-time verification URLs must be isolated in a Pages URL fragment");
  assert.doesNotMatch(authEmailFunction, /no-reply@example\.com/, "production email code must not silently use a placeholder sender");
  assert.match(authEmailFunction, /password_changed_notification/, "the email hook must handle current Supabase account-security notifications");
  assert.match(authEmailFunction, /payload\.email_data\.old_email \|\| payload\.user\.email/, "email-change security notices must go to the previous address when Supabase provides it");
  assert.match(authEmailFunction, /secureEmailChange[\s\S]*token_hash_new[\s\S]*token_hash/, "secure email change must require both Supabase token hashes before sending two messages");
  assert.match(authEmailFunction, /emailChangeRecipient[\s\S]*token_new \|\| payload\.email_data\.token/, "single-message email change must use the new address and the available OTP");
  assert.match(authEmailFunction, /action === "email_change_new"[\s\S]*payload\.user\.new_email \|\| payload\.user\.email/, "split new-email confirmation events must be delivered to the new address");
  assert.match(authEmailFunction, /verification token is missing/, "verification requests without a token or token hash must fail closed");
  assert.match(authEmailFunction, /unsupported email action/, "unknown future email actions must fail closed instead of sending misleading messages");
  assert.match(authEmailFunction, /"idempotency-key": idempotencyKey/, "Auth email retries must not send duplicate messages");
  assert.match(authEmailFunction, /AbortSignal\.timeout\(3_500\)/, "the Auth email hook must finish before Supabase's HTTP Hook deadline");
  assert.match(authEmailFunction, /error:\s*\{\s*http_code: status,\s*message/, "Auth Hook failures must use Supabase's structured error response");
  assert.match(authEmailFunction, /Promise\.all\(deliveries\.map/, "secure email changes must send both required messages within one hook deadline");
  assert.match(authEmailFunction, /invalid hook payload/, "signed Auth Hook bodies must still receive strict structural validation");
  assert.match(authEmailFunction, /validRecipient/, "Auth email recipients must be bounded and validated before provider delivery");
  assert.match(authEmailFunction, /"cache-control": "no-store"/, "Auth email Hook responses must never be cached");
  const ratesFunction = await readFile(join(repoRoot, "supabase/functions/boc-rates/index.ts"), "utf8");
  assert.match(ratesFunction, /MAX_SOURCE_BYTES/, "the exchange-rate proxy must bound upstream response memory");
  assert.match(ratesFunction, /AbortSignal\.timeout/, "the exchange-rate proxy must time out an unavailable upstream");
  assert.match(ratesFunction, /req\.method !== "GET"/, "the exchange-rate proxy must reject unsupported methods");
  assert.match(ratesFunction, /SUPABASE_PUBLISHABLE_KEYS/, "the exchange-rate proxy must validate the project's current publishable client keys");
  assert.match(ratesFunction, /SUPABASE_SECRET_KEYS/, "the exchange-rate cache writer must support current rotatable server keys");
  assert.match(ratesFunction, /rows\.every\(validRateRow\)/, "the exchange-rate proxy must reject malformed upstream quote fields before caching");
  assert.match(ratesFunction, /validRatePayload\(data\?\.payload\)/, "the exchange-rate proxy must validate database cache contents before returning them");
  assert.match(ratesFunction, /let memoryCache:/, "the exchange-rate proxy must avoid one database read for every warm-isolate request");
  assert.doesNotMatch(ratesFunction, /!origin\s*\|\|/, "the exchange-rate proxy must reject requests that omit the browser origin");
  assert.doesNotMatch(ratesFunction, /"access-control-allow-origin": "\*"/, "the exchange-rate proxy must not allow arbitrary browser origins");
  const weatherSource = await readFile(join(repoRoot, "extension/src/weather.ts"), "utf8");
  assert.match(weatherSource, /MAX_WEATHER_RESPONSE_BYTES/, "weather responses must have a bounded client memory footprint");
  assert.match(weatherSource, /WEATHER_REQUEST_TIMEOUT_MS/, "weather requests must not hang the page indefinitely");
  assert.match(weatherSource, /finiteInRange/, "weather and coordinate payloads must be validated before caching or rendering");
  const ratesClientSource = await readFile(join(repoRoot, "extension/src/rates.ts"), "utf8");
  assert.match(ratesClientSource, /MAX_RATES_RESPONSE_BYTES/, "rate responses must have a bounded client memory footprint");
  assert.match(ratesClientSource, /RATES_REQUEST_TIMEOUT_MS/, "rate requests must not hang the page indefinitely");
  assert.match(ratesClientSource, /isRatesState/, "remote and cached rate payloads must be validated before rendering");
  assert.doesNotMatch(ratesClientSource, /authorization:\s*`Bearer \$\{anonKey\}`/, "publishable API keys must not be sent as legacy Bearer JWTs");

  const extensionManifest = JSON.parse(await readFile(join(repoRoot, "extension/public/manifest.json"), "utf8"));
  const packageManifest = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const latestVersionManifest = JSON.parse(await readFile(join(repoRoot, "extension/public/latest-version.json"), "utf8"));
  assert.equal(extensionManifest.version, packageManifest.version, "extension manifest version must match the workspace release");
  assert.equal(latestVersionManifest.latestVersion, packageManifest.version, "hosted version manifest must match the workspace release");
  assert.equal(latestVersionManifest.minimumSupportedVersion, packageManifest.version, "minimum sync version must match this security release");
  assert.match(latestVersionManifest.updateUrl, /\/releases\/latest$/, "extension update checks must lead ordinary users to the latest downloadable release");
  assert.equal(extensionManifest.permissions.includes("storage"), false, "unused extension storage permission must not be requested");
  assert.equal(extensionManifest.permissions.includes("alarms"), false, "unused extension alarms permission must not be requested");
  assert.equal(extensionManifest.permissions.includes("geolocation"), false, "precise location must not be requested from every user at installation");
  assert.equal(extensionManifest.optional_permissions?.includes("geolocation"), true, "precise location must remain available as an explicit optional permission");
  assert.equal(extensionManifest.permissions.includes("search"), true, "new-tab web search must use the browser default provider through the Search API");
  assert.equal(extensionManifest.host_permissions.includes("https://api.pwnedpasswords.com/*"), true, "the extension must allow the privacy-preserving leaked-password range check");
  assert.match(
    extensionManifest.content_security_policy?.extension_pages || "",
    /frame-src https:\/\/whynavo\.pages\.dev/,
    "the extension must allow only the official hosted CAPTCHA frame"
  );
  const captchaClient = await readFile(join(repoRoot, "extension/public/captcha.js"), "utf8");
  assert.doesNotMatch(captchaClient, /postMessage\([^)]*,\s*["']\*["']\)/, "CAPTCHA tokens must not be broadcast to arbitrary origins");
  assert.doesNotMatch(captchaClient, /addEventListener\(["']message["']/, "the sandboxed CAPTCHA document must remain write-only toward its validated parent");
  assert.doesNotMatch(captchaClient, /localhost|127\.0\.0\.1/, "the production CAPTCHA bridge must not trust local development origins");
  const captchaFrame = await readFile(join(repoRoot, "extension/src/TurnstileChallenge.tsx"), "utf8");
  assert.match(captchaFrame, /event\.source !== frameRef\.current\?\.contentWindow/, "CAPTCHA results must come from the expected iframe");
  assert.match(captchaFrame, /event\.origin !== "null"/, "sandboxed CAPTCHA results must come from an opaque iframe origin");
  assert.doesNotMatch(captchaFrame, /postMessage\(/, "CAPTCHA resets must reload the isolated iframe instead of targeting an opaque origin with a wildcard");
  assert.doesNotMatch(captchaFrame, /sandbox="[^"]*allow-same-origin/, "third-party CAPTCHA scripts must not share the app origin");
  assert.match(captchaFrame, /15_000/, "the CAPTCHA panel must not remain in an indefinite loading state");
  assert.match(captchaFrame, /重新加载安全验证/, "users must be able to recover from a CAPTCHA loading failure");
  const confirmationPage = await readFile(join(repoRoot, "extension/public/confirm.html"), "utf8");
  const confirmationClient = await readFile(join(repoRoot, "extension/public/confirm.js"), "utf8");
  assert.doesNotMatch(confirmationPage, /auth\/v1\/verify|token_hash|confirmation_url=/, "the static confirmation document must never embed a verification target or token");
  assert.match(confirmationClient, /candidate\.origin !== SUPABASE_ORIGIN[\s\S]*candidate\.pathname !== "\/auth\/v1\/verify"/, "the confirmation page must restrict verification to the reviewed Supabase endpoint");
  assert.match(confirmationClient, /allowedParameters = new Set\(\["token", "type", "redirect_to"\]\)/, "the confirmation page must allow only the exact Supabase verification parameters");
  assert.match(confirmationClient, /event\.isTrusted[\s\S]*window\.location\.replace\(verificationUrl\)/, "verification must require a trusted user click and avoid retaining the token page in history");
  const serviceWorker = await readFile(join(repoRoot, "extension/public/sw.js"), "utf8");
  assert.match(serviceWorker, new RegExp(`whynavo-shell-v${packageManifest.version.replaceAll(".", "\\.")}`), "Service Worker cache must be versioned with the release");
  assert.match(serviceWorker, /captcha\.html/, "the Service Worker must explicitly handle the CAPTCHA page");
  assert.match(serviceWorker, /confirm\.html/, "the Service Worker must not replace the email-confirmation page with an offline app shell");
  assert.match(serviceWorker, /cacheKey = isAppShell \? "\.\/" : request/, "document navigation must not overwrite the home-page cache");
  assert.match(serviceWorker, /MAX_SHELL_CACHE_VERSIONS = 2/, "the Service Worker must retain one prior app shell for in-flight upgrade safety");
  assert.match(serviceWorker, /asset-manifest\.json[\s\S]*manifestAssets/, "the installed web app must precache lazy code chunks needed for offline editing");
  assert.match(serviceWorker, /filter\(\(key\) => key\.startsWith\(SHELL_CACHE_PREFIX\)\)[\s\S]*sort\(compareCacheVersions\)[\s\S]*slice\(0, MAX_SHELL_CACHE_VERSIONS\)/, "old hosted clients must keep their versioned lazy assets during a production cutover");
  assert.match(serviceWorker, /matchCurrentThenPreviousShell[\s\S]*currentCache\.match\(request\)[\s\S]*if \(currentMatch\) return currentMatch[\s\S]*key !== CACHE_NAME/, "the current app shell must win over a retained older cache after an upgrade");
  assert.doesNotMatch(serviceWorker, /caches\.match\(isAppShell \? "\.\/" : request\)/, "navigation fallback must not use cache-global insertion order");
  assert.doesNotMatch(serviceWorker, /caches\.match\(request\)\.then\(\(cached\)/, "static assets must not use cache-global insertion order");
  assert.match(serviceWorker, /if \(response\.ok\)[\s\S]*cache\.put\(cacheKey, copy\)/, "failed navigation responses must never replace the offline app shell");
  const appSource = await readFile(join(repoRoot, "extension/src/App.tsx"), "utf8");
  const appHtml = await readFile(join(repoRoot, "extension/index.html"), "utf8");
  const releaseNotes = await readFile(join(repoRoot, "docs/releases/0.6.0.md"), "utf8");
  const syncSource = await readFile(join(repoRoot, "extension/src/sync.ts"), "utf8");
  const updatesSource = await readFile(join(repoRoot, "extension/src/updates.ts"), "utf8");
  assert.match(
    String(extensionManifest.content_security_policy?.extension_pages || ""),
    /object-src 'none'; base-uri 'self'/,
    "extension pages must reject object embedding and injected base URLs"
  );
  assert.match(appSource, /sharedIconObserver/, "shortcut icons must share one visibility observer instead of allocating one per icon");
  assert.match(appSource, /RESOLVED_ICON_CACHE_KEY_PREFIX[\s\S]*user:\$\{userId\}/, "resolved icon choices must be stored in an account-scoped cache");
  assert.match(appSource, /cleanupDeletedAccountData[\s\S]*deleteResolvedIconCacheForAccount\(userId\)/, "permanent account deletion must remove that account's resolved icon cache");
  assert.match(appSource, /SHORTCUT_RENDER_BATCH = 48/, "large shortcut collections must render in mobile-safe batches instead of mounting every image at startup");
  assert.match(appSource, /ICON_LOAD_TIMEOUT_MS = 5000/, "slow mobile networks must have enough time to load a sharp icon before trying the fallback chain");
  assert.match(appSource, /ICON_FAILURE_RETRY_MS = 6 \* 60 \* 60 \* 1000/, "failed icon chains must be cached temporarily instead of refetched on every launch");
  assert.match(appSource, /FAILED_ICON_CACHE_PREFIX[\s\S]*isFreshFailedIconCache/, "failed icon chains must expire and retry instead of becoming permanent");
  assert.match(appSource, /MIN_SHARP_ICON_SIZE = 96/, "raster icons must be large enough to remain sharp at the maximum rendered shortcut size");
  assert.match(appSource, /scheduleResolvedIconCachePersist\(\)/, "resolved icon choices must be persisted in batches instead of blocking every image load");
  assert.match(appSource, /window\.addEventListener\("pagehide", persistBeforeExit\)/, "pending resolved icon cache writes must flush before the page is discarded");
  assert.match(appSource, /\.\.\.directCandidates\.map/, "automatic icon discovery must try every supported high-resolution site icon path");
  assert.match(appSource, /requestDeviceLocationPermission\(\)[\s\S]*未授予定位权限/, "the extension must request optional location access only after an explicit settings action");
  assert.match(appSource, /priorityTimeZoneOptions[\s\S]*matchingTimeZones\.slice\(0, 100\)/, "time-zone selection must not mount every world time zone when it first opens");
  assert.match(appSource, /ShortcutRenderSentinel/, "shortcut batches must continue loading as the user approaches the end of the visible grid");
  assert.match(appSource, /hasLocalCandidate\s*\? `local:/, "large inline icons must not be copied into persistent cache keys");
  assert.doesNotMatch(appSource, /directCandidates\[1\]/, "icon fallback chains must remain bounded for predictable loading time");
  assert.match(appSource, /onPointerLeave=\{scheduleNavigationClose\}/, "auto-hidden navigation must have an explicit delayed close boundary");
  assert.match(appSource, /validateAppStatePayload\(snapshot\.state, "同步恢复点"\)/, "sync restore points must be validated before use");
  assert.match(appSource, /PASSWORD_RECOVERY/, "password recovery links must open the password update workflow");
  assert.match(appSource, /passwordRecovery=\{passwordRecovery\}/, "the account dialog must receive password recovery state");
  assert.match(appSource, /const \[passwordRecovery, setPasswordRecovery\] = useState\(false\)/, "URL parameters alone must never grant password-recovery privileges");
  assert.match(appSource, /recoveryLinkAttemptRef = useRef\(hasPasswordRecoveryMarker\(\)\)/, "recovery URL markers may only track an attempted callback");
  assert.match(appSource, /signupVerificationRef\.current \? "邮箱已验证，正在初始化账号数据"/, "email verification startup must activate the account through anonymous-data adoption");
  assert.match(appSource, /if \(user && authVerifiedOnline\)[\s\S]*?activeUserIdRef\.current = undefined;[\s\S]*?activateSignedInUser/, "online startup must preserve anonymous context until account activation can adopt it");
  assert.match(
    appSource,
    /user && !authVerifiedOnline && !accountState\.existed[\s\S]*pendingOfflineUserRef\.current = user[\s\S]*activeUserIdRef\.current = undefined/,
    "offline startup without a real account partition must keep account data hidden until the cloud account can be verified"
  );
  assert.match(
    appSource,
    /const pendingUser = pendingOfflineUserRef\.current[\s\S]*getUser\([\s\S]*activateSignedInUser\(verifiedUser, "网络已恢复，正在安全加载账号数据"\)/,
    "network recovery must authenticate and activate a pending account instead of synchronizing an empty placeholder"
  );
  assert.match(syncSource, /signInWithPassword\(\{[\s\S]*password: currentPassword[\s\S]*options: \{ captchaToken \}/, "signed-in password changes must reauthenticate with the current password and a fresh CAPTCHA token");
  assert.match(syncSource, /clientPromises\.delete\(key\)/, "a failed lazy Supabase client load must remain retryable");
  assert.match(syncSource, /deviceId: state\.sync\?\.deviceId \|\| uid\(\)/, "device-ID recovery must retain the compatibility fallback used on older mobile browsers");
  assert.doesNotMatch(syncSource, /deviceId: state\.sync\?\.deviceId \|\| crypto\.randomUUID\(\)/, "state normalization must not require crypto.randomUUID support");
  assert.match(updatesSource, /typeof AbortSignal\.timeout === "function"[\s\S]*new AbortController\(\)/, "update checks must retain timeout protection on older mobile browsers");
  assert.match(syncSource, /normalizeStoredImageReference[\s\S]*url\.protocol === "https:"/, "legacy plaintext image references must be removed during state normalization");
  assert.match(syncSource, /shortcuts: \(state\.shortcuts \|\| \[\]\)\.map[\s\S]*normalizeStoredImageReference\(shortcut\.iconUrl, true\)/, "legacy shortcut records must survive while insecure icon references are removed");
  assert.match(syncSource, /photoFrameImage: normalizeStoredImageReference\(state\.settings\.photoFrameImage\)/, "legacy photo-frame images must use the same secure normalization boundary");
  assert.match(syncSource, /signOutEverywhere[\s\S]*scope: "global"/, "users must have a separate way to revoke sessions on every device");
  assert.match(appSource, /退出所有设备[\s\S]*onSignOutAll/, "the account panel must expose global session revocation separately from local sign-out");
  assert.match(syncSource, /getEphemeralSupabase[\s\S]*persistSession: false[\s\S]*autoRefreshToken: false/, "current-password verification must not replace the persistent account session");
  assert.match(syncSource, /confirmedUserData\.user\?\.id !== currentUserData\.user\.id/, "password changes must recheck the persistent account after isolated credential verification");
  assert.match(syncSource, /updateClient = verificationClient[\s\S]*updateClient\.auth\.updateUser/, "normal password changes must update the isolated, reauthenticated account instead of a cross-tab mutable session");
  assert.match(syncSource, /finally \{[\s\S]*verificationClient\?\.auth\.signOut\(\{ scope: "local" \}\)/, "temporary password-verification sessions must be revoked on success and failure");
  assert.match(syncSource, /data\.user\?\.id !== expectedUserId/, "password updates must verify that the server changed the account that was reauthenticated");
  assert.match(syncSource, /if \(expectedUserId\)[\s\S]*supabase\.auth\.getUser\(\)[\s\S]*confirmedUserData\.user\?\.id !== expectedUserId/, "password updates must recheck the visible persistent account after the isolated update");
  assert.match(syncSource, /body: \{ expectedUserId, password, captchaToken \}/, "account deletion must bind the request to the account shown by the client");
  assert.match(appSource, /const leaveAccount = async[\s\S]*mergeAndSaveStateForAccount\(current, signingOutUserId\)[\s\S]*已取消退出/, "sign-out must preserve concurrent local edits and stop before hiding data when durable storage fails");
  assert.match(
    appSource,
    /outgoingPersistenceFailed = true[\s\S]*activeUserIdRef\.current = previousUserId[\s\S]*pendingOfflineUserRef\.current = user[\s\S]*当前数据只保留在内存中/,
    "a failed outgoing-account save must retain recoverable in-memory data, pause synchronization, and retry the pending account activation"
  );
  assert.match(
    appSource,
    /type: "account-signed-out"[\s\S]*userId: signingOutUserId/,
    "local sign-out must notify every open whynavo tab on the same browser device"
  );
  assert.match(
    appSource,
    /message\.type === "account-signed-out"[\s\S]*transitionToAnonymousState/,
    "a same-device sign-out notification must safely persist and hide the active account in peer tabs"
  );
  assert.match(appSource, /authMode === "signup" && !legalConsent/, "registration must require explicit acceptance of the public legal documents");
  assert.match(appSource, /const MIN_PASSWORD_LENGTH = 12;/, "public registration and password changes must enforce the documented 12-character minimum");
  assert.match(appSource, /isStrongPassword[\s\S]*\/\[a-z\]\/[\s\S]*\/\[A-Z\]\/[\s\S]*\/\[0-9\]\//, "public password forms must match the server's lowercase, uppercase, and numeric requirements");
  assert.match(syncClientSource, /lastRemoteUpdatedAt: normalizedRemote\.sync\.lastRemoteUpdatedAt \|\| normalizedRemote\.updatedAt/, "sync conflict baselines must prefer the server-observed remote timestamp");
  assert.match(syncSource, /terms_version: LEGAL_DOCUMENT_VERSION/, "registration must attach the accepted legal-document version to the Auth user");
  assert.match(appSource, /passwordRecovery \? undefined : currentPassword/, "recovery sessions must remain distinct from signed-in password changes");
  assert.match(appSource, /newPassword !== confirmNewPassword/, "password updates must reject a mistyped confirmation before changing credentials");
  assert.match(
    appSource,
    /shell && shell\.scrollHeight > shell\.clientHeight \+ 1[\s\S]*document\.scrollingElement/,
    "wheel page switching must respect the actual mobile shell scroll container"
  );
  assert.doesNotMatch(
    appHtml,
    /dns-prefetch[^>]+(?:cdn\.simpleicons\.org|icons\.duckduckgo\.com|www\.google\.com)/,
    "disabled remote icon lookup must not pre-resolve third-party icon providers"
  );
  assert.equal(appSource.includes("const cssImageUrl ="), true, "dynamic images must use a dedicated CSS URL serializer");
  assert.equal(appSource.includes('"--wallpaper-image": cssImageUrl(activeWallpaper)'), true, "dynamic wallpaper CSS URLs must use the escaped URL serializer");
  assert.match(appSource, /"--photo-image": cssImageUrl\(image\)/, "dynamic photo CSS URLs must use the same escaped URL serializer");
  const uiCss = await readFile(join(repoRoot, "extension/src/ui-v040.css"), "utf8");
  assert.match(uiCss, /\.overlay\s*\{[\s\S]*?overflow: hidden;/, "dialog overlays must not steal scroll from their content panes");
  assert.match(uiCss, /\.dialog\s*\{[\s\S]*?overflow: clip;/, "dialog headers must remain fixed while content scrolls");
  assert.doesNotMatch(uiCss, /page-nav-auto-trigger:hover\s*~\s*\.page-nav/, "auto-hidden navigation must not combine CSS hover state with React state");
  assert.match(uiCss, /\.page-nav-auto-trigger\s*\{[\s\S]*?z-index: calc\(var\(--wt-z-nav\) \+ 1\);/, "the auto-hide trigger must stay above the moving navigation to prevent click-through");
  const dbSource = await readFile(join(repoRoot, "extension/src/db.ts"), "utf8");
  assert.match(
    dbSource,
    /if \(abandoned\) \{\s*db\.close\(\);\s*return;/,
    "a database connection that succeeds after a blocked open must be closed instead of leaked"
  );
  assert.match(
    dbSource,
    /if \(dbPromise === openingPromise\) dbPromise = undefined;/,
    "an old IndexedDB callback must not clear a newer cached connection promise"
  );
  assert.match(dbSource, /if \(!stored\) return defaultState\(\);/, "a missing account partition must not be persisted as real account data before cloud recovery");
  assert.match(dbSource, /CORRUPT_STATE_BACKUP_KEY/, "malformed local state must be preserved in an account-scoped recovery record");
  assert.match(dbSource, /validateAppStatePayload\(normalizeState\(stored\), "本机数据"\)/, "local state must receive full structural validation before migration and rendering");
  assert.match(dbSource, /existed: Boolean\(stored\) && !recovered/, "quarantined account state must not be merged back into cloud data as a valid local snapshot");
  assert.match(dbSource, /export async function hasLegacyUnscopedState/, "legacy local state must be detectable without loading it into an account");
  assert.match(dbSource, /export async function adoptLegacyStateForAccount/, "legacy local state must have an explicit account-adoption path");
  assert.doesNotMatch(dbSource, /const legacyStored = !userId && !scopedStored/, "anonymous startup must not auto-adopt the pre-isolation global state");
  assert.match(dbSource, /adoptLegacyStateForAccount[\s\S]*store\.delete\(STATE_KEY\)/, "legacy state must be deleted only by the explicit adoption transaction");
  assert.match(dbSource, /adoptLegacyStateForAccount[\s\S]*deletedAccountMarkerKey\(userId\)[\s\S]*blockedByDeletion/, "legacy adoption must honor account deletion markers");
  assert.match(dbSource, /commitAnonymousStateAdoption[\s\S]*store\.put\(state, accountStateKey\(userId\)\);[\s\S]*store\.put\(emptyAnonymousState, ANONYMOUS_STATE_KEY\)/, "anonymous data adoption must save the account copy and clear the consumed anonymous partition atomically");
  assert.match(
    appSource,
    /commitAnonymousStateAdoption\([\s\S]*?localFallback,[\s\S]*?user\.id,[\s\S]*?normalizeState\(defaultState\(\)\)[\s\S]*?anonymousAdopted = true[\s\S]*?pullSnapshot\(next, user\.id\)/,
    "anonymous data must be atomically assigned to the account before any remote pull or upload"
  );
  assert.match(
    appSource,
    /localFallback[\s\S]*\(!finalAnonymousCommitRequired \|\| finalAnonymousCommitCompleted\)[\s\S]*\(localStateExisted \|\| \(shouldCarryAnonymousData && anonymousAdopted\) \|\| finalAnonymousCommitCompleted\)/,
    "account activation may use a local fallback only when real account data exists or anonymous data was durably consumed"
  );
  assert.match(
    appSource,
    /stateRef\.current\.updatedAt !== previousState\.updatedAt[\s\S]*mergePortableStateIntoAccount\(next, latestAnonymous\)[\s\S]*commitAnonymousStateAdoption\([\s\S]*next,[\s\S]*user\.id,[\s\S]*normalizeState\(defaultState\(\)\)[\s\S]*finalAnonymousCommitCompleted = true/,
    "anonymous edits made while account activation is in flight must be assigned and consumed atomically before the account becomes visible"
  );
  assert.match(dbSource, /accountScopedKey\(WEATHER_KEY, userId\)/, "cached location and weather data must be account scoped");
  assert.match(
    dbSource,
    /mergeAndSaveStateForAccount[\s\S]*transaction\(STORE, "readwrite"\)[\s\S]*store\.get\(accountStateKey\(userId\)\)[\s\S]*mergeLocalPeerState\(state, stored\)[\s\S]*store\.put\(merged, accountStateKey\(userId\)\)/,
    "ordinary local saves must merge inside one IndexedDB transaction so concurrent tabs cannot overwrite each other"
  );
  assert.match(
    dbSource,
    /deletedAccountMarkerKey[\s\S]*mergeAndSaveStateForAccount[\s\S]*markerRequest[\s\S]*blockedByDeletion/,
    "a deleted account marker must block stale tabs from recreating account data"
  );
  assert.equal(weatherSource.includes("google.com/search"), false, "weather source links must not disclose location coordinates to an additional search provider");
  assert.match(weatherSource, /sourceUrl: "https:\/\/open-meteo\.com\/"/, "weather cards must link only to the declared forecast provider");
  assert.match(
    weatherSource,
    /getCachedWeather[\s\S]*return \{\s*\.\.\.weather,\s*sourceUrl: "https:\/\/open-meteo\.com\/"\s*\}/,
    "cached weather from older releases must migrate away from coordinate-bearing source links immediately"
  );
  assert.match(dbSource, /deleteLocalAccountData[\s\S]*accountStateKey\(userId\)[\s\S]*accountScopedKey\(WEATHER_KEY, userId\)[\s\S]*sync-restore-point[\s\S]*MIGRATION_BACKUP_KEY[\s\S]*CORRUPT_STATE_BACKUP_KEY[\s\S]*deletedAccountMarkerKey\(userId\)/, "permanent account deletion must remove all account-scoped IndexedDB data and atomically install a non-resurrection marker");
  assert.match(
    appSource,
    /markLocalAccountDeletionPending\(deletingUserId\)[\s\S]*deleteAccount\(/,
    "account deletion must persist an account-scoped cleanup marker before the irreversible server request"
  );
  assert.match(
    appSource,
    /error instanceof AccountDeletionRejectedError[\s\S]*clearLocalAccountDeletionPending\(deletingUserId\)/,
    "an explicitly rejected server deletion must remove its retry marker instead of deleting valid account data later"
  );
  assert.match(
    appSource,
    /error instanceof AccountDeletionOutcomeUnknownError[\s\S]*pendingAccountDeletionIdsRef\.current[\s\S]*transitionToAnonymousState\(/,
    "an ambiguous server deletion result must retain the account-scoped marker and immediately hide account data"
  );
  assert.match(
    syncSource,
    /status !== undefined && status >= 400 && status < 500[\s\S]*AccountDeletionRejectedError[\s\S]*AccountDeletionOutcomeUnknownError/,
    "account deletion must distinguish explicit rejection from an unknown network or server outcome"
  );
  assert.match(
    dbSource,
    /pendingAccountDeletionKey\(userId\)[\s\S]*readPendingLocalAccountDeletionIds[\s\S]*PENDING_ACCOUNT_DELETION_PREFIX/,
    "crash recovery must identify only the account whose deletion was requested"
  );
  assert.match(
    appSource,
    /resolvePendingAccountDeletionForVerifiedUser[\s\S]*includes\(verifiedUserId\)[\s\S]*clearLocalAccountDeletionPending\(verifiedUserId\)[\s\S]*filter\(\(pendingUserId\) => pendingUserId !== verifiedUserId\)/,
    "crash recovery must preserve an account that still exists and clear only that account's deletion marker"
  );
  assert.match(
    appSource,
    /finishPendingAccountDeletionAfterTerminalAuth[\s\S]*candidateUserId[\s\S]*pendingUserId === candidateUserId[\s\S]*Promise\.allSettled\(candidates\.map\(cleanupDeletedAccountData\)\)[\s\S]*completed\.has\(pendingUserId\)/,
    "terminal Auth recovery must clean the matching pending account, or every explicitly pending partition when no session identity remains"
  );
  assert.match(
    appSource,
    /resolvePendingAccountDeletionForVerifiedUser[\s\S]*clearLocalDeletedAccountMarkerForVerifiedUser\(verifiedUserId\)/,
    "a positively verified account must be able to recover after a previously ambiguous local cleanup"
  );
  assert.doesNotMatch(
    appSource,
    /finishPendingAccountDeletionAfterTerminalAuth[\s\S]{0,800}deleteAllLocalAccountData/,
    "an ambiguous deletion must never destroy a different or unverifiable account partition"
  );
  assert.match(
    appSource,
    /if \(!verifiedUser\) \{[\s\S]*finishPendingAccountDeletionAfterTerminalAuth\([\s\S]*activeUserIdRef\.current \|\| pendingOfflineUserRef\.current\?\.id[\s\S]*persistPrevious: !pendingDeletionFinished/,
    "a confirmed empty Auth session must finish explicitly pending local deletion without persisting the hidden account again"
  );
  assert.match(
    appSource,
    /event !== "SIGNED_OUT"[\s\S]*finishPendingAccountDeletionAfterTerminalAuth\(candidateUserId\)[\s\S]*persistPrevious: !pendingDeletionFinished/,
    "a terminal Auth broadcast must immediately finish explicitly pending account cleanup"
  );
  assert.doesNotMatch(
    releaseNotes,
    /non-identifying marker|removes all account partitions/,
    "release notes must not describe the retired global account-cleanup design"
  );
  assert.match(
    appSource,
    /user && pendingAccountDeletionIdsRef\.current\.includes\(user\.id\)[\s\S]*waitingForAccountRecovery = true[\s\S]*loadStateForAccount\(\)/,
    "offline startup must hide only the account with an unresolved deletion instead of blocking unrelated accounts"
  );
  assert.match(
    appSource,
    /\["state-saved", "account-deleted", "account-signed-out"\]\.includes[\s\S]*message\.type === "account-deleted"[\s\S]*cleanupDeletedAccountData\(messageUserId\)/,
    "account deletion must clear every open same-origin whynavo tab"
  );
  assert.match(
    appSource,
    /message\.type === "account-signed-out"[\s\S]*messageUserId !== activeUserIdRef\.current[\s\S]*transitionToAnonymousState\(/,
    "a local sign-out must hide account data in every open same-origin whynavo tab"
  );
  assert.match(
    appSource,
    /type: "account-signed-out"[\s\S]*userId: signingOutUserId/,
    "sign-out must notify every open same-origin whynavo tab even when Auth is offline"
  );
  assert.match(appSource, /setWeather\(undefined\)/, "account transitions must immediately remove the previous account's visible weather");
  assert.match(appSource, /handleTerminalAuthFailure\(error, current\)/, "terminal Auth failures during automatic sync must switch away from account data");
  assert.match(
    appSource,
    /if \(!user\) \{\s*await transitionToAnonymousState\("登录会话已失效"/,
    "an empty Auth response during automatic sync must hide account data immediately"
  );
  assert.match(appSource, /handleTerminalAuthFailure\(error, stateRef\.current\)/, "terminal Auth failures during manual sync must switch away from account data");
  assert.match(
    appSource,
    /const syncOperation = Symbol\("auto-sync"\)[\s\S]*syncLockRef\.current = syncOperation[\s\S]*syncLockRef\.current === syncOperation/,
    "an obsolete automatic sync task must not release a newer account's synchronization lock"
  );
  assert.match(
    appSource,
    /const syncOperation = Symbol\("manual-sync"\)[\s\S]*syncLockRef\.current = syncOperation[\s\S]*syncLockRef\.current === syncOperation/,
    "an obsolete manual sync task must not release a newer account's synchronization lock"
  );
  assert.match(syncSource, /clearLocalAuthSession\(url\)[\s\S]*scope: "local"/, "offline sign-out must clear the persisted local session before retrying a local-only sign-out");
  assert.match(syncSource, /clearLocalAuthSession\(url\)[\s\S]*scope: "local"[\s\S]*return false/, "failed remote sign-out must still complete the local account transition");
  assert.match(appSource, /serverSessionRevoked[\s\S]*本机已安全退出；网络异常/, "global sign-out failure must still hide the current device's account data and explain the remaining server-session risk");
  assert.match(
    appSource,
    /mergeAndSaveStateForAccount\(current, signingOutUserId\)[\s\S]*已取消退出/,
    "sign-out must stop before clearing the visible account when its latest local state cannot be saved"
  );
  assert.match(appSource, /new BroadcastChannel\(LOCAL_STATE_CHANNEL\)/, "same-account browser tabs must be notified after an atomic local save");
  assert.match(appSource, /if \(isTerminalAuthError\(error\)\)[\s\S]*handleTerminalAuthFailure\(error, previousState\)/, "terminal Auth failures during account activation must not reveal cached account data");
  assert.match(appSource, /getCachedWeather\(user\.id\)/, "a signed-in account must only restore its own cached weather");
  assert.match(appSource, /const anonymous = await loadStateForAccount\(\);[\s\S]*applyState\(normalizeState\(anonymous\.state\)\)/, "failed entry into a different account must show only the anonymous partition");
  assert.match(appSource, /云端暂不可用，已安全加载本机账号数据/, "temporary cloud failures must keep the authenticated account in its own local partition");
  assert.match(appSource, /本机存储不可用，同步已暂停/, "storage initialization failures must reach a safe visible state instead of leaving the app loading forever");
  assert.match(appSource, /reconcileCompletedSync\(current, pushed, stateRef\.current\)/, "sync completion must reconcile edits made while requests are in flight");
  assert.match(syncSource, /if \(!remote\)[\s\S]*remoteRevision: 0/, "a deleted or missing cloud snapshot must be recreated from revision zero");
  assert.match(syncSource, /remote && cloudStatesEquivalent\(candidate, remote\)/, "periodic synchronization must skip full-snapshot writes when user data is unchanged");
  assert.match(syncSource, /onBeforeRemoteMerge[\s\S]*!cloudStatesEquivalent\(candidate, remote\)/, "automatic synchronization must expose a restore-point boundary before merging changed remote data");
  assert.match(appSource, /saveAutoSyncRestorePoint[\s\S]*synchronizeSnapshot\(current, expectedUserId, 3, saveAutoSyncRestorePoint\)/, "automatic synchronization must preserve the pre-merge account state");
  assert.match(
    appSource,
    /saveSyncRestorePoint = async[\s\S]*isCurrentAccountOperation\(expectedEpoch, userId\)[\s\S]*syncRestoreKey\(userId\)[\s\S]*ownerId: userId/,
    "restore-point writes must remain bound to the account and operation that started the synchronization"
  );
  assert.match(appSource, /saveSyncRestorePoint\("自动同步前", current, expectedUserId, operationEpoch\)/, "automatic restore points must not resolve their account from a cross-tab mutable reference");
  assert.match(appSource, /mode === "push"[\s\S]*window\.confirm\("用本机数据覆盖云端/, "destructive cloud overwrite must require explicit confirmation");
  assert.match(appSource, /mode === "pull"[\s\S]*window\.confirm\("用云端数据覆盖本机/, "destructive local overwrite must require explicit confirmation");
  assert.match(
    appSource,
    /cloudRestorePointSaved = false[\s\S]*latestRemote && !cloudRestorePointSaved[\s\S]*saveSyncRestorePoint\([\s\S]*"云端被本机覆盖前"[\s\S]*withDeviceLocalState\(latestRemote, current\)/,
    "local-over-cloud sync must preserve the original cloud state without discarding device-local state"
  );
  assert.match(
    appSource,
    /const withDeviceLocalState[\s\S]*city: source\.settings\.city[\s\S]*weatherUseLocation: source\.settings\.weatherUseLocation/,
    "authoritative cloud pulls must preserve device-local weather choices"
  );
  assert.match(appSource, /prepareCompleteBackupState\(stateRef\.current\)/, "complete backups must use the tested privacy boundary");
  assert.match(appSource, /restoreCompleteBackupForDevice\(parsed\.state, current\)/, "backup imports must restore backed-up media without overwriting device-local identity");
  assert.match(syncSource, /pull_sync_snapshot_for_user[\s\S]*p_user_id: expectedUserId/, "snapshot reads must be restricted to the account expected by the current UI partition");
  assert.match(syncSource, /authData\.user\?\.id !== expectedUserId/, "snapshot reads must verify the server-side Auth account after each request");
  assert.match(syncSource, /crypto\.subtle\.digest\("SHA-1"[\s\S]*hash\.slice\(0, 5\)[\s\S]*Add-Padding/, "password leak checks must hash locally, disclose only the five-character prefix, and request response padding");
  assert.match(syncSource, /signInWithPassword\([\s\S]*assertPasswordNotKnownLeaked\(password\)[\s\S]*passwordSafetyWarning/, "login must check an authenticated password and surface a warning without making HIBP an availability dependency");
  assert.match(syncSource, /assertPasswordNotKnownLeaked\(password\)[\s\S]*auth\.signUp/, "registration must reject a known leaked password before contacting Auth");
  assert.match(syncSource, /updatePassword[\s\S]*assertPasswordNotKnownLeaked\(password\)[\s\S]*updateUser/, "replacement passwords must be checked before submission");
  assert.match(syncSource, /MAX_PWNED_PASSWORD_RESPONSE_CHARS[\s\S]*content-length[\s\S]*body\.length/, "password range responses must have explicit allocation bounds");
  assert.match(syncSource, /push_sync_snapshot_for_user[\s\S]*p_user_id: expectedUserId/, "snapshot writes must bind the expected UI account inside the database");
  assert.match(appSource, /onAuthStateChange\(\(event, session\)[\s\S]*session\.user\.id !== activeUserIdRef\.current/, "cross-tab Auth account changes must activate the matching local partition");
  assert.match(appSource, /previousUserId && previousUserId !== user\.id[\s\S]*mergeAndSaveStateForAccount\(previousState, previousUserId\)/, "account switching must atomically merge and persist the outgoing partition before loading another account");
  assert.match(syncSource, /supabaseUrl: DEFAULT_SUPABASE_URL[\s\S]*supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY/, "stored state must not replace the official build-time sync service");
  assert.match(appSource, /stampStateSnapshot\(current, latest, nowIso\(\)\)/, "authoritative pulls must preserve only edits made after the pull started");
  assert.match(appSource, /settingsChanged/, "anonymous settings changes must count as portable local data during first sign-in");
  assert.match(appSource, /MAX_BACKUP_IMPORT_BYTES = 64 \* 1024 \* 1024/, "complete backups must accept bounded local media without allowing a mobile-hostile JSON allocation");
  assert.match(appSource, /\["image\/avif", "image\/gif", "image\/jpeg", "image\/png", "image\/webp"\]\.includes/, "uploaded local images must be decoded from a fixed raster-only MIME allow-list");
  assert.match(appSource, /!shortcut\.folderId \|\| !liveFolderIds\.has\(shortcut\.folderId\)/, "shortcuts orphaned by concurrent folder deletion must remain visible at the root level");
  assert.match(appSource, /activeCustomPage\?\.groupId === activeLayer/, "an active custom page must remain stable while its linked group converges from another device");
  assert.match(appSource, /page\.groupId === id && !page\.deletedAt/, "deleting a category must also tombstone its linked custom navigation entries");
  assert.match(appSource, /current\.shortcutGroups\.filter\(\(group\) => group\.deletedAt\)/, "append imports must preserve deletion tombstones for multi-device convergence");
  assert.match(appSource, /file\.size > MAX_IMPORT_TEXT_CHARS/, "shortcut imports must reject oversized files before reading them into memory");
  assert.match(appSource, /normalizeIconReference\(suppliedIcon\)/, "manually entered icon references must be validated before persistence");
  assert.match(appSource, /iconUrlMatches[\s\S]*hosts\.includes\(parsed\.hostname\.toLowerCase\(\)\)[\s\S]*parsed\.pathname\.startsWith\(pathPrefix\)/, "favicon and brand providers must be identified by parsed HTTPS host and path");
  assert.match(appSource, /const safeIconUrl = normalizeIconReference\(iconUrl\)[\s\S]*src=\{safeIconUrl\}/, "folder artwork must be revalidated immediately before it reaches the image element");
  assert.match(appSource, /maxLength=\{MAX_TODO_TEXT_CHARS\}/, "todo input length must match the persisted data model");
  assert.match(
    appSource,
    /DialogShell title="账号与云同步"[\s\S]*scrollResetKey=\{authMode\}/,
    "switching between login and registration must reset the account dialog to the top"
  );
  assert.match(
    appSource,
    /useLayoutEffect\(\(\) => \{\s*if \(bodyRef\.current\) bodyRef\.current\.scrollTop = 0;\s*\}, \[title, scrollResetKey\]\)/,
    "dialog scroll resets must happen before paint when the modal surface or account mode changes"
  );
  assert.match(appSource, /maxLength=\{MAX_CALENDAR_RECORD_CHARS\}/, "calendar input length must match the persisted data model");
  assert.match(appSource, /maxLength=\{MAX_QUICK_NOTE_CHARS\}/, "memo input length must match the persisted data model");
  assert.match(appSource, /label: "获取更新"[\s\S]*result\.manifest\.updateUrl[\s\S]*noopener,noreferrer/, "unpacked extensions must expose a direct trusted update action");
  assert.match(appSource, /当前版本已停止云同步，请先升级/, "unsupported clients must receive an explicit automatic sync cutoff notice");
  assert.match(appSource, /event\.key !== "Tab"/, "dialogs must keep keyboard focus inside the active modal");
  assert.match(appSource, /previouslyFocused\?\.focus\(\)/, "closing a dialog must restore the user's prior keyboard focus");
  assert.match(appSource, /bodyRef\.current\.scrollTop = 0/, "every dialog must open at the beginning instead of inheriting a previous mobile scroll position");
  assert.match(appSource, /initial\?\.focus\(\{ preventScroll: true \}\)/, "dialog focus management must not scroll form content away from its heading");
  assert.match(
    appSource,
    /\.page-nav:hover, \.page-nav:focus-within, \.page-nav-auto-trigger:hover, \.page-nav-auto-trigger:focus-visible/,
    "automatic navigation must remain open while either its trigger or panel is still active"
  );
  const uiSource = await readFile(join(repoRoot, "extension/src/ui-v040.css"), "utf8");
  assert.match(uiSource, /\.dialog-body\s*\{[\s\S]*overflow-anchor: none/, "asynchronous dialog content must not move the mobile scroll position");
  const sortableWidgetSource = await readFile(join(repoRoot, "extension/src/SortableWidgetGrid.tsx"), "utf8");
  assert.match(sortableWidgetSource, /widget-sortable-settings/, "layout editing must expose a touch-accessible widget settings control");
  assert.match(sortableWidgetSource, /onConfigure\(item\.id/, "the widget settings control must open the same bounded configuration surface as right-click");
  const sortableHomeShortcutSource = await readFile(join(repoRoot, "extension/src/SortableHomeShortcutGrid.tsx"), "utf8");
  assert.match(sortableHomeShortcutSource, /useSortable/, "homepage shortcut editing must use the established sortable engine");
  assert.match(sortableHomeShortcutSource, /TouchSensor/, "homepage shortcuts must support true touch dragging instead of a two-tap substitute");
  assert.match(sortableHomeShortcutSource, /KeyboardSensor/, "homepage shortcut order must remain keyboard accessible");
  const deployWorkflow = await readFile(join(repoRoot, ".github/workflows/deploy-pages.yml"), "utf8");
  assert.doesNotMatch(
    deployWorkflow,
    /push:\s*\n\s*branches:\s*\[main\]/,
    "ordinary main-branch pushes must not expose a new version manifest before its release artifact exists"
  );
  assert.match(
    deployWorkflow,
    /workflow_call:/,
    "the production deployment must be reusable from the audited release workflow"
  );
  assert.match(
    deployWorkflow,
    /release_is_draft=.*gh release view "\$release_version" --repo "\$GITHUB_REPOSITORY" --json isDraft/,
    "production deployment must inspect whether the matching GitHub Release is public or private"
  );
  assert.match(
    deployWorkflow,
    /GITHUB_EVENT_NAME.*workflow_dispatch[\s\S]*activate_public_release[\s\S]*Release activation requires an existing public release/,
    "manual production redeploys and final activation must require the matching public GitHub Release"
  );
  assert.match(
    deployWorkflow,
    /GITHUB_REF_TYPE.*tag[\s\S]*GITHUB_REF_NAME.*release_version[\s\S]*Release deployment requires the matching private draft/,
    "tag-driven production deployment must require its matching private draft"
  );
  assert.match(deployWorkflow, /secrets\.CLOUDFLARE_API_TOKEN/, "Pages deployment must use a repository secret");
  assert.match(deployWorkflow, /secrets\.VITE_TURNSTILE_SITE_KEY/, "Pages deployment must inject the public Turnstile site key from secrets");
  assert.match(deployWorkflow, /verify:repository-history/, "Pages deployment must stop when public history contains private or retired data");
  assert.match(deployWorkflow, /npm audit --audit-level=high/, "Pages deployment must stop for high-severity runtime or build dependency advisories");
  assert.doesNotMatch(deployWorkflow, /npm audit --omit=dev/, "Pages deployment must audit build tooling that influences production artifacts");
  assert.match(deployWorkflow, /secrets\.SUPABASE_ACCESS_TOKEN/, "production deployment must use an encrypted Supabase access token");
  assert.doesNotMatch(
    deployWorkflow,
    /^ {6}(?:CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|SUPABASE_ACCESS_TOKEN):/m,
    "production credentials must be scoped to the individual deployment steps instead of the whole job"
  );
  assert.doesNotMatch(deployWorkflow, /SUPABASE_DB_PASSWORD|SUPABASE_DB_URL/, "production deployment must not retain a database credential");
  assert.doesNotMatch(deployWorkflow, /network-restrictions update|supabase db push|supabase link/, "production deployment must keep direct database ingress closed");
  assert.match(deployWorkflow, /deploy:supabase-migrations -- --through 0013[\s\S]*deploy:supabase-migrations -- --only 0015/, "production deployment must prepare the backward-compatible sync and WhyNavo identifier APIs before publishing the client");
  assert.match(deployWorkflow, /supabase functions deploy[\s\S]*--use-api/, "production Edge Functions must deploy without opening direct database ingress");
  assert.match(deployWorkflow, /pages deploy extension\/web-dist[\s\S]*Verify hosted app before irreversible cutover[\s\S]*Retire the unsupported sync API[\s\S]*deploy:supabase-migrations/, "the unsupported sync API must be revoked only after the new Pages client passes its hosted smoke test");
  assert.match(
    deployWorkflow,
    /Retire the unsupported sync API\s*\n\s*if: github\.event_name == 'workflow_dispatch' \|\| inputs\.activate_public_release == true/,
    "the draft rollout must not revoke the old-client API before the matching release is public"
  );
  assert.ok(
    deployWorkflow.indexOf("deploy:supabase-migrations -- --only 0015") < deployWorkflow.indexOf("pages deploy extension/web-dist")
      && deployWorkflow.lastIndexOf("npm run deploy:supabase-migrations") > deployWorkflow.indexOf("pages deploy extension/web-dist"),
    "the production rollout must preserve old-client compatibility until the new Pages bundle switches"
  );
  assert.match(deployWorkflow, /Verify hosted app before irreversible cutover[\s\S]*Retire the unsupported sync API[\s\S]*Verify production security configuration[\s\S]*Verify hosted app after irreversible cutover/, "release activation must smoke-test both before and after the irreversible database cutover");
  assert.match(deployWorkflow, /cancel-in-progress: false/, "a rollout must not be cancelled after the backend changes but before the Pages bundle switches");
  const migrationDeployment = await readFile(join(repoRoot, "scripts/apply-supabase-migrations.mjs"), "utf8");
  assert.match(migrationDeployment, /--through[\s\S]*--only/, "the migration deployer must support bounded and targeted compatibility phases");
  assert.match(migrationDeployment, /targetedMigrationRequirements[\s\S]*\["0015", \["0013"\]\]/, "the targeted brand migration must refuse to run before its compatibility prerequisite");
  assert.match(migrationDeployment, /pg_advisory_xact_lock/, "production migrations must serialize concurrent deployers");
  assert.match(migrationDeployment, /supabase_migrations\.schema_migrations/, "the Management API migration path must preserve the official migration ledger");
  const managementClient = await readFile(join(repoRoot, "scripts/supabase-management.mjs"), "utf8");
  assert.match(managementClient, /\/database\/query/, "production database changes must use the authenticated Supabase Management API");
  assert.match(managementClient, /read_only: readOnly/, "Supabase database queries must declare their read/write mode explicitly");
  assert.match(migrationDeployment, /databaseQuery\(transaction, \{ readOnly: false \}\)/, "migration transactions must explicitly request write access");
  assert.match(managementClient, /READ_ONLY_PROJECT_ENDPOINTS[\s\S]*Management API path is not allow-listed/, "the Management API helper must reject unreviewed endpoints");
  assert.match(managementClient, /WRITABLE_AUTH_CONFIG_FIELDS[\s\S]*reviewedAuthUpdate === true[\s\S]*unreviewed field/, "Auth configuration writes must be restricted to reviewed fields and an explicit write path");
  assert.match(managementClient, /MAX_MANAGEMENT_BODY_BYTES[\s\S]*Buffer\.byteLength/, "Management API uploads must have an explicit size bound");
  assert.doesNotMatch(managementClient, /console\.log\([^)]*token|console\.error\([^)]*token/, "the Supabase access token must never be logged");
  const authConfigurator = await readFile(join(repoRoot, "scripts/configure-supabase-auth.mjs"), "utf8");
  assert.match(authConfigurator, /site_url: officialOrigin[\s\S]*uri_allow_list: officialOrigin/, "the reviewed Auth configuration must remove every retired redirect origin");
  assert.match(authConfigurator, /rate_limit_verify: 360[\s\S]*rate_limit_token_refresh: 1800/, "the reviewed Auth configuration must match Supabase's current verification and refresh limits");
  assert.doesNotMatch(authConfigurator, /mailer_subjects_confirmation|mailer_subjects_recovery|mailer_templates_confirmation_content|mailer_templates_recovery_content/, "the free-tier Auth configurator must not attempt email branding writes that Supabase rejects without custom SMTP");
  assert.match(deployWorkflow, /configure:supabase-auth/, "every production deployment must converge the reviewed Auth origin and rate limits");
  const supabaseProductionGate = await readFile(join(repoRoot, "scripts/verify-supabase-production.mjs"), "utf8");
  assert.match(supabaseProductionGate, /serverLeakedPasswordProtectionEnabled[\s\S]*client-side k-anonymous check remains mandatory/, "the free-plan production gate must explicitly preserve and disclose the mandatory client-side leaked-password mitigation");
  assert.match(supabaseProductionGate, /security_update_password_require_current_password === true/, "production must enforce current-password verification");
  assert.match(supabaseProductionGate, /refresh_token_rotation_enabled === true/, "production must enforce refresh-token rotation");
  assert.match(supabaseProductionGate, /session_activity_exists[\s\S]*server-enforced sync session policy/, "production must verify the database-enforced session policy");
  assert.match(supabaseProductionGate, /snapshot_select_policy[\s\S]*has_whynavo_sync_session[\s\S]*account ownership and session expiry/, "production must keep transitional direct reads account-scoped and session-bound");
  assert.match(supabaseProductionGate, /rate_limit_email_sent[\s\S]*1000/, "production email sending must have a reviewed throughput boundary");
  assert.match(supabaseProductionGate, /hook_send_email_enabled === true/, "production must require the signed transactional-email hook");
  assert.match(supabaseProductionGate, /mailer_templates_confirmation_content === confirmationTemplate/, "production must reject signup email-template drift");
  assert.match(supabaseProductionGate, /mailer_templates_recovery_content === recoveryTemplate/, "production must reject password-recovery email-template drift");
  assert.match(supabaseProductionGate, /Direct production database ingress is not fully closed/, "production verification must reject direct database ingress");
  assert.match(supabaseProductionGate, /Unreviewed Supabase Security Advisor finding/, "production verification must fail for unreviewed security findings");
  assert.match(
    supabaseProductionGate,
    /if \(!isFinal\)[\s\S]*push_sync_snapshot/,
    "the transitional security-definer warning must be allowed only before the final legacy-sync cutover"
  );
  const releaseWorkflow = await readFile(join(repoRoot, ".github/workflows/release.yml"), "utf8");
  assert.match(releaseWorkflow, /sha256sum/, "release archives must include a user-verifiable SHA-256 checksum");
  assert.match(releaseWorkflow, /actions\/attest@[0-9a-f]{40}/, "release archives must receive provenance from a commit-pinned GitHub attestation action");
  assert.match(releaseWorkflow, /attestations: write/, "the release job must explicitly request attestation permission");
  assert.match(releaseWorkflow, /npm run verify:release/, "release tags must match every user-visible version marker");
  assert.match(
    releaseWorkflow,
    /release:\s*\n\s+if: vars\.WHYNAVO_PRODUCTION_ENABLED == 'true'/,
    "release publication must remain disabled until the production launch gate is explicitly enabled"
  );
  assert.match(
    releaseWorkflow,
    /deploy:supabase-migrations -- --through 0013[\s\S]*deploy:supabase-migrations -- --only 0015[\s\S]*Deploy backward-compatible Edge Functions[\s\S]*Configure reviewed Supabase Auth settings[\s\S]*Verify production predeployment gates[\s\S]*Prepare private draft release/,
    "the draft release artifact must be prepared only after its backward-compatible database and function dependencies are ready"
  );
  assert.match(
    releaseWorkflow,
    /Prepare private draft release[\s\S]*--draft/,
    "the release artifact must remain private until the hosted rollout passes"
  );
  assert.match(
    releaseWorkflow,
    /release:[\s\S]*concurrency:[\s\S]*group: whynavo-production-database-access[\s\S]*cancel-in-progress: false/,
    "release preparation must serialize with production backups and database cutovers"
  );
  assert.match(
    releaseWorkflow,
    /needs: release[\s\S]*uses: \.\/\.github\/workflows\/deploy-pages\.yml[\s\S]*secrets: inherit/,
    "the hosted version must switch only after the matching private draft artifact is ready"
  );
  assert.match(
    releaseWorkflow,
    /publish:[\s\S]*needs: deploy[\s\S]*gh release edit[\s\S]*--draft=false/,
    "the release must become public only after the compatible hosted rollout succeeds"
  );
  assert.match(
    releaseWorkflow,
    /activate:[\s\S]*needs: publish[\s\S]*activate_public_release: true/,
    "the irreversible sync cutover must run only after the matching release artifact becomes public"
  );
  const rootPackage = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const extensionPackageVerifier = await readFile(join(repoRoot, "scripts/verify-extension-package.mjs"), "utf8");
  assert.match(
    rootPackage.scripts.build,
    /verify:extension-package/,
    "every extension build must validate the final unpacked package"
  );
  assert.match(
    extensionPackageVerifier,
    /_headers[\s\S]*_redirects[\s\S]*CNAME[\s\S]*startsWith\("\*"\)/,
    "the extension package verifier must reject browser-reserved and web-hosting-only files"
  );
  const productionConfigScript = await readFile(join(repoRoot, "scripts/verify-production-config.mjs"), "utf8");
  assert.match(productionConfigScript, /VITE_TURNSTILE_SITE_KEY/, "official builds must require Turnstile configuration");
  assert.match(
    productionConfigScript,
    /OFFICIAL_SUPABASE_PROJECT_REF = "keafulupzvfljvbzwgrq"[\s\S]*projectRef !== OFFICIAL_SUPABASE_PROJECT_REF/,
    "official builds must reject credentials for a different Supabase project"
  );
  const gitignore = await readFile(join(repoRoot, ".gitignore"), "utf8");
  assert.match(gitignore, /^\.env\.\*$/m, "all environment-specific files must be ignored by default");
  assert.match(gitignore, /^!\.env\.example$/m, "the public environment example must remain trackable");
  const historySafetyScript = await readFile(join(repoRoot, "scripts/repository-history-safety-test.mjs"), "utf8");
  assert.match(
    historySafetyScript,
    /\(\^\|\[\^\[:alnum:\]_\]\)re_/,
    "historical Resend key scanning must require a token boundary instead of matching normal identifiers ending in re_"
  );
  const hostedSmokeTest = await readFile(join(repoRoot, "scripts/hosted-smoke-test.mjs"), "utf8");
  assert.match(hostedSmokeTest, /REQUIRE_PRODUCTION_CONFIG/, "production monitoring must fail instead of skipping account checks when secrets are missing");
  assert.match(hostedSmokeTest, /ALLOW_PREVIOUS_VERSION_MANIFEST[\s\S]*safe predecessor/, "staged production checks must accept only a validated older update manifest");
  assert.match(hostedSmokeTest, /auth\/v1\/settings[\s\S]*disable_signup[\s\S]*mailer_autoconfirm/, "production monitoring must verify email registration and confirmation settings");
  assert.match(hostedSmokeTest, /functions\/v1\/boc-rates/, "production monitoring must verify the public edge-function path");
  assert.match(hostedSmokeTest, /cspSources[\s\S]*\.has\("https:\/\/challenges\.cloudflare\.com"\)/, "hosted checks must parse CSP source lists instead of accepting a hostile URL substring");
  assert.match(hostedSmokeTest, /confirm\.html[\s\S]*cache-control[\s\S]*event\.isTrusted/, "hosted checks must validate the non-cacheable email-confirmation click boundary");
  const uptimeWorkflow = await readFile(join(repoRoot, ".github/workflows/uptime.yml"), "utf8");
  assert.match(uptimeWorkflow, /verify:supabase-production[\s\S]*smoke:hosted/, "scheduled monitoring must detect both cloud security drift and public service failures");
  assert.match(deployWorkflow, /Verify production predeployment gates[\s\S]*--phase predeploy[\s\S]*Deploy to Cloudflare Pages/, "production security preflight must pass before the public Pages deployment");
  assert.match(deployWorkflow, /stage-live-version-manifest\.mjs[\s\S]*Deploy to Cloudflare Pages/, "the first Pages rollout must retain the already-public update manifest until its Release is public");
  assert.match(deployWorkflow, /ALLOW_PREVIOUS_VERSION_MANIFEST/, "the staged hosted check must explicitly verify predecessor-manifest mode");
  assert.match(releaseWorkflow, /Deploy backward-compatible Edge Functions[\s\S]*--phase predeploy[\s\S]*Build production package/, "release packaging must wait for production predeployment gates");
  assert.match(releaseWorkflow, /publish:[\s\S]*draft=false[\s\S]*activate:[\s\S]*activate_public_release: true/, "the update manifest must be activated only after the verified draft Release becomes public");
  const stagedVersionManifest = await readFile(join(repoRoot, "scripts/stage-live-version-manifest.mjs"), "utf8");
  const versionManifestLibrary = await readFile(join(repoRoot, "scripts/version-manifest.mjs"), "utf8");
  assert.match(stagedVersionManifest, /redirect: "error"[\s\S]*16_384[\s\S]*validatePublishedPredecessorManifest/, "the staged manifest fetch must reject redirects and oversized input before reusable validation");
  assert.match(versionManifestLibrary, /compareReleaseVersions\(manifest\.latestVersion, nextVersion\) >= 0/, "the staged manifest validator must reject current and newer versions");
  assert.match(versionManifestLibrary, /releaseNotesUrl[\s\S]*OFFICIAL_RELEASE_URL[\s\S]*updateUrl/, "the staged manifest must retain only the official public release destination");
  const supabaseProductionVerifier = await readFile(join(repoRoot, "scripts/verify-supabase-production.mjs"), "utf8");
  assert.match(supabaseProductionVerifier, /phase === "final"[\s\S]*requiredPredeployVersions/, "the production verifier must distinguish backward-compatible predeployment state from final state");
  const supabaseConfig = await readFile(join(repoRoot, "supabase/config.toml"), "utf8");
  assert.match(supabaseConfig, /\[functions\.boc-rates\]\s*verify_jwt = false/, "the public rate function must keep its in-handler publishable-key validation reachable");
  assert.match(supabaseConfig, /\[functions\.delete-account\]\s*verify_jwt = true/, "account deletion must retain gateway JWT verification");
  assert.match(supabaseConfig, /\[functions\.send-auth-email\]\s*verify_jwt = false/, "the signed Auth email webhook must remain reachable without a Supabase bearer token");
  const lockedRateCacheMigration = await readFile(join(repoRoot, "supabase/migrations/0007_lock_exchange_rate_cache.sql"), "utf8");
  assert.match(lockedRateCacheMigration, /enable row level security/, "the raw exchange-rate cache must enforce RLS");
  assert.match(lockedRateCacheMigration, /revoke all[\s\S]*from anon, authenticated/, "public clients must not access the raw exchange-rate cache table");
  const anonymousRpcMigration = await readFile(join(repoRoot, "supabase/migrations/0008_revoke_anonymous_sync_rpc.sql"), "utf8");
  assert.match(anonymousRpcMigration, /revoke all[\s\S]*from anon, public/, "anonymous callers must not execute the synchronization write RPC");
  assert.match(anonymousRpcMigration, /grant execute[\s\S]*to authenticated/, "authenticated callers must retain synchronization RPC access");
  const rlsTriggerMigration = await readFile(join(repoRoot, "supabase/migrations/0009_lock_rls_event_trigger_function.sql"), "utf8");
  assert.match(rlsTriggerMigration, /revoke all[\s\S]*from anon, authenticated, public/, "public API roles must not execute the RLS event-trigger helper");
  const lockedSyncSearchPathMigration = await readFile(join(repoRoot, "supabase/migrations/0010_lock_sync_function_search_path.sql"), "utf8");
  assert.match(lockedSyncSearchPathMigration, /alter function public\.push_sync_snapshot\(text, jsonb, bigint\)[\s\S]*set search_path = ''/, "the security-definer sync RPC must run with an empty search path");
  const accountBoundSyncMigration = await readFile(join(repoRoot, "supabase/migrations/0011_bind_sync_writes_to_expected_user.sql"), "utf8");
  assert.match(accountBoundSyncMigration, /push_sync_snapshot_for_user\([\s\S]*p_user_id uuid/, "the current sync RPC must require the UI partition's expected account");
  assert.match(accountBoundSyncMigration, /p_user_id is distinct from current_user_id/, "the database must reject writes after an Auth account switch");
  assert.match(accountBoundSyncMigration, /set search_path = ''/, "the account-bound security-definer RPC must use an empty search path");
  assert.doesNotMatch(accountBoundSyncMigration, /revoke all on function public\.push_sync_snapshot\(text, jsonb, bigint\)[\s\S]*authenticated/, "the compatibility migration must not break the currently published client before rollout");
  const rateLimitedSyncMigration = await readFile(join(repoRoot, "supabase/migrations/0012_rate_limit_sync_writes.sql"), "utf8");
  assert.match(rateLimitedSyncMigration, /sync_write_rate_limits/, "sync writes must have an account-scoped database rate-limit record");
  assert.match(rateLimitedSyncMigration, /rate_count > 20[\s\S]*next_revision := -1/, "excessive snapshot writes must fail without replacing cloud data");
  assert.match(rateLimitedSyncMigration, /revoke all on table public\.sync_write_rate_limits from public, anon, authenticated/, "clients must not read or modify sync rate-limit state directly");
  const sessionPolicyMigration = await readFile(join(repoRoot, "supabase/migrations/0013_enforce_sync_session_policy.sql"), "utf8");
  assert.match(sessionPolicyMigration, /references auth\.sessions\(id\) on delete cascade/, "sync session state must be removed when the Auth session ends");
  assert.match(sessionPolicyMigration, /session_created_at < checked_at - interval '90 days'/, "cloud sessions must have a server-enforced 90-day absolute lifetime");
  assert.match(sessionPolicyMigration, /activity_last_seen_at < checked_at - interval '30 days'/, "cloud sessions must expire after 30 days of inactivity");
  assert.match(sessionPolicyMigration, /has_whynavo_sync_session[\s\S]*auth\.uid\(\) = user_id[\s\S]*has_whynavo_sync_session\(user_id\)/, "published 0.5.x clients must retain RLS-protected reads without bypassing the new session policy");
  assert.match(sessionPolicyMigration, /pull_sync_snapshot_for_user[\s\S]*assert_whynavo_sync_session/, "snapshot reads must enforce the account-bound session policy");
  assert.match(sessionPolicyMigration, /push_sync_snapshot_for_user[\s\S]*assert_whynavo_sync_session/, "snapshot writes must enforce the account-bound session policy");
  assert.match(
    sessionPolicyMigration,
    /create or replace function public\.push_sync_snapshot\([\s\S]*public\.push_sync_snapshot_for_user\([\s\S]*current_user_id/,
    "the staged legacy write API must delegate to the account-bound, session-limited, rate-limited implementation"
  );
  assert.match(syncSource, /rpc\("pull_sync_snapshot_for_user"[\s\S]*p_user_id: expectedUserId/, "snapshot reads must use the account-bound server API");
  assert.match(syncSource, /whynavo session revoked[\s\S]*whynavo session expired[\s\S]*whynavo session inactive/, "server session-policy failures must terminate the local Auth view");
  const retiredSyncMigration = await readFile(join(repoRoot, "supabase/migrations/0014_retire_legacy_sync_access.sql"), "utf8");
  assert.match(retiredSyncMigration, /revoke all on function public\.push_sync_snapshot\(text, jsonb, bigint\) from public, anon, authenticated/, "the post-client migration must revoke every public role from the old sync API");
  assert.doesNotMatch(retiredSyncMigration, /revoke select on table public\.sync_snapshots from authenticated/, "the 0.6.0 migration must not break RLS-protected reads used by published 0.5.x clients");
  const brandIdentifierMigration = await readFile(join(repoRoot, "supabase/migrations/0015_migrate_brand_identifiers.sql"), "utf8");
  assert.match(brandIdentifierMigration, /'why' \|\| 'tab'[\s\S]*pg_get_functiondef[\s\S]*replace[\s\S]*current_token/, "the deployed session-policy functions must migrate to the new brand without losing their security-definer bodies");
  assert.match(brandIdentifierMigration, /drop policy if exists "Users own sync snapshots"[\s\S]*create policy "Users own sync snapshots"[\s\S]*has_whynavo_sync_session/, "the snapshot read policy must switch to the renamed session guard");
  assert.match(brandIdentifierMigration, /revoke all on function public\.assert_whynavo_sync_session[\s\S]*grant execute on function public\.has_whynavo_sync_session/, "the renamed session helpers must not become callable by anonymous users");
  assert.match(syncSource, /next_revision\) === -1[\s\S]*同步操作过于频繁/, "the client must explain a server-side synchronization rate limit instead of retrying it as a conflict");
  assert.match(syncSource, /data as \{ deleted\?: unknown \}\)\.deleted !== true[\s\S]*AccountDeletionOutcomeUnknownError/, "account deletion must require an explicit success response");
  assert.match(appSource, /mergeAndSaveStateForAccount\(current, deletingUserId\)[\s\S]*markLocalAccountDeletionPending\(deletingUserId\)[\s\S]*deleteAccount\(/, "account deletion must persist the target partition before sending the irreversible request");
  assert.match(appSource, /账号删除状态待核验[\s\S]*\{ persistPrevious: false \}/, "an ambiguous deletion must hide the target account without attempting another fallible account save");
  assert.match(appSource, /addEventListener\("online", resumeSync\)[\s\S]*addEventListener\("focus", resumeSync\)[\s\S]*resumeSync\(\)/, "pending account cleanup and offline activation must retry immediately when the ready state is installed");
  assert.doesNotMatch(appSource, /AccountDeletionOutcomeUnknownError[\s\S]{0,500}await signOut/, "an ambiguous deletion must retain its Auth session so the server outcome can be verified later");
  const webManifest = JSON.parse(await readFile(join(repoRoot, "extension/public/app.webmanifest"), "utf8"));
  assert.equal(webManifest.icons.some((icon) => icon.sizes === "192x192"), true, "PWA must provide a 192px install icon");
  assert.equal(webManifest.icons.some((icon) => icon.sizes === "512x512"), true, "PWA must provide a 512px install icon");
  const resetPasswordTemplate = await readFile(join(repoRoot, "docs/supabase-reset-password-email.html"), "utf8");
  assert.match(resetPasswordTemplate, /whynavo\.pages\.dev\/icons\/icon128\.png/, "password reset email must use the public whynavo logo");
  assert.match(resetPasswordTemplate, /confirm\.html#token=\{\{ \.TokenHash \}\}[\s\S]*type=recovery/, "password reset email must use the prefetch-safe confirmation page");
  assert.doesNotMatch(resetPasswordTemplate, /\{\{ \.ConfirmationURL \}\}/, "password reset email must not expose a directly consumable one-time link");
  const signupEmailTemplate = await readFile(join(repoRoot, "docs/supabase-confirm-signup-email.html"), "utf8");
  assert.match(signupEmailTemplate, /confirm\.html#token=\{\{ \.TokenHash \}\}[\s\S]*type=signup/, "signup email must use the prefetch-safe confirmation page");
  assert.doesNotMatch(signupEmailTemplate, /\{\{ \.ConfirmationURL \}\}/, "signup email must not expose a directly consumable one-time link");
  const backupWorkflow = await readFile(join(repoRoot, ".github/workflows/database-backup.yml"), "utf8");
  assert.match(backupWorkflow, /secrets\.SUPABASE_ACCESS_TOKEN/, "database backups must use an encrypted, revocable Supabase access token");
  assert.doesNotMatch(
    backupWorkflow,
    /^ {6}(?:SUPABASE_ACCESS_TOKEN|BACKUP_ENCRYPTION_PUBLIC_KEY_B64|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|R2_ENDPOINT|R2_BUCKET):/m,
    "backup credentials must be scoped to the export, encryption, closure, or upload step that needs them"
  );
  assert.doesNotMatch(backupWorkflow, /SUPABASE_DB_PASSWORD|SUPABASE_DB_URL/, "database backups must not retain a long-lived database password or connection string");
  assert.match(backupWorkflow, /database\/jit-access[\s\S]*state":"enabled"/, "database backups must enable the reviewed temporary database-access feature");
  assert.match(backupWorkflow, /database\/jit[\s\S]*role: "postgres"[\s\S]*runner_ip\/32/, "database backups must bind temporary database access to the runner IP and postgres role");
  assert.match(backupWorkflow, /db_url="\$\(printf '%s:\/\/%s:%s@%s:%s\/%s\?%s'[\s\S]*"db\.\$\{SUPABASE_PROJECT_REF\}\.supabase\.co" 5432 postgres sslmode=require\)/, "database dumps must use the direct temporary-access connection");
  assert.match(backupWorkflow, /Revoke temporary database access[\s\S]*database\/jit\/\$\{JIT_USER_ID\}/, "database backups must revoke temporary database access after every run");
  assert.match(backupWorkflow, /network-restrictions update[\s\S]*runner_ip\/32/, "database backups must restrict temporary database ingress to the current runner");
  assert.match(backupWorkflow, /trap close_ingress EXIT INT TERM[\s\S]*ingress_open=true[\s\S]*close_ingress[\s\S]*trap - EXIT INT TERM/, "database exports must close temporary ingress inside the export process as well as in the always-run cleanup step");
  assert.match(backupWorkflow, /Close direct database ingress[\s\S]*0\.0\.0\.0\/32/, "database backups must close direct database ingress even after an export failure");
  assert.match(backupWorkflow, /supabase db dump[\s\S]*--role-only/, "off-site backups must include database roles");
  assert.match(backupWorkflow, /--schema public/, "application backups must explicitly export the public schema");
  assert.match(backupWorkflow, /auth-data\.sql[\s\S]*--schema auth/, "account recovery backups must explicitly export the Auth schema");
  assert.match(backupWorkflow, /-x "auth\.sessions"[\s\S]*-x "auth\.sso_providers"/, "account recovery backups must exclude active sessions and other unapproved Auth tables");
  assert.match(backupWorkflow, /verify-backup-export\.mjs/, "backup exports must pass the Auth-table allowlist before encryption");
  assert.match(backupWorkflow, /roles\.sql schema\.sql auth-data\.sql data\.sql/, "the encrypted archive must include the verified account and application exports");
  assert.match(backupWorkflow, /backup-envelope\.mjs[\s\S]*encrypt/, "database exports must be encrypted before upload");
  assert.match(backupWorkflow, /aws s3 cp[\s\S]*\.tar\.gz\.enc/, "only the encrypted database envelope may be uploaded");
  assert.doesNotMatch(backupWorkflow, /upload-artifact/, "plaintext or encrypted user backups must not become public workflow artifacts");
  const backupEnvelope = await readFile(join(repoRoot, "scripts/backup-envelope.mjs"), "utf8");
  assert.match(backupEnvelope, /aes-256-gcm/, "backup payloads must use authenticated AES-256-GCM encryption");
  assert.match(backupEnvelope, /RSA_PKCS1_OAEP_PADDING/, "backup data keys must use RSA-OAEP wrapping");
  assert.match(backupEnvelope, /const handle = await open\(inputPath, "r"\);[\s\S]*const input = await handle\.stat\(\)/, "backup inspection must validate the same open file descriptor it reads");
  assert.match(backupEnvelope, /The private recovery key must use an absolute path outside the repository/, "recovery private keys must be rejected inside the source repository");
  const backupExportVerifier = await readFile(join(repoRoot, "scripts/verify-backup-export.mjs"), "utf8");
  assert.match(backupExportVerifier, /allowedAuthTables = new Set\(\["identities", "users"\]\)/, "Auth backups must use a closed table allowlist");
  assert.match(backupExportVerifier, /unapproved table/, "Auth backups must fail closed when a transient or unknown table appears");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
