import type { Todo, UiLanguage } from "./types";

export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isRecurringTodoDueOn = (todo: Todo, date = new Date()) => {
  if (!todo.recurrence) return true;
  const weekday = date.getDay();
  if (todo.recurrence === "daily") return true;
  if (todo.recurrence === "weekdays") return weekday >= 1 && weekday <= 5;
  return weekday === (todo.reminderWeekday ?? 0);
};

export const isTodoCompletedForDate = (todo: Todo, date = new Date()) => (
  todo.recurrence ? todo.completedOn === localDateKey(date) : todo.done
);

export const nextTodoCompletion = (todo: Todo, date = new Date()): Pick<Todo, "done" | "completedOn"> => {
  if (!todo.recurrence) return { done: !todo.done, completedOn: todo.completedOn };
  const today = localDateKey(date);
  return { done: false, completedOn: todo.completedOn === today ? undefined : today };
};

export const recurrenceLabel = (todo: Todo, language: UiLanguage) => {
  if (todo.recurrence === "daily") return language === "en-US" ? "Every day" : "每天";
  if (todo.recurrence === "weekdays") return language === "en-US" ? "Weekdays" : "工作日";
  if (todo.recurrence === "weekly") {
    const weekday = Math.min(6, Math.max(0, todo.reminderWeekday ?? 0));
    const weekdayName = language === "en-US"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday]
      : ["日", "一", "二", "三", "四", "五", "六"][weekday];
    return language === "en-US" ? `Every ${weekdayName}` : `每周${weekdayName}`;
  }
  return language === "en-US" ? "One-time" : "单次";
};

const nextReminderAt = (todo: Todo, from = new Date()) => {
  if (!todo.recurrence || !todo.reminderTime) return undefined;
  const [hour, minute] = todo.reminderTime.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined;
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (
      candidate.getTime() <= from.getTime()
      || !isRecurringTodoDueOn(todo, candidate)
      || todo.completedOn === localDateKey(candidate)
    ) continue;
    return candidate.getTime();
  }
  return undefined;
};

export async function requestTaskReminderPermission() {
  if (globalThis.chrome?.runtime?.id && chrome.permissions?.request) {
    return chrome.permissions.request({ permissions: ["notifications"] });
  }
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

type ReminderMessageItem = {
  id: string;
  title: string;
  recurrence: NonNullable<Todo["recurrence"]>;
  reminderTime: string;
  reminderWeekday?: number;
  nextAt: number;
  language: UiLanguage;
};

const reminderItems = (todos: Todo[], language: UiLanguage): ReminderMessageItem[] => todos
  .filter((todo) => !todo.deletedAt && todo.recurrence && todo.reminderTime)
  .flatMap((todo) => {
    const nextAt = nextReminderAt(todo);
    if (!nextAt || !todo.recurrence || !todo.reminderTime) return [];
    return [{
      id: todo.id,
      title: todo.text,
      recurrence: todo.recurrence,
      reminderTime: todo.reminderTime,
      reminderWeekday: todo.reminderWeekday,
      nextAt,
      language
    }];
  });

export async function syncTaskReminders(todos: Todo[], language: UiLanguage) {
  if (!globalThis.chrome?.runtime?.id) return;
  const hasPermissions = await chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false);
  await chrome.runtime.sendMessage({
    type: "whynavo:sync-task-reminders",
    reminders: hasPermissions ? reminderItems(todos, language) : []
  }).catch(() => undefined);
}

const WEB_REMINDER_PREFIX = "whynavo:web-reminder:";

export function checkWebTaskReminders(todos: Todo[], language: UiLanguage, now = new Date()) {
  if (globalThis.chrome?.runtime?.id || !("Notification" in window) || Notification.permission !== "granted") return;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateKey = localDateKey(now);
  todos.forEach((todo) => {
    if (
      todo.deletedAt
      || !todo.recurrence
      || todo.reminderTime !== currentTime
      || !isRecurringTodoDueOn(todo, now)
      || isTodoCompletedForDate(todo, now)
    ) return;
    const notificationKey = `${WEB_REMINDER_PREFIX}${todo.id}:${dateKey}:${currentTime}`;
    if (sessionStorage.getItem(notificationKey)) return;
    sessionStorage.setItem(notificationKey, "1");
    new Notification("WhyNavo", {
      body: language === "en-US" ? `Scheduled task: ${todo.text}` : `固定任务：${todo.text}`,
      icon: "./icons/icon128.png",
      tag: `whynavo-task-${todo.id}`
    });
  });
}
