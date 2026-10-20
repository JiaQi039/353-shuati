/* 本地进度存储：答题记录、错题、收藏、每日统计、考试记录、自定义题库 */
(function () {
  const QZ = (window.QZ = window.QZ || {});
  const KEY = "qz353.state.v1";
  const CUSTOM_KEY = "qz353.custom.v1";

  const defaults = () => ({
    progress: {},
    daily: {},
    exams: [],
    session: null,
    settings: {
      theme: "auto",
      autoNext: false,
      showTimer: true,
      instantFeedback: true
    }
  });

  let state = defaults();
  let memoryOnly = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      state = {
        ...defaults(),
        ...parsed,
        settings: { ...defaults().settings, ...(parsed.settings || {}) }
      };
      if (!state.progress || typeof state.progress !== "object") state.progress = {};
      if (!state.daily || typeof state.daily !== "object") state.daily = {};
      if (!Array.isArray(state.exams)) state.exams = [];
    } catch (error) {
      console.warn("读取本地进度失败，将使用临时存储", error);
      memoryOnly = true;
    }
  }

  function persist() {
    if (memoryOnly) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("保存进度失败（可能是存储空间已满）", error);
    }
  }

  function dayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function blankProgress() {
    return { seen: 0, right: 0, wrong: 0, streak: 0, last: null, ts: 0, fav: false };
  }

  function getProgress(id) {
    return state.progress[id] || null;
  }

  function ensureDaily(date = new Date()) {
    const key = dayKey(date);
    if (!state.daily[key]) state.daily[key] = { n: 0, c: 0, sec: 0 };
    return state.daily[key];
  }

  function recordAnswer(id, correct) {
    const p = (state.progress[id] ||= blankProgress());
    p.seen += 1;
    p.ts = Date.now();
    if (correct) {
      p.right += 1;
      p.streak = (p.streak || 0) + 1;
      p.last = "right";
    } else {
      p.wrong += 1;
      p.streak = 0;
      p.last = "wrong";
    }
    const today = ensureDaily();
    today.n += 1;
    if (correct) today.c += 1;
    persist();
    return p;
  }

  function addTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    ensureDaily().sec += Math.round(seconds);
    persist();
  }

  function toggleFav(id) {
    const p = (state.progress[id] ||= blankProgress());
    p.fav = !p.fav;
    persist();
    return p.fav;
  }

  function isFav(id) {
    return Boolean(state.progress[id]?.fav);
  }

  function isMastered(id) {
    return (state.progress[id]?.streak || 0) >= 2;
  }

  function isWrong(id) {
    const p = state.progress[id];
    return Boolean(p && p.wrong > 0 && (p.streak || 0) < 2);
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    persist();
  }

  function saveSession(session) {
    state.session = session;
    persist();
  }

  function getSession() {
    return state.session;
  }

  function clearSession() {
    state.session = null;
    persist();
  }

  function addExam(record) {
    state.exams.unshift(record);
    state.exams = state.exams.slice(0, 40);
    persist();
  }

  function updateExam(record) {
    const index = state.exams.findIndex(item => item.id === record.id);
    if (index >= 0) state.exams[index] = record;
    else state.exams.unshift(record);
    persist();
  }

  function calcStreak() {
    let cursor = new Date();
    let count = 0;
    if (!state.daily[dayKey(cursor)]?.n) cursor.setDate(cursor.getDate() - 1);
    while (state.daily[dayKey(cursor)]?.n) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function totals() {
    let seen = 0;
    let right = 0;
    let mastered = 0;
    let wrong = 0;
    let fav = 0;
    for (const p of Object.values(state.progress)) {
      seen += p.seen || 0;
      right += p.right || 0;
      if ((p.streak || 0) >= 2) mastered += 1;
      if (p.wrong > 0 && (p.streak || 0) < 2) wrong += 1;
      if (p.fav) fav += 1;
    }
    return { seen, right, mastered, wrong, fav, accuracy: seen ? right / seen : 0 };
  }

  function dailySeries(days = 84) {
    const result = [];
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    cursor.setDate(cursor.getDate() - (days - 1));
    for (let i = 0; i < days; i++) {
      const key = dayKey(cursor);
      const item = state.daily[key] || { n: 0, c: 0, sec: 0 };
      result.push({ key, date: new Date(cursor), ...item });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  function weekSeries() {
    return dailySeries(7);
  }

  function resetProgress() {
    state.progress = {};
    state.daily = {};
    state.exams = [];
    state.session = null;
    persist();
  }

  function exportData() {
    return {
      app: "353-shuati",
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: state.progress,
      daily: state.daily,
      exams: state.exams,
      settings: state.settings
    };
  }

  function importData(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !parsed.progress || typeof parsed.progress !== "object") {
      throw new Error("文件格式不正确：缺少 progress 字段");
    }
    state.progress = parsed.progress;
    state.daily = parsed.daily && typeof parsed.daily === "object" ? parsed.daily : {};
    state.exams = Array.isArray(parsed.exams) ? parsed.exams : [];
    if (parsed.settings && typeof parsed.settings === "object") {
      state.settings = { ...state.settings, ...parsed.settings };
    }
    state.session = null;
    persist();
    return Object.keys(state.progress).length;
  }

  function getCustomBank() {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("读取自定义题库失败", error);
      return [];
    }
  }

  function setCustomBank(questions) {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(questions));
      return true;
    } catch (error) {
      console.warn("保存自定义题库失败", error);
      return false;
    }
  }

  load();

  QZ.store = {
    get state() {
      return state;
    },
    dayKey,
    getProgress,
    recordAnswer,
    addTime,
    toggleFav,
    isFav,
    isMastered,
    isWrong,
    setSetting,
    saveSession,
    getSession,
    clearSession,
    addExam,
    updateExam,
    calcStreak,
    totals,
    dailySeries,
    weekSeries,
    resetProgress,
    exportData,
    importData,
    getCustomBank,
    setCustomBank,
    persist,
    clone
  };
})();
