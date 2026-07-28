const ALARM_PREFIX = "whynavo-task:";
const STORAGE_KEY = "whynavo:task-reminders:v1";

const isDueOn = (reminder, date) => {
  const weekday = date.getDay();
  if (reminder.recurrence === "daily") return true;
  if (reminder.recurrence === "weekdays") return weekday >= 1 && weekday <= 5;
  return weekday === (reminder.reminderWeekday ?? 0);
};

const nextAt = (reminder, from = new Date()) => {
  const [hour, minute] = String(reminder.reminderTime || "").split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined;
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() > from.getTime() && isDueOn(reminder, candidate)) return candidate.getTime();
  }
};

const replaceAlarms = async (reminders) => {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.filter((alarm) => alarm.name.startsWith(ALARM_PREFIX)).map((alarm) => chrome.alarms.clear(alarm.name)));
  await chrome.storage.local.set({ [STORAGE_KEY]: reminders });
  reminders.forEach((reminder) => {
    if (Number.isFinite(reminder.nextAt)) chrome.alarms.create(`${ALARM_PREFIX}${reminder.id}`, { when: reminder.nextAt });
  });
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "whynavo:sync-task-reminders" || !Array.isArray(message.reminders)) return undefined;
  void replaceAlarms(message.reminders).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const id = alarm.name.slice(ALARM_PREFIX.length);
  void chrome.storage.local.get(STORAGE_KEY).then(async (stored) => {
    const reminders = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    const reminder = reminders.find((item) => item?.id === id);
    if (!reminder) return;
    await chrome.notifications.create(`whynavo-task-${id}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "WhyNavo",
      message: reminder.language === "en-US" ? `Scheduled task: ${reminder.title}` : `固定任务：${reminder.title}`,
      priority: 1
    }).catch(() => undefined);
    const next = nextAt(reminder, new Date(Date.now() + 1000));
    if (next) chrome.alarms.create(alarm.name, { when: next });
  });
});

const restoreAlarms = () => {
  void chrome.storage.local.get(STORAGE_KEY).then((stored) => {
    const reminders = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    return replaceAlarms(reminders.map((reminder) => ({ ...reminder, nextAt: nextAt(reminder) })).filter((reminder) => reminder.nextAt));
  });
};

chrome.runtime.onStartup.addListener(restoreAlarms);
chrome.runtime.onInstalled.addListener(restoreAlarms);
