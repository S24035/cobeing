(() => {
  "use strict";

  const TASK_KEY = "cobeing_tasks_v1";
  const TEMPLATE_KEY = "cobeing_templates_v1";
  const TASK_SCHEMA_VERSION = 2;
  const TEMPLATE_SCHEMA_VERSION = 2;
  const HISTORY_KEY = "cobeing_task_history_v1";
  const HISTORY_SCHEMA_VERSION = 1;
  const HISTORY_LIMIT = 10;

  const STATUS_ORDER = ["not_done", "tried", "partial", "perfect"];
  const STATUS_LABELS = {
    not_done: "できなかった",
    tried: "やろうとした",
    partial: "途中まで",
    perfect: "完璧",
  };
  const PRIORITY_LABELS = {
    1: "特殊",
    2: "低め",
    3: "ふつう",
    4: "高め",
    5: "最重要",
  };

  const storageApi =
    window.CobeingStorage && typeof window.CobeingStorage.createStore === "function"
      ? window.CobeingStorage
      : { createStore: fallbackCreateStore };

  const taskStore = storageApi.createStore({
    key: TASK_KEY,
    version: TASK_SCHEMA_VERSION,
    defaultData: { tasks: [] },
    migrate: migrateTaskStore,
  });

  const templateStore = storageApi.createStore({
    key: TEMPLATE_KEY,
    version: TEMPLATE_SCHEMA_VERSION,
    defaultData: { templates: [] },
    migrate: migrateTemplateStore,
  });

  const historyStore = storageApi.createStore({
    key: HISTORY_KEY,
    version: HISTORY_SCHEMA_VERSION,
    defaultData: { items: [] },
    migrate: migrateHistoryStore,
  });

  const state = {
    tasks: [],
    templates: [],
    history: [],
  };

  let initialized = false;

  function fallbackCreateStore(options) {
    const key = options && options.key ? String(options.key) : "";
    const version = Number(options && options.version) || 1;
    const defaultData = options && options.defaultData ? options.defaultData : {};
    const migrate = typeof options.migrate === "function" ? options.migrate : null;

    function load() {
      if (!key) return { schemaVersion: version, data: defaultData };
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return { schemaVersion: version, data: defaultData };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return { schemaVersion: version, data: defaultData };
        }
        let data = parsed.data || defaultData;
        const currentVersion = Number(parsed.schemaVersion || 0) || 0;
        if (currentVersion !== version && migrate) {
          const migrated = migrate(data, currentVersion, version);
          data = migrated && migrated.data ? migrated.data : migrated || defaultData;
          save(data);
        }
        return { schemaVersion: version, data };
      } catch {
        return { schemaVersion: version, data: defaultData };
      }
    }

    function save(data) {
      if (!key) return;
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ schemaVersion: version, data: data || defaultData })
        );
      } catch (err) {
        console.warn("[task storage] save failed", err);
      }
    }

    return { load, save, key, version };
  }

  function init() {
    if (initialized) return;
    loadState();
    initialized = true;
  }

  function migrateTaskStore(data) {
    const list = Array.isArray(data) ? data : data && Array.isArray(data.tasks) ? data.tasks : [];
    const tasks = list.map((task) => normalizeTask(task)).filter(Boolean);
    return { data: { tasks } };
  }

  function migrateTemplateStore(data) {
    const list = Array.isArray(data)
      ? data
      : data && Array.isArray(data.templates)
      ? data.templates
      : [];
    const templates = list.map((tpl) => normalizeTemplate(tpl)).filter(Boolean);
    return { data: { templates } };
  }

  function migrateHistoryStore(data) {
    const list = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : [];
    const items = list.map((item) => normalizeHistoryItem(item)).filter(Boolean).slice(0, HISTORY_LIMIT);
    return { data: { items } };
  }

  function loadState() {
    const taskData = taskStore.load().data;
    const tasks = Array.isArray(taskData.tasks) ? taskData.tasks : [];
    state.tasks = tasks.map((task) => normalizeTask(task)).filter(Boolean);

    const templateData = templateStore.load().data;
    const templates = Array.isArray(templateData.templates) ? templateData.templates : [];
    state.templates = templates.map((tpl) => normalizeTemplate(tpl)).filter(Boolean);

    const historyData = historyStore.load().data;
    const items = Array.isArray(historyData.items) ? historyData.items : [];
    state.history = items.map((item) => normalizeHistoryItem(item)).filter(Boolean).slice(0, HISTORY_LIMIT);
  }

  function saveTasks() {
    taskStore.save({ tasks: state.tasks });
  }

  function saveTemplates() {
    templateStore.save({ templates: state.templates });
  }

  function saveHistory() {
    historyStore.save({ items: state.history });
  }

  function createId(prefix) {
    if (window.crypto && window.crypto.randomUUID) {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
  }

  function clampPriority(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 3;
    return Math.min(5, Math.max(1, Math.round(num)));
  }

  function normalizeStatus(status) {
    const value = String(status || "").trim();
    return STATUS_ORDER.includes(value) ? value : "not_done";
  }

  function normalizeIsoString(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString();
  }

  function normalizeDueAt(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed}T23:59`;
    }
    const parsed = parseLocalDateTime(trimmed);
    if (!parsed) return "";
    return formatLocalDateTime(parsed);
  }

  function normalizeTask(raw) {
    if (!raw || typeof raw !== "object") return null;
    const now = new Date().toISOString();
    const status = normalizeStatus(raw.status);
    const createdAt = normalizeIsoString(raw.createdAt) || now;
    const updatedAt = normalizeIsoString(raw.updatedAt) || createdAt;
    const statusUpdatedAt =
      normalizeIsoString(raw.statusUpdatedAt) ||
      (status !== "not_done" ? updatedAt : "");

    return {
      ...raw,
      id: raw.id ? String(raw.id) : createId("task"),
      title: String(raw.title || "").trim(),
      priority: clampPriority(raw.priority),
      dueAt: normalizeDueAt(raw.dueAt),
      category: String(raw.category || "").trim(),
      status,
      statusUpdatedAt,
      createdAt,
      updatedAt,
    };
  }

  function normalizeTemplate(raw) {
    if (!raw || typeof raw !== "object") return null;
    const now = new Date().toISOString();
    const baseDate = normalizeDateKey(raw.baseDate) || formatDateKey(new Date());
    const items = Array.isArray(raw.items)
      ? raw.items
          .map((item) => normalizeTemplateItem(item, baseDate))
          .filter(Boolean)
      : [];

    return {
      ...raw,
      id: raw.id ? String(raw.id) : createId("tpl"),
      name: String(raw.name || "").trim(),
      baseDate,
      items,
      createdAt: normalizeIsoString(raw.createdAt) || now,
      updatedAt: normalizeIsoString(raw.updatedAt) || now,
    };
  }

  function normalizeTemplateItem(raw, baseDateKey) {
    if (!raw || typeof raw !== "object") return null;
    const now = new Date().toISOString();
    const dueAt = normalizeTemplateDueAt(raw, baseDateKey);
    return {
      ...raw,
      id: raw.id ? String(raw.id) : createId("tpl_item"),
      title: String(raw.title || "").trim(),
      priority: clampPriority(raw.priority),
      category: String(raw.category || "").trim(),
      dueAt,
      createdAt: normalizeIsoString(raw.createdAt) || now,
      updatedAt: normalizeIsoString(raw.updatedAt) || now,
    };
  }

  function normalizeHistoryItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const now = new Date().toISOString();
    const title = String(raw.title || "").trim();
    if (!title) return null;
    return {
      ...raw,
      id: raw.id ? String(raw.id) : createId("hist"),
      title,
      priority: clampPriority(raw.priority),
      category: String(raw.category || "").trim(),
      dueTime: normalizeTimeValue(raw.dueTime),
      createdAt: normalizeIsoString(raw.createdAt) || now,
    };
  }

  function normalizeTemplateDueAt(raw, baseDateKey) {
    if (raw && raw.dueAt) return normalizeDueAt(raw.dueAt);
    const offset = Number(raw && raw.dueOffsetDays);
    if (Number.isFinite(offset) && baseDateKey) {
      const baseDate = parseDateKey(baseDateKey);
      if (!baseDate) return "";
      const next = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset);
      return normalizeDueAt(formatDateKey(next));
    }
    return "";
  }

  function getTasks() {
    return state.tasks.filter((task) => !task.isRepeatTemplate).map((task) => ({ ...task }));
  }

  function getActiveTasks() {
    return getTasks().filter((task) => !isReportedTask(task));
  }

  function getTemplates() {
    return state.templates.map((tpl) => ({ ...tpl, items: (tpl.items || []).map((item) => ({ ...item })) }));
  }

  function getTaskHistory() {
    return state.history.map((item) => ({ ...item }));
  }

  function getTaskById(id) {
    return state.tasks.find((task) => task.id === id) || null;
  }

  function getTemplateById(id) {
    return state.templates.find((tpl) => tpl.id === id) || null;
  }

  function addTask(data) {
    const now = new Date().toISOString();
    const task = normalizeTask({
      ...data,
      createdAt: now,
      updatedAt: now,
      status: data && data.status ? data.status : "not_done",
    });
    if (!task) return null;
    state.tasks.push(task);
    saveTasks();
    return { ...task };
  }

  function updateTask(id, patch) {
    const index = state.tasks.findIndex((task) => task.id === id);
    if (index === -1) return null;
    const prev = state.tasks[index];
    const prevStatusUpdatedAt = prev.statusUpdatedAt || "";
    const nextRaw = {
      ...prev,
      ...patch,
      id: prev.id,
      createdAt: prev.createdAt,
    };
    const next = normalizeTask(nextRaw);
    const statusChanged = "status" in patch && normalizeStatus(patch.status) !== prev.status;
    const hasStatusUpdatedAt = "statusUpdatedAt" in patch;
    if (statusChanged) {
      if (!hasStatusUpdatedAt) next.statusUpdatedAt = new Date().toISOString();
    } else if (hasStatusUpdatedAt) {
      next.statusUpdatedAt = normalizeIsoString(patch.statusUpdatedAt) || "";
    } else {
      next.statusUpdatedAt = prevStatusUpdatedAt;
    }
    next.updatedAt = new Date().toISOString();
    state.tasks[index] = next;
    saveTasks();
    const statusReported =
      statusChanged ||
      (hasStatusUpdatedAt && next.statusUpdatedAt && next.statusUpdatedAt !== prevStatusUpdatedAt);
    if (statusReported) {
      addHistoryFromTask(next);
    }
    return { ...next };
  }

  function deleteTask(id) {
    const before = state.tasks.length;
    state.tasks = state.tasks.filter((task) => task.id !== id);
    if (state.tasks.length !== before) saveTasks();
  }

  function setTaskStatus(id, status) {
    const task = getTaskById(id);
    if (!task) return null;
    const nextStatus = normalizeStatus(status);
    if (task.status === nextStatus) return { ...task };
    const now = new Date().toISOString();
    task.status = nextStatus;
    task.statusUpdatedAt = now;
    task.updatedAt = now;
    saveTasks();
    addHistoryFromTask(task);
    return { ...task };
  }

  function addTemplate(name) {
    const now = new Date().toISOString();
    const template = normalizeTemplate({
      name: name || "",
      items: [],
      createdAt: now,
      updatedAt: now,
    });
    if (!template) return null;
    state.templates.push(template);
    saveTemplates();
    return { ...template };
  }

  function updateTemplate(id, patch) {
    const index = state.templates.findIndex((tpl) => tpl.id === id);
    if (index === -1) return null;
    const prev = state.templates[index];
    const next = normalizeTemplate({
      ...prev,
      ...patch,
      id: prev.id,
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
    });
    state.templates[index] = next;
    saveTemplates();
    return { ...next };
  }

  function removeTemplate(id) {
    const before = state.templates.length;
    state.templates = state.templates.filter((tpl) => tpl.id !== id);
    if (state.templates.length !== before) saveTemplates();
  }

  function addTemplateItem(templateId, data) {
    const template = getTemplateById(templateId);
    if (!template) return null;
    const item = normalizeTemplateItem(data, template.baseDate);
    if (!item) return null;
    template.items = template.items || [];
    template.items.push(item);
    template.updatedAt = new Date().toISOString();
    saveTemplates();
    return { ...item };
  }

  function updateTemplateItem(templateId, itemId, patch) {
    const template = getTemplateById(templateId);
    if (!template || !Array.isArray(template.items)) return null;
    const index = template.items.findIndex((item) => item.id === itemId);
    if (index === -1) return null;
    const prev = template.items[index];
    const next = normalizeTemplateItem(
      { ...prev, ...patch, id: prev.id, createdAt: prev.createdAt },
      template.baseDate
    );
    next.updatedAt = new Date().toISOString();
    template.items[index] = next;
    template.updatedAt = new Date().toISOString();
    saveTemplates();
    return { ...next };
  }

  function removeTemplateItem(templateId, itemId) {
    const template = getTemplateById(templateId);
    if (!template || !Array.isArray(template.items)) return;
    const before = template.items.length;
    template.items = template.items.filter((item) => item.id !== itemId);
    if (template.items.length !== before) {
      template.updatedAt = new Date().toISOString();
      saveTemplates();
    }
  }

  function removeHistoryItem(id) {
    const before = state.history.length;
    state.history = state.history.filter((item) => item.id !== id);
    if (state.history.length !== before) saveHistory();
  }

  function applyTemplate(templateId, date = new Date()) {
    const template = getTemplateById(templateId);
    if (!template || !Array.isArray(template.items)) return [];
    const dateKey = formatDateKey(date);
    const created = [];
    template.items.forEach((item) => {
      const dueAt = item.dueAt ? buildDueAtForDate(dateKey, getTimeFromDueAt(item.dueAt)) : "";
      const task = addTask({
        title: item.title,
        priority: item.priority,
        category: item.category,
        dueAt,
        status: "not_done",
      });
      if (task) created.push(task);
    });
    return created;
  }

  function getTasksForDateKey(dateKey) {
    const key = normalizeDateKey(dateKey);
    if (!key) return [];
    return getTasks().filter((task) => normalizeDateKey(task.dueAt) === key);
  }

  function getTasksReportedForDateKey(dateKey) {
    const key = normalizeDateKey(dateKey);
    if (!key) return [];
    return getTasks().filter((task) => normalizeDateKey(task.statusUpdatedAt) === key);
  }

  function getRemainingInfo(dueAt, now = new Date()) {
    if (!dueAt) {
      return { label: "—", state: "none", minutes: null, isOverdue: false };
    }
    const dueDate = parseLocalDateTime(dueAt);
    if (!dueDate) {
      return { label: "—", state: "none", minutes: null, isOverdue: false };
    }
    const diffMs = dueDate.getTime() - now.getTime();
    const diffMinutes = Math.max(1, Math.round(Math.abs(diffMs) / 60000));
    const core = formatDuration(diffMinutes);
    if (diffMs < 0) {
      return { label: `期限切れ ${core}`, state: "overdue", minutes: -diffMinutes, isOverdue: true };
    }
    return { label: `残り ${core}`, state: "upcoming", minutes: diffMinutes, isOverdue: false };
  }

  function getRecommendedTask(tasks) {
    const openTasks = (tasks || getTasks()).filter((task) => !isReportedTask(task));
    if (!openTasks.length) return null;
    return sortTasksByDue(openTasks)[0] || null;
  }

  const ANALYSIS_RANGE_DAYS = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };

  function buildDateKeysForRange(rangeKey, now = new Date()) {
    const days = ANALYSIS_RANGE_DAYS[rangeKey] || 1;
    const keys = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      keys.push(formatDateKey(d));
    }
    return keys;
  }

  function buildAnalysisForDateKeys(dateKeys) {
    const taskMap = new Map();
    (dateKeys || []).forEach((key) => {
      const dueTasks = getTasksForDateKey(key);
      const reportedTasks = getTasksReportedForDateKey(key);
      dueTasks.forEach((task) => taskMap.set(task.id, task));
      reportedTasks.forEach((task) => taskMap.set(task.id, task));
    });
    const rangeTasks = Array.from(taskMap.values());
    const counts = countByStatus(rangeTasks);
    const categories = {};

    rangeTasks.forEach((task) => {
      const name = task.category || "未分類";
      if (!categories[name]) {
        categories[name] = {
          name,
          total: 0,
          counts: { not_done: 0, tried: 0, partial: 0, perfect: 0 },
        };
      }
      const bucket = categories[name];
      bucket.total += 1;
      const key = STATUS_ORDER.includes(task.status) ? task.status : "not_done";
      bucket.counts[key] += 1;
    });

    const list = Object.values(categories).sort((a, b) => b.total - a.total);
    const topIncomplete = [...list]
      .map((item) => ({
        ...item,
        incomplete: item.total - item.counts.perfect,
      }))
      .sort((a, b) => b.incomplete - a.incomplete)
      .slice(0, 3);

    return {
      total: rangeTasks.length,
      counts,
      categories: list,
      topIncomplete,
    };
  }

  function getAnalysisForRange(rangeKey) {
    const key = rangeKey || "day";
    const dateKeys = buildDateKeysForRange(key);
    return buildAnalysisForDateKeys(dateKeys);
  }

  function getTodayAnalysis() {
    return getAnalysisForRange("day");
  }

  function shouldHandleChat(text) {
    if (!text) return false;
    const value = String(text).toLowerCase();
    const patterns = [
      /今日.*(タスク|状況)/,
      /(タスク|状況).*(どう|教えて|知りたい)/,
      /期限.*(近|迫)/,
      /優先(度)?[^\n]*高/,
    ];
    return patterns.some((pattern) => pattern.test(value));
  }

  function buildChatSummary() {
    const todayKey = formatDateKey(new Date());
    const todayTasks = getTasksForDateKey(todayKey);
    const counts = countByStatus(todayTasks);
    const openTasks = getActiveTasks();
    const dueSoon = sortTasksByDue(
      openTasks.filter((task) => {
        if (!task.dueAt) return false;
        const info = getRemainingInfo(task.dueAt);
        return info.state === "overdue" || (info.minutes !== null && info.minutes <= 24 * 60);
      })
    ).slice(0, 3);
    const highPriority = sortTasksByPriority(openTasks.filter((task) => task.priority >= 4)).slice(0, 3);
    const recommended = getRecommendedTask(openTasks);

    const lines = [];
    lines.push("今日のタスク状況だよ。");
    if (todayTasks.length === 0) {
      lines.push("今日は期限のあるタスクがまだないよ。");
    } else {
      lines.push(
        `- 完璧 ${counts.perfect} / 途中 ${counts.partial} / やろうとした ${counts.tried} / できなかった ${counts.not_done}`
      );
    }

    if (dueSoon.length) {
      lines.push(`- 期限が近い: ${dueSoon.map(formatTaskShort).join("、")}`);
    } else {
      lines.push("- 期限が近い: 今はなし");
    }

    if (highPriority.length) {
      lines.push(`- 優先度高め: ${highPriority.map((task) => task.title).join("、")}`);
    } else {
      lines.push("- 優先度高め: 今はなし");
    }

    if (recommended) {
      const remaining = getRemainingInfo(recommended.dueAt);
      const label = remaining.state === "none" ? "期限なし" : remaining.label;
      lines.push(`- 次にやるなら: ${recommended.title}（${label}）`);
    } else {
      lines.push("- 次にやるなら: 今日はゆっくりでOK");
    }

    return lines.join("\n");
  }

  function formatTaskShort(task) {
    const remaining = getRemainingInfo(task.dueAt);
    const label = remaining.state === "none" ? "期限なし" : remaining.label;
    return `${task.title}${label ? `（${label}）` : ""}`;
  }

  function countByStatus(tasks) {
    const counts = { not_done: 0, tried: 0, partial: 0, perfect: 0 };
    tasks.forEach((task) => {
      const key = STATUS_ORDER.includes(task.status) ? task.status : "not_done";
      counts[key] += 1;
    });
    return counts;
  }

  function normalizeDateKey(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = parseLocalDateTime(trimmed);
    if (!parsed) return "";
    return formatDateKey(parsed);
  }

  function parseDateKey(key) {
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [y, m, d] = key.split("-").map((n) => parseInt(n, 10));
    return new Date(y, m - 1, d);
  }

  function pad2(num) {
    return String(num).padStart(2, "0");
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function formatTime(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function formatLocalDateTime(date) {
    return `${formatDateKey(date)}T${formatTime(date)}`;
  }

  function parseLocalDateTime(value) {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      trimmed
    );
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      const hh = match[4] ? Number(match[4]) : 0;
      const mm = match[5] ? Number(match[5]) : 0;
      const ss = match[6] ? Number(match[6]) : 0;
      return new Date(y, m - 1, d, hh, mm, ss);
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  function formatDuration(totalMinutes) {
    const minutes = Math.max(1, Math.round(totalMinutes));
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    const mins = minutes % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    if (days === 0 && mins > 0) parts.push(`${mins}m`);
    return parts.join(" ");
  }

  function normalizeTimeValue(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!match) return "";
    const hh = Math.min(23, Math.max(0, Number(match[1])));
    const mm = Math.min(59, Math.max(0, Number(match[2])));
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  function buildDueAtForToday(timeValue) {
    const time = normalizeTimeValue(timeValue);
    if (!time) return "";
    return buildDueAtForDate(formatDateKey(new Date()), time);
  }

  function buildDueAtForDate(dateValue, timeValue) {
    const dateKey = normalizeDateKey(dateValue);
    if (!dateKey) return "";
    const time = normalizeTimeValue(timeValue) || "23:59";
    return `${dateKey}T${time}`;
  }

  function buildDueAtFromMinutes(minutes) {
    const mins = Number(minutes);
    if (!Number.isFinite(mins)) return "";
    const now = new Date();
    const next = new Date(now.getTime() + mins * 60000);
    return formatLocalDateTime(next);
  }

  function parseDueAt(dueAt) {
    if (!dueAt) return null;
    const parsed = parseLocalDateTime(dueAt);
    if (!parsed) return null;
    return { dateKey: formatDateKey(parsed), time: formatTime(parsed) };
  }

  function getTimeFromDueAt(dueAt) {
    const parsed = parseDueAt(dueAt);
    return parsed ? parsed.time : "";
  }

  function sortTasksByDue(tasks) {
    const list = [...tasks];
    list.sort((a, b) => {
      const aDate = parseLocalDateTime(a.dueAt);
      const bDate = parseLocalDateTime(b.dueAt);
      const aTime = aDate ? aDate.getTime() : Number.POSITIVE_INFINITY;
      const bTime = bDate ? bDate.getTime() : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return (a.title || "").localeCompare((b.title || ""), "ja");
    });
    return list;
  }

  function sortTasksByPriority(tasks) {
    const list = [...tasks];
    list.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      const aDate = parseLocalDateTime(a.dueAt);
      const bDate = parseLocalDateTime(b.dueAt);
      const aTime = aDate ? aDate.getTime() : Number.POSITIVE_INFINITY;
      const bTime = bDate ? bDate.getTime() : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return (a.title || "").localeCompare((b.title || ""), "ja");
    });
    return list;
  }

  function getStatusLabels() {
    return { ...STATUS_LABELS };
  }

  function getPriorityLabel(value) {
    const key = Number(value);
    return PRIORITY_LABELS[key] || "";
  }

  function getHistoryKey(item) {
    return `${(item.title || "").toLowerCase()}|${item.priority}|${(item.category || "").toLowerCase()}|${
      item.dueTime || ""
    }`;
  }

  function isReportedTask(task) {
    return Boolean(task && task.statusUpdatedAt);
  }

  function addHistoryFromTask(task) {
    if (!task) return;
    const item = normalizeHistoryItem({
      title: task.title,
      priority: task.priority,
      category: task.category,
      dueTime: getTimeFromDueAt(task.dueAt),
      createdAt: new Date().toISOString(),
    });
    if (!item) return;
    const key = getHistoryKey(item);
    state.history = state.history.filter((entry) => getHistoryKey(entry) !== key);
    state.history.unshift(item);
    if (state.history.length > HISTORY_LIMIT) {
      state.history = state.history.slice(0, HISTORY_LIMIT);
    }
    saveHistory();
  }

  window.TaskDomain = {
    init,
    getTasks,
    getActiveTasks,
    getTemplates,
    getTaskHistory,
    getTaskById,
    getTemplateById,
    addTask,
    updateTask,
    deleteTask,
    setTaskStatus,
    addTemplate,
    updateTemplate,
    removeTemplate,
    addTemplateItem,
    updateTemplateItem,
    removeTemplateItem,
    removeHistoryItem,
    applyTemplate,
    getTasksForDateKey,
    getRemainingInfo,
    getRecommendedTask,
    getAnalysisForRange,
    getTodayAnalysis,
    shouldHandleChat,
    buildChatSummary,
    normalizeDueAt,
    parseDueAt,
    buildDueAtForToday,
    buildDueAtForDate,
    buildDueAtFromMinutes,
    sortTasksByDue,
    sortTasksByPriority,
    getStatusLabels,
    getPriorityLabel,
  };
})();
