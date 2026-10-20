/* 题库加载与索引 */
(function () {
  const QZ = (window.QZ = window.QZ || {});

  const data = {
    manifest: null,
    subjects: [],
    questions: [],
    byId: new Map(),
    bySubject: new Map(),
    custom: []
  };

  function normalizeCustom(raw, index) {
    if (!raw || typeof raw !== "object" || typeof raw.stem !== "string" || !raw.stem.trim()) return null;
    if (!Array.isArray(raw.options) || raw.options.length < 2) return null;
    const options = raw.options.map(option => String(option));
    let answer = Array.isArray(raw.answer) ? raw.answer.map(String) : String(raw.answer || "").split("");
    answer = answer.map(letter => letter.trim().toUpperCase()).filter(Boolean);
    const letters = options.map((_, i) => String.fromCharCode(65 + i));
    answer = [...new Set(answer)].filter(letter => letters.includes(letter)).sort();
    if (!answer.length) return null;
    let type = raw.type;
    if (!["single", "multiple", "judge"].includes(type)) {
      type = answer.length > 1 ? "multiple" : "single";
    }
    if (type === "judge" && options.length === 2) {
      // 判断题沿用「正确 / 错误」选项
    }
    return {
      id: `my-${String(index + 1).padStart(3, "0")}`,
      subject: "custom",
      chapter: String(raw.chapter || "我的题目").trim() || "我的题目",
      type,
      stem: raw.stem.trim(),
      options,
      answer,
      tag: String(raw.tag || "自定义").trim(),
      explain: String(raw.explain || "（本题暂无解析）").trim()
    };
  }

  function mergeCustom() {
    const raw = QZ.store.getCustomBank();
    const normalized = raw.map(normalizeCustom).filter(Boolean);
    data.custom = normalized;
    if (!normalized.length) return;

    const chapters = [];
    const counts = new Map();
    for (const question of normalized) {
      if (!counts.has(question.chapter)) {
        counts.set(question.chapter, 0);
        chapters.push(question.chapter);
      }
      counts.set(question.chapter, counts.get(question.chapter) + 1);
    }
    data.subjects.push({
      id: "custom",
      name: "我的题库",
      short: "自建",
      color: "#4a5a6a",
      description: "从本地导入的题目，仅保存在当前浏览器",
      count: normalized.length,
      chapters: chapters.map(name => ({ name, count: counts.get(name) })),
      custom: true
    });
    for (const question of normalized) {
      data.questions.push(question);
      data.byId.set(question.id, question);
      if (!data.bySubject.has("custom")) data.bySubject.set("custom", []);
      data.bySubject.get("custom").push(question);
    }
  }

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`无法读取 ${url}（HTTP ${response.status}）`);
    return response.json();
  }

  async function load() {
    data.manifest = await fetchJSON("data/manifest.json");
    const subjects = Array.isArray(data.manifest.subjects) ? data.manifest.subjects : [];
    const results = await Promise.all(
      subjects.map(async subject => {
        try {
          const questions = await fetchJSON(subject.file);
          return { subject, questions: Array.isArray(questions) ? questions : [] };
        } catch (error) {
          console.error(error);
          return { subject, questions: [], error };
        }
      })
    );

    data.subjects = [];
    data.questions = [];
    data.byId.clear();
    data.bySubject.clear();

    for (const { subject, questions, error } of results) {
      if (error) subject.error = error.message;
      data.subjects.push(subject);
      data.bySubject.set(subject.id, questions);
      for (const question of questions) {
        data.questions.push(question);
        data.byId.set(question.id, question);
      }
    }
    mergeCustom();
    data.total = data.questions.length;
  }

  function byId(id) {
    return data.byId.get(id) || null;
  }

  function subject(id) {
    return data.subjects.find(item => item.id === id) || null;
  }

  function questionsOf(subjectId, chapter) {
    const list = data.bySubject.get(subjectId) || [];
    return chapter ? list.filter(item => item.chapter === chapter) : list;
  }

  function shuffle(list) {
    const array = [...list];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function pool({ subject: subjectId, chapter, mode, limit } = {}) {
    let list = data.questions;
    if (subjectId) list = list.filter(item => item.subject === subjectId);
    if (chapter) list = list.filter(item => item.chapter === chapter);
    if (mode === "wrong") list = list.filter(item => QZ.store.isWrong(item.id));
    if (mode === "fav") list = list.filter(item => QZ.store.isFav(item.id));
    if (mode === "random") list = shuffle(list);
    if (limit && Number(limit) > 0) list = list.slice(0, Number(limit));
    return list;
  }

  function wrongQuestions() {
    return data.questions.filter(item => QZ.store.isWrong(item.id));
  }

  function favQuestions() {
    return data.questions.filter(item => QZ.store.isFav(item.id));
  }

  function subjectStats(subjectId) {
    const list = data.bySubject.get(subjectId) || [];
    let answered = 0;
    let mastered = 0;
    let seen = 0;
    let right = 0;
    let wrong = 0;
    for (const question of list) {
      const p = QZ.store.getProgress(question.id);
      if (!p) continue;
      if (p.seen) answered += 1;
      seen += p.seen || 0;
      right += p.right || 0;
      if ((p.streak || 0) >= 2) mastered += 1;
      if (QZ.store.isWrong(question.id)) wrong += 1;
    }
    return {
      total: list.length,
      answered,
      mastered,
      wrong,
      accuracy: seen ? right / seen : 0,
      coverage: list.length ? answered / list.length : 0,
      mastery: list.length ? mastered / list.length : 0
    };
  }

  function chapterStats(subjectId, chapter) {
    const list = questionsOf(subjectId, chapter);
    let seen = 0;
    let right = 0;
    let answered = 0;
    let mastered = 0;
    for (const question of list) {
      const p = QZ.store.getProgress(question.id);
      if (!p) continue;
      seen += p.seen || 0;
      right += p.right || 0;
      if (p.seen) answered += 1;
      if ((p.streak || 0) >= 2) mastered += 1;
    }
    return {
      total: list.length,
      answered,
      mastered,
      seen,
      accuracy: seen ? right / seen : 0,
      mastery: list.length ? mastered / list.length : 0
    };
  }

  function weakChapters(limit = 5) {
    const rows = [];
    for (const subject of data.subjects) {
      for (const chapter of subject.chapters || []) {
        const stats = chapterStats(subject.id, chapter.name);
        if (stats.seen >= 3 && stats.accuracy < 0.7) {
          rows.push({
            subjectId: subject.id,
            subjectName: subject.name,
            chapter: chapter.name,
            ...stats
          });
        }
      }
    }
    return rows.sort((a, b) => a.accuracy - b.accuracy || b.seen - a.seen).slice(0, limit);
  }

  let libraryIndex = null;

  async function loadLibraryIndex() {
    const response = await fetch("data/imported/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error("教材题库索引尚未生成");
    libraryIndex = await response.json();
    return libraryIndex;
  }

  function registerBook(book, questions) {
    const subjectId = `lib-${book.slug}`;
    const existing = data.subjects.find(subject => subject.id === subjectId);
    if (existing) {
      const oldQuestions = data.bySubject.get(subjectId) || [];
      const oldIds = new Set(oldQuestions.map(question => question.id));
      data.subjects = data.subjects.filter(subject => subject.id !== subjectId);
      data.questions = data.questions.filter(question => !oldIds.has(question.id));
      for (const id of oldIds) data.byId.delete(id);
      data.bySubject.delete(subjectId);
    }

    const chapters = [];
    const counts = new Map();
    for (const question of questions) {
      const chapter = question.chapter || "未分章";
      if (!counts.has(chapter)) {
        counts.set(chapter, 0);
        chapters.push(chapter);
      }
      counts.set(chapter, counts.get(chapter) + 1);
      question.subject = subjectId;
      question.source = question.source || book.source || book.title;
    }

    const subjectMeta = {
      id: subjectId,
      name: book.title,
      short: "教材",
      color: "#8a5f7a",
      description: book.subtitle || "教材配套习题 · OCR 草稿",
      count: questions.length,
      chapters: chapters.map(name => ({ name, count: counts.get(name) })),
      library: true,
      draft: true,
      slug: book.slug
    };
    data.subjects.push(subjectMeta);
    data.bySubject.set(subjectId, questions);
    for (const question of questions) {
      data.questions.push(question);
      data.byId.set(question.id, question);
    }
    data.total = data.questions.length;
    return subjectMeta;
  }

  QZ.data = {
    get manifest() {
      return data.manifest;
    },
    get libraryIndex() {
      return libraryIndex;
    },
    get subjects() {
      return data.subjects;
    },
    get questions() {
      return data.questions;
    },
    get total() {
      return data.questions.length;
    },
    load,
    byId,
    subject,
    questionsOf,
    pool,
    wrongQuestions,
    favQuestions,
    subjectStats,
    chapterStats,
    weakChapters,
    shuffle,
    loadLibraryIndex,
    registerBook
  };
})();
