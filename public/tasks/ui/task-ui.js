(() => {
  "use strict";

  const TaskDomain = window.TaskDomain;
  if (!TaskDomain) {
    console.warn("[task-ui] TaskDomain is missing.");
    return;
  }

  const STATUS_LABELS = TaskDomain.getStatusLabels
    ? TaskDomain.getStatusLabels()
    : {
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
  const ANALYSIS_RANGE_LABELS = {
    day: "今日",
    week: "1週間",
    month: "1か月",
    year: "1年",
  };

  const dom = {};
  const dueScopes = {};
  const callbacks = {
    onClose: null,
    onDataChange: null,
  };

  const uiState = {
    mode: "daily",
    tab: "list",
    analysisRange: "day",
    reportTaskId: null,
    reportPrevStatus: null,
    reportPrevStatusUpdatedAt: null,
    undoTaskId: null,
    undoPrevStatus: null,
    undoPrevStatusUpdatedAt: null,
    undoTimer: null,
    sheet: {
      mode: "task",
      taskId: null,
      templateId: null,
      itemId: null,
    },
  };

  let initialized = false;

  function getPriorityLabel(value) {
    if (TaskDomain.getPriorityLabel) return TaskDomain.getPriorityLabel(value);
    const key = Number(value);
    return PRIORITY_LABELS[key] || String(value || "");
  }

  function init(options) {
    if (initialized) return;
    TaskDomain.init();
    Object.assign(callbacks, options || {});
    cacheDom();
    bindEvents();
    refresh();
    initialized = true;
  }

  function open() {
    if (!dom.app || !dom.tasksView) return;
    dom.app.classList.remove("profile-mode", "diary-mode", "calendar-mode");
    dom.app.classList.add("tasks-mode");
    setMode(uiState.mode);
    setTab(uiState.tab);
    refresh();
  }

  function close(goToChat = true) {
    if (dom.app) dom.app.classList.remove("tasks-mode");
    if (goToChat && typeof callbacks.onClose === "function") {
      callbacks.onClose();
    }
  }

  function refresh() {
    renderHeader();
    renderList();
    renderTemplates();
    renderHistory();
    renderAnalysis();
  }

  function cacheDom() {
    dom.app = document.querySelector(".app");
    dom.tasksView = document.getElementById("tasksView");
    dom.tasksCloseBtn = document.getElementById("tasksCloseBtn");
    dom.tasksModeSwitch = document.getElementById("tasksModeSwitch");
    dom.tasksSubtitle = document.getElementById("tasksSubtitle");
    dom.tasksSubnav = document.getElementById("tasksSubnav");
    dom.nextTaskHint = document.getElementById("nextTaskHint");
    dom.nextTaskBox = document.getElementById("nextTaskBox");
    dom.taskList = document.getElementById("taskList");
    dom.taskListCount = document.getElementById("taskListCount");

    dom.quickTaskTitle = document.getElementById("quickTaskTitle");
    dom.quickTaskPriority = document.getElementById("quickTaskPriority");
    dom.quickTaskCategory = document.getElementById("quickTaskCategory");
    dom.quickTaskAddBtn = document.getElementById("quickTaskAddBtn");
    dom.quickTaskOpenBtn = document.getElementById("quickTaskOpenBtn");

    dom.templateNameInput = document.getElementById("templateNameInput");
    dom.createTemplateBtn = document.getElementById("createTemplateBtn");
    dom.templateList = document.getElementById("templateList");
    dom.templateCount = document.getElementById("templateCount");
    dom.historyList = document.getElementById("historyList");
    dom.historyCount = document.getElementById("historyCount");

    dom.analysisTotalCount = document.getElementById("analysisTotalCount");
    dom.analysisNotDoneCount = document.getElementById("analysisNotDoneCount");
    dom.analysisTriedCount = document.getElementById("analysisTriedCount");
    dom.analysisPartialCount = document.getElementById("analysisPartialCount");
    dom.analysisPerfectCount = document.getElementById("analysisPerfectCount");
    dom.analysisRangeButtons = document.getElementById("analysisRangeButtons");
    dom.analysisRangeTitle = document.getElementById("analysisRangeTitle");
    dom.analysisCategorySub = document.getElementById("analysisCategorySub");
    dom.analysisCategoryList = document.getElementById("analysisCategoryList");
    dom.analysisTopList = document.getElementById("analysisTopList");

    dom.reportSheet = document.getElementById("taskReportSheet");
    dom.reportSub = document.getElementById("taskReportSub");
    dom.reportOptions = document.getElementById("taskReportOptions");
    dom.reportCancelBtn = document.getElementById("taskReportCancelBtn");

    dom.undoToast = document.getElementById("taskUndoToast");
    dom.undoText = document.getElementById("taskUndoText");
    dom.undoBtn = document.getElementById("taskUndoBtn");

    dom.taskSheet = document.getElementById("taskSheet");
    dom.taskSheetTitle = document.getElementById("taskSheetTitle");
    dom.taskSheetSub = document.getElementById("taskSheetSub");
    dom.taskSheetTitleInput = document.getElementById("taskSheetTitleInput");
    dom.taskSheetPriority = document.getElementById("taskSheetPriority");
    dom.taskSheetCategory = document.getElementById("taskSheetCategory");
    dom.taskSheetStatusField = document.getElementById("taskSheetStatusField");
    dom.taskSheetStatus = document.getElementById("taskSheetStatus");
    dom.taskSheetDeleteBtn = document.getElementById("taskSheetDeleteBtn");
    dom.taskSheetCancelBtn = document.getElementById("taskSheetCancelBtn");
    dom.taskSheetSaveBtn = document.getElementById("taskSheetSaveBtn");
    dom.taskSheetCloseBtn = document.getElementById("taskSheetCloseBtn");

    dueScopes.quick = setupDueScope("quick");
    dueScopes.sheet = setupDueScope("sheet");
  }

  function setupDueScope(scope) {
    const root = document.querySelector(`.due-mode[data-due-scope="${scope}"]`);
    if (!root) return null;
    const buttons = Array.from(root.querySelectorAll(".due-mode-btn"));
    const inputRows = Array.from(root.querySelectorAll(".due-input-row"));
    const timeTodayInput = root.querySelector('[data-role="time-today"]');
    const dateInput = root.querySelector('[data-role="date"]');
    const timeDateInput = root.querySelector('[data-role="time-date"]');
    const quickButtons = Array.from(root.querySelectorAll(".due-quick-btn"));

    const scopeState = {
      root,
      mode: "none",
      buttons,
      inputRows,
      timeTodayInput,
      dateInput,
      timeDateInput,
      quickButtons,
    };

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-due-mode");
        setDueMode(scope, mode);
      });
    });

    quickButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const minutes = Number(btn.getAttribute("data-due-minutes"));
        const dueAt = TaskDomain.buildDueAtFromMinutes(minutes);
        const parsed = TaskDomain.parseDueAt(dueAt);
        if (!parsed) return;
        const todayKey = getDateKey(new Date());
        if (parsed.dateKey === todayKey) {
          setDueMode(scope, "time");
          if (timeTodayInput) timeTodayInput.value = parsed.time;
        } else {
          setDueMode(scope, "date");
          if (dateInput) dateInput.value = parsed.dateKey;
          if (timeDateInput) timeDateInput.value = parsed.time;
        }
      });
    });

    setDueMode(scope, "none");
    return scopeState;
  }

  function bindEvents() {
    if (dom.tasksCloseBtn) {
      dom.tasksCloseBtn.addEventListener("click", () => close(true));
    }

    if (dom.tasksModeSwitch) {
      dom.tasksModeSwitch.addEventListener("click", (e) => {
        const btn = e.target.closest(".tasks-mode-btn");
        if (!btn) return;
        const mode = btn.getAttribute("data-mode");
        setMode(mode);
      });
    }

    if (dom.tasksSubnav) {
      dom.tasksSubnav.addEventListener("click", (e) => {
        const btn = e.target.closest(".tasks-tab");
        if (!btn) return;
        const tab = btn.getAttribute("data-tasks-tab");
        setTab(tab);
      });
    }

    if (dom.analysisRangeButtons) {
      dom.analysisRangeButtons.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-range]");
        if (!btn) return;
        const range = btn.getAttribute("data-range");
        setAnalysisRange(range);
      });
    }

    if (dom.quickTaskAddBtn) {
      dom.quickTaskAddBtn.addEventListener("click", () => handleQuickAdd(false));
    }

    if (dom.quickTaskOpenBtn) {
      dom.quickTaskOpenBtn.addEventListener("click", () => handleQuickAdd(true));
    }

    if (dom.createTemplateBtn) {
      dom.createTemplateBtn.addEventListener("click", handleCreateTemplate);
    }

    if (dom.templateList) {
      dom.templateList.addEventListener("click", (e) => {
        const actionBtn = e.target.closest("[data-action]");
        const card = e.target.closest("[data-template-id]");
        if (!card) return;
        const templateId = card.getAttribute("data-template-id");
        if (actionBtn) {
          const action = actionBtn.getAttribute("data-action");
          handleTemplateAction(action, templateId);
          return;
        }
        const itemEl = e.target.closest("[data-item-id]");
        if (itemEl) {
          const itemId = itemEl.getAttribute("data-item-id");
          openTemplateItemSheet(templateId, itemId);
        }
      });
    }

    if (dom.reportOptions) {
      dom.reportOptions.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-status]");
        if (!btn) return;
        const status = btn.getAttribute("data-status");
        applyReportStatus(status);
      });
    }

    if (dom.reportCancelBtn) {
      dom.reportCancelBtn.addEventListener("click", () => closeReportSheet());
    }

    if (dom.reportSheet) {
      dom.reportSheet.addEventListener("click", (e) => {
        if (e.target === dom.reportSheet) closeReportSheet();
      });
    }

    if (dom.undoBtn) {
      dom.undoBtn.addEventListener("click", handleUndo);
    }

    if (dom.taskSheetCloseBtn) dom.taskSheetCloseBtn.addEventListener("click", closeTaskSheet);
    if (dom.taskSheetCancelBtn) dom.taskSheetCancelBtn.addEventListener("click", closeTaskSheet);
    if (dom.taskSheetSaveBtn) dom.taskSheetSaveBtn.addEventListener("click", saveTaskSheet);
    if (dom.taskSheetDeleteBtn) dom.taskSheetDeleteBtn.addEventListener("click", deleteFromSheet);

    if (dom.taskSheet) {
      dom.taskSheet.addEventListener("click", (e) => {
        if (e.target === dom.taskSheet) closeTaskSheet();
      });
    }
  }

  function setMode(mode) {
    if (!mode) return;
    uiState.mode = mode;
    if (dom.tasksModeSwitch) {
      dom.tasksModeSwitch.querySelectorAll(".tasks-mode-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
      });
    }
    if (dom.tasksView) {
      dom.tasksView.querySelectorAll("[data-mode-panel]").forEach((panel) => {
        panel.style.display = panel.getAttribute("data-mode-panel") === mode ? "block" : "none";
      });
    }
  }

  function setTab(tab) {
    if (!tab) return;
    uiState.tab = tab;
    if (dom.tasksView) {
      dom.tasksView.querySelectorAll("[data-tasks-panel]").forEach((panel) => {
        panel.classList.toggle("active", panel.getAttribute("data-tasks-panel") === tab);
      });
    }
    if (dom.tasksSubnav) {
      dom.tasksSubnav.querySelectorAll(".tasks-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-tasks-tab") === tab);
      });
    }
  }

  function setAnalysisRange(range) {
    if (!range) return;
    uiState.analysisRange = range;
    updateAnalysisRangeButtons();
    renderAnalysis();
  }

  function updateAnalysisRangeButtons() {
    if (!dom.analysisRangeButtons) return;
    dom.analysisRangeButtons.querySelectorAll(".analysis-range-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-range") === uiState.analysisRange);
    });
  }

  function renderHeader() {
    if (!dom.tasksSubtitle) return;
    const openCount = TaskDomain.getActiveTasks().length;
    dom.tasksSubtitle.textContent = openCount ? `未完了 ${openCount}件` : "ゆっくりでOKだよ";
  }

  function renderList() {
    if (!dom.taskList || !dom.nextTaskBox) return;
    const tasks = TaskDomain.sortTasksByDue(TaskDomain.getActiveTasks());
    const recommended = TaskDomain.getRecommendedTask(tasks);

    dom.nextTaskBox.innerHTML = "";
    if (!recommended) {
      dom.nextTaskBox.className = "task-empty";
      dom.nextTaskBox.textContent = "今はおすすめがないよ";
      if (dom.nextTaskHint) dom.nextTaskHint.textContent = "---";
    } else {
      dom.nextTaskBox.className = "";
      dom.nextTaskBox.appendChild(createTaskRow(recommended));
      if (dom.nextTaskHint) dom.nextTaskHint.textContent = "期限と優先度から選んだよ";
    }

    dom.taskList.innerHTML = "";
    if (!tasks.length) {
      const empty = document.createElement("div");
      empty.className = "task-empty";
      empty.textContent = "タスクがまだないよ。";
      dom.taskList.appendChild(empty);
    } else {
      tasks.forEach((task) => dom.taskList.appendChild(createTaskRow(task)));
    }

    if (dom.taskListCount) {
      dom.taskListCount.textContent = tasks.length ? `${tasks.length}件` : "なし";
    }
  }

  function renderTemplates() {
    if (!dom.templateList) return;
    const templates = TaskDomain.getTemplates();
    dom.templateList.innerHTML = "";

    if (dom.templateCount) {
      dom.templateCount.textContent = templates.length ? `${templates.length}件` : "なし";
    }

    if (!templates.length) {
      const empty = document.createElement("div");
      empty.className = "task-empty";
      empty.textContent = "テンプレはまだないよ。";
      dom.templateList.appendChild(empty);
      return;
    }

    templates.forEach((tpl) => {
      const card = document.createElement("div");
      card.className = "template-card";
      card.setAttribute("data-template-id", tpl.id);

      const head = document.createElement("div");
      head.className = "template-head";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "template-title";
      title.textContent = tpl.name || "テンプレ";

      const sub = document.createElement("div");
      sub.className = "tasks-card-sub";
      sub.textContent = `${tpl.items.length}件`;

      left.appendChild(title);
      left.appendChild(sub);

      head.appendChild(left);
      card.appendChild(head);

      const itemsWrap = document.createElement("div");
      itemsWrap.className = "template-items";
      tpl.items.forEach((item) => {
        const itemEl = document.createElement("div");
        itemEl.className = "template-item";
        itemEl.setAttribute("data-item-id", item.id);

        const text = document.createElement("div");
        const main = document.createElement("div");
        main.textContent = item.title || "（無題）";

        const meta = document.createElement("div");
        meta.className = "template-item-meta";
        const parts = [];
        const priorityLabel = getPriorityLabel(item.priority);
        if (priorityLabel) parts.push(`優先 ${priorityLabel}`);
        if (item.category) parts.push(item.category);
        const dueParts = TaskDomain.parseDueAt(item.dueAt);
        if (dueParts && dueParts.time) parts.push(`期限 ${dueParts.time}`);
        if (item.dueAt && (!dueParts || !dueParts.time)) parts.push("期限あり");
        meta.textContent = parts.join(" / ");

        text.appendChild(main);
        text.appendChild(meta);
        itemEl.appendChild(text);
        itemsWrap.appendChild(itemEl);
      });
      if (!tpl.items.length) {
        const empty = document.createElement("div");
        empty.className = "task-empty";
        empty.textContent = "項目を追加してね。";
        itemsWrap.appendChild(empty);
      }

      card.appendChild(itemsWrap);

      const actions = document.createElement("div");
      actions.className = "template-actions";

      actions.appendChild(buildActionButton("項目追加", "add-item"));
      actions.appendChild(buildActionButton("今日に追加", "apply"));
      actions.appendChild(buildActionButton("名前変更", "rename"));
      actions.appendChild(buildActionButton("削除", "delete", true));

      card.appendChild(actions);
      dom.templateList.appendChild(card);
    });
  }

  function renderHistory() {
    if (!dom.historyList) return;
    const items = TaskDomain.getTaskHistory ? TaskDomain.getTaskHistory() : [];
    dom.historyList.innerHTML = "";

    if (dom.historyCount) {
      dom.historyCount.textContent = items.length ? `${items.length}件` : "なし";
    }

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "task-empty";
      empty.textContent = "履歴はまだないよ。";
      dom.historyList.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.setAttribute("data-history-id", item.id);

      const main = document.createElement("div");
      main.className = "history-main";

      const title = document.createElement("div");
      title.className = "history-title";
      title.textContent = item.title || "（無題）";

      const meta = document.createElement("div");
      meta.className = "history-sub";
      const parts = [];
      const priorityLabel = getPriorityLabel(item.priority);
      if (priorityLabel) parts.push(`優先 ${priorityLabel}`);
      if (item.category) parts.push(item.category);
      if (item.dueTime) parts.push(`期限 ${item.dueTime}`);
      meta.textContent = parts.length ? parts.join(" / ") : "詳細なし";

      main.appendChild(title);
      main.appendChild(meta);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "task-btn history-add-btn";
      addBtn.textContent = "追加";
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        TaskDomain.addTask({
          title: item.title,
          priority: item.priority,
          category: item.category,
          dueAt: buildDueAtFromHistory(item),
          status: "not_done",
        });
        refresh();
        notifyDataChange();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "task-btn danger history-delete-btn";
      deleteBtn.textContent = "消去";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (TaskDomain.removeHistoryItem) {
          TaskDomain.removeHistoryItem(item.id);
          refresh();
        }
      });

      row.appendChild(main);
      row.appendChild(addBtn);
      row.appendChild(deleteBtn);
      dom.historyList.appendChild(row);
    });
  }

  function buildDueAtFromHistory(item) {
    if (!item || !item.dueTime || !TaskDomain.buildDueAtForToday) return "";
    const dueAt = TaskDomain.buildDueAtForToday(item.dueTime);
    if (!dueAt) return "";
    const remaining = TaskDomain.getRemainingInfo(dueAt);
    if (remaining.state === "overdue") return "";
    return dueAt;
  }

  function renderAnalysis() {
    const rangeKey = uiState.analysisRange || "day";
    const summary = TaskDomain.getAnalysisForRange
      ? TaskDomain.getAnalysisForRange(rangeKey)
      : TaskDomain.getTodayAnalysis();
    const label = ANALYSIS_RANGE_LABELS[rangeKey] || "今日";

    updateAnalysisRangeButtons();
    if (dom.analysisRangeTitle) dom.analysisRangeTitle.textContent = `${label}の達成状況`;
    if (dom.analysisCategorySub) dom.analysisCategorySub.textContent = `${label}の傾向`;

    if (dom.analysisTotalCount) {
      dom.analysisTotalCount.textContent = summary.total ? `${label} ${summary.total}件` : `${label}はまだなし`;
    }
    if (dom.analysisNotDoneCount) dom.analysisNotDoneCount.textContent = summary.counts.not_done;
    if (dom.analysisTriedCount) dom.analysisTriedCount.textContent = summary.counts.tried;
    if (dom.analysisPartialCount) dom.analysisPartialCount.textContent = summary.counts.partial;
    if (dom.analysisPerfectCount) dom.analysisPerfectCount.textContent = summary.counts.perfect;

    if (dom.analysisCategoryList) {
      dom.analysisCategoryList.innerHTML = "";
      if (!summary.categories.length) {
        const empty = document.createElement("div");
        empty.className = "task-empty";
        empty.textContent = `${label}のカテゴリ集計はまだないよ。`;
        dom.analysisCategoryList.appendChild(empty);
      } else {
        summary.categories.forEach((cat) => {
          const item = document.createElement("div");
          item.className = "analysis-item";
          item.textContent = `${cat.name}（${cat.total}件）`;

          const sub = document.createElement("div");
          sub.className = "analysis-item-sub";
          sub.textContent =
            `完璧 ${cat.counts.perfect} / 途中 ${cat.counts.partial} / ` +
            `やろうとした ${cat.counts.tried} / できなかった ${cat.counts.not_done}`;
          item.appendChild(sub);
          dom.analysisCategoryList.appendChild(item);
        });
      }
    }

    if (dom.analysisTopList) {
      dom.analysisTopList.innerHTML = "";
      if (!summary.topIncomplete.length) {
        const empty = document.createElement("div");
        empty.className = "task-empty";
        empty.textContent = `${label}の未達が多いカテゴリはまだないよ。`;
        dom.analysisTopList.appendChild(empty);
      } else {
        summary.topIncomplete.forEach((cat) => {
          const item = document.createElement("div");
          item.className = "analysis-item";
          item.textContent = `${cat.name}（未達 ${cat.incomplete}件）`;
          dom.analysisTopList.appendChild(item);
        });
      }
    }
  }

  function createTaskRow(task) {
    const row = document.createElement("div");
    row.className = "task-row";
    row.setAttribute("data-task-id", task.id);
    if (task.status === "perfect") row.classList.add("is-done");

    const dot = document.createElement("span");
    dot.className = `task-priority-dot p${task.priority}`;

    const main = document.createElement("div");
    main.className = "task-row-main";

    const title = document.createElement("div");
    title.className = "task-row-title";
    title.textContent = task.title || "（無題）";

    const remaining = document.createElement("div");
    const remainingInfo = TaskDomain.getRemainingInfo(task.dueAt);
    const isOverdue = remainingInfo.state === "overdue";
    remaining.className = "task-row-remaining";
    remaining.textContent = remainingInfo.label;
    if (remainingInfo.state === "overdue") remaining.classList.add("overdue");
    if (remainingInfo.state === "none") remaining.classList.add("none");

    main.appendChild(title);
    main.appendChild(remaining);

    const reportBtn = document.createElement("button");
    reportBtn.type = "button";
    reportBtn.className = "task-report-btn";
    reportBtn.textContent = isOverdue ? "報告" : "達成";
    reportBtn.classList.add(isOverdue ? "is-report" : "is-achieve");
    reportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openReportSheet(task);
    });

    row.appendChild(dot);
    row.appendChild(main);
    row.appendChild(reportBtn);

    row.addEventListener("click", () => {
      openTaskSheet(task);
    });

    return row;
  }

  function openReportSheet(task) {
    if (!dom.reportSheet || !task) return;
    uiState.reportTaskId = task.id;
    uiState.reportPrevStatus = task.status;
    uiState.reportPrevStatusUpdatedAt = task.statusUpdatedAt || "";
    if (dom.reportSub) dom.reportSub.textContent = task.title || "";
    dom.reportSheet.classList.add("open");
  }

  function closeReportSheet() {
    if (!dom.reportSheet) return;
    dom.reportSheet.classList.remove("open");
    uiState.reportTaskId = null;
    uiState.reportPrevStatus = null;
    uiState.reportPrevStatusUpdatedAt = null;
  }

  function applyReportStatus(status) {
    const taskId = uiState.reportTaskId;
    if (!taskId) return;
    const prevStatus = uiState.reportPrevStatus;
    const prevStatusUpdatedAt = uiState.reportPrevStatusUpdatedAt;
    let task = null;
    if (status === prevStatus && !prevStatusUpdatedAt) {
      task = TaskDomain.updateTask(taskId, {
        status,
        statusUpdatedAt: new Date().toISOString(),
      });
    } else {
      task = TaskDomain.setTaskStatus(taskId, status);
    }
    closeReportSheet();
    if (task) {
      showUndo(task, prevStatus, prevStatusUpdatedAt, STATUS_LABELS[status] || status);
      refresh();
      notifyDataChange();
    }
  }

  function showUndo(task, prevStatus, prevStatusUpdatedAt, label) {
    if (!dom.undoToast || !dom.undoText) return;
    clearUndo();
    uiState.undoTaskId = task.id;
    uiState.undoPrevStatus = prevStatus;
    uiState.undoPrevStatusUpdatedAt = prevStatusUpdatedAt || "";
    dom.undoText.textContent = `達成状況を「${label}」に更新したよ`;
    dom.undoToast.classList.add("show");
    uiState.undoTimer = window.setTimeout(() => {
      hideUndo();
    }, 4000);
  }

  function hideUndo() {
    if (dom.undoToast) dom.undoToast.classList.remove("show");
    clearUndo();
    uiState.undoTaskId = null;
    uiState.undoPrevStatus = null;
    uiState.undoPrevStatusUpdatedAt = null;
  }

  function clearUndo() {
    if (uiState.undoTimer) {
      window.clearTimeout(uiState.undoTimer);
      uiState.undoTimer = null;
    }
  }

  function handleUndo() {
    if (!uiState.undoTaskId || !uiState.undoPrevStatus) {
      hideUndo();
      return;
    }
    TaskDomain.updateTask(uiState.undoTaskId, {
      status: uiState.undoPrevStatus,
      statusUpdatedAt: uiState.undoPrevStatusUpdatedAt || "",
    });
    if (dom.undoText) dom.undoText.textContent = "元に戻したよ";
    hideUndo();
    refresh();
    notifyDataChange();
  }

  function handleQuickAdd(openDetail) {
    const title = (dom.quickTaskTitle?.value || "").trim();
    if (!title) {
      alert("タイトルを入力してね。");
      return;
    }
    const priority = Number(dom.quickTaskPriority?.value || 3);
    const category = (dom.quickTaskCategory?.value || "").trim();
    const dueAt = readDueAt("quick");

    if (openDetail) {
      openTaskSheet(null, { title, priority, category, dueAt });
      return;
    }

    TaskDomain.addTask({ title, priority, category, dueAt, status: "not_done" });
    resetQuickForm();
    refresh();
    notifyDataChange();
  }

  function resetQuickForm() {
    if (dom.quickTaskTitle) dom.quickTaskTitle.value = "";
    if (dom.quickTaskPriority) dom.quickTaskPriority.value = "3";
    if (dom.quickTaskCategory) dom.quickTaskCategory.value = "";
    setDueMode("quick", "none");
    if (dueScopes.quick?.timeTodayInput) dueScopes.quick.timeTodayInput.value = "";
    if (dueScopes.quick?.dateInput) dueScopes.quick.dateInput.value = "";
    if (dueScopes.quick?.timeDateInput) dueScopes.quick.timeDateInput.value = "";
  }

  function handleCreateTemplate() {
    const name = (dom.templateNameInput?.value || "").trim();
    if (!name) {
      alert("テンプレ名を入力してね。");
      return;
    }
    TaskDomain.addTemplate(name);
    if (dom.templateNameInput) dom.templateNameInput.value = "";
    renderTemplates();
    notifyDataChange();
  }

  function handleTemplateAction(action, templateId) {
    if (!templateId) return;
    if (action === "add-item") {
      openTemplateItemSheet(templateId);
      return;
    }
    if (action === "apply") {
      TaskDomain.applyTemplate(templateId, new Date());
      refresh();
      notifyDataChange();
      return;
    }
    if (action === "rename") {
      const template = TaskDomain.getTemplateById(templateId);
      const current = template ? template.name : "";
      const next = prompt("テンプレ名を変更", current || "");
      if (next && next.trim()) {
        TaskDomain.updateTemplate(templateId, { name: next.trim() });
        renderTemplates();
      }
      return;
    }
    if (action === "delete") {
      const ok = confirm("テンプレを削除する？");
      if (!ok) return;
      TaskDomain.removeTemplate(templateId);
      renderTemplates();
      notifyDataChange();
    }
  }

  function openTaskSheet(task, overrides = {}) {
    if (!dom.taskSheet) return;
    uiState.sheet = { mode: "task", taskId: task ? task.id : null, templateId: null, itemId: null };
    if (dom.taskSheetTitle) dom.taskSheetTitle.textContent = task ? "タスクを編集" : "タスクを追加";
    if (dom.taskSheetSub) dom.taskSheetSub.textContent = task ? "必要なところだけ編集してね" : "詳細を追加できるよ";
    if (dom.taskSheetTitleInput) dom.taskSheetTitleInput.value = task ? task.title : overrides.title || "";
    if (dom.taskSheetPriority) dom.taskSheetPriority.value = String(task ? task.priority : overrides.priority || 3);
    if (dom.taskSheetCategory) dom.taskSheetCategory.value = task ? task.category || "" : overrides.category || "";
    if (dom.taskSheetStatus) dom.taskSheetStatus.value = task ? task.status : "not_done";
    if (dom.taskSheetStatusField) dom.taskSheetStatusField.style.display = "block";
    if (dom.taskSheetDeleteBtn) dom.taskSheetDeleteBtn.style.display = task ? "inline-flex" : "none";
    setDueFromValue("sheet", task ? task.dueAt : overrides.dueAt || "");
    dom.taskSheet.classList.add("open");
  }

  function openTemplateItemSheet(templateId, itemId = null) {
    if (!dom.taskSheet) return;
    const template = TaskDomain.getTemplateById(templateId);
    if (!template) return;
    const item = itemId ? template.items.find((i) => i.id === itemId) : null;

    uiState.sheet = { mode: "template-item", taskId: null, templateId, itemId };
    if (dom.taskSheetTitle) dom.taskSheetTitle.textContent = item ? "テンプレ項目を編集" : "テンプレ項目を追加";
    if (dom.taskSheetSub) dom.taskSheetSub.textContent = template.name || "テンプレ";
    if (dom.taskSheetTitleInput) dom.taskSheetTitleInput.value = item ? item.title : "";
    if (dom.taskSheetPriority) dom.taskSheetPriority.value = String(item ? item.priority : 3);
    if (dom.taskSheetCategory) dom.taskSheetCategory.value = item ? item.category || "" : "";
    if (dom.taskSheetStatusField) dom.taskSheetStatusField.style.display = "none";
    if (dom.taskSheetDeleteBtn) dom.taskSheetDeleteBtn.style.display = item ? "inline-flex" : "none";
    setDueFromValue("sheet", item ? item.dueAt : "");
    dom.taskSheet.classList.add("open");
  }

  function closeTaskSheet() {
    if (!dom.taskSheet) return;
    dom.taskSheet.classList.remove("open");
  }

  function saveTaskSheet() {
    const title = (dom.taskSheetTitleInput?.value || "").trim();
    if (!title) {
      alert("タイトルを入力してね。");
      return;
    }
    const priority = Number(dom.taskSheetPriority?.value || 3);
    const category = (dom.taskSheetCategory?.value || "").trim();
    const dueAt = readDueAt("sheet");

    if (uiState.sheet.mode === "template-item") {
      const templateId = uiState.sheet.templateId;
      if (!templateId) return;
      if (uiState.sheet.itemId) {
        TaskDomain.updateTemplateItem(templateId, uiState.sheet.itemId, {
          title,
          priority,
          category,
          dueAt,
        });
      } else {
        TaskDomain.addTemplateItem(templateId, { title, priority, category, dueAt });
      }
      renderTemplates();
      closeTaskSheet();
      return;
    }

    const status = dom.taskSheetStatus?.value || "not_done";
    if (uiState.sheet.taskId) {
      TaskDomain.updateTask(uiState.sheet.taskId, {
        title,
        priority,
        category,
        dueAt,
        status,
      });
    } else {
      TaskDomain.addTask({
        title,
        priority,
        category,
        dueAt,
        status,
      });
    }
    closeTaskSheet();
    refresh();
    notifyDataChange();
  }

  function deleteFromSheet() {
    if (uiState.sheet.mode === "template-item") {
      const templateId = uiState.sheet.templateId;
      const itemId = uiState.sheet.itemId;
      if (!templateId || !itemId) return;
      const ok = confirm("この項目を削除する？");
      if (!ok) return;
      TaskDomain.removeTemplateItem(templateId, itemId);
      renderTemplates();
      closeTaskSheet();
      return;
    }

    if (!uiState.sheet.taskId) return;
    const ok = confirm("このタスクを削除する？");
    if (!ok) return;
    TaskDomain.deleteTask(uiState.sheet.taskId);
    closeTaskSheet();
    refresh();
    notifyDataChange();
  }

  function buildActionButton(label, action, danger = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `task-btn${danger ? " danger" : ""}`;
    btn.textContent = label;
    btn.setAttribute("data-action", action);
    return btn;
  }

  function setDueMode(scope, mode) {
    const scopeState = dueScopes[scope];
    if (!scopeState) return;
    scopeState.mode = mode;
    scopeState.buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-due-mode") === mode);
    });
    scopeState.inputRows.forEach((row) => {
      row.classList.toggle("active", row.getAttribute("data-due-input") === mode);
    });
  }

  function readDueAt(scope) {
    const scopeState = dueScopes[scope];
    if (!scopeState) return "";
    if (scopeState.mode === "none") return "";
    if (scopeState.mode === "time") {
      return TaskDomain.buildDueAtForToday(scopeState.timeTodayInput?.value || "");
    }
    if (scopeState.mode === "date") {
      return TaskDomain.buildDueAtForDate(
        scopeState.dateInput?.value || "",
        scopeState.timeDateInput?.value || ""
      );
    }
    return "";
  }

  function setDueFromValue(scope, dueAt) {
    const scopeState = dueScopes[scope];
    if (!scopeState) return;
    const parsed = TaskDomain.parseDueAt(dueAt);
    if (!parsed) {
      setDueMode(scope, "none");
      if (scopeState.timeTodayInput) scopeState.timeTodayInput.value = "";
      if (scopeState.dateInput) scopeState.dateInput.value = "";
      if (scopeState.timeDateInput) scopeState.timeDateInput.value = "";
      return;
    }
    const todayKey = getDateKey(new Date());
    if (parsed.dateKey === todayKey) {
      setDueMode(scope, "time");
      if (scopeState.timeTodayInput) scopeState.timeTodayInput.value = parsed.time;
    } else {
      setDueMode(scope, "date");
      if (scopeState.dateInput) scopeState.dateInput.value = parsed.dateKey;
      if (scopeState.timeDateInput) scopeState.timeDateInput.value = parsed.time;
    }
  }

  function notifyDataChange() {
    if (typeof callbacks.onDataChange === "function") {
      callbacks.onDataChange();
    }
  }

  function getDateKey(date) {
    const pad2 = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  window.TaskUI = {
    init,
    open,
    close,
    refresh,
  };
})();
