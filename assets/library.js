/* 教材题库：按书懒加载，显示 OCR 草稿状态 */
(function () {
  const QZ = (window.QZ = window.QZ || {});
  const { escapeHtml, percent } = QZ.ui;
  const loaded = new Map();
  const loading = new Map();

  async function loadIndex() {
    if (QZ.data.libraryIndex) return QZ.data.libraryIndex;
    return QZ.data.loadLibraryIndex();
  }

  function findBook(slug) {
    return (QZ.data.libraryIndex?.books || []).find(book => book.slug === slug) || null;
  }

  async function loadBook(slug) {
    if (loaded.has(slug)) return loaded.get(slug);
    if (loading.has(slug)) return loading.get(slug);
    const book = findBook(slug);
    if (!book) throw new Error("没有这本书");
    const task = (async () => {
      const response = await fetch(book.file, { cache: "no-store" });
      if (!response.ok) throw new Error(`题库文件读取失败：${book.file}`);
      const questions = await response.json();
      if (!Array.isArray(questions) || !questions.length) throw new Error("题库为空");
      const subject = QZ.data.registerBook(book, questions);
      const record = { book, subject, questions };
      loaded.set(slug, record);
      return record;
    })();
    loading.set(slug, task);
    try {
      return await task;
    } finally {
      loading.delete(slug);
    }
  }

  async function start(slug, options = {}) {
    try {
      const record = await loadBook(slug);
      const subjectId = record.subject.id;
      QZ.practice.start({
        subject: subjectId,
        chapter: options.chapter,
        mode: options.mode || "seq",
        limit: options.limit,
        title: options.chapter ? `${record.book.title} · ${options.chapter}` : record.book.title,
        subtitle: "教材题库 · OCR 草稿"
      });
    } catch (error) {
      QZ.ui.toast(error.message, "error");
    }
  }

  function statusBadge(book) {
    return `<span class="draft-badge">${book.status === "verified" ? "已校对" : "OCR 草稿"}</span>`;
  }

  function renderList() {
    const index = QZ.data.libraryIndex;
    if (!index) {
      loadIndex()
        .then(() => QZ.router.render())
        .catch(error => QZ.ui.toast(error.message, "error"));
      return `<section class="empty-state"><h1>正在读取教材题库…</h1><p>首次打开会加载题库索引。</p></section>`;
    }
    const books = index.books || [];
    const total = books.reduce((sum, book) => sum + (book.count || 0), 0);
    return `
      <div class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">TEXTBOOK BANK · DRAFT</p>
            <h1>教材题库</h1>
            <p class="page-sub">从扫描版习题集提取，按书分章练习。当前为 OCR 草稿，题干和答案可能存在识别错误。</p>
          </div>
        </header>
        <div class="draft-banner">
          <strong>OCR 草稿</strong>
          <span>本区题目由扫描件自动识别，尚未逐题校对；答案缺失处保持空白，不用推测补齐。发现错误请以原书为准。</span>
        </div>
        <div class="library-stats">
          <span><b>${books.length}</b> 本书</span>
          <span><b>${total}</b> 道题</span>
          <span>更新于 ${escapeHtml(index.updated || "—")}</span>
        </div>
        ${
          books.length
            ? `<div class="library-grid">
                ${books
                  .map(
                    book => `<a class="library-card" href="#/library/${book.slug}">
                      <div class="library-card-top">
                        <span class="library-subject">${escapeHtml(book.subject || "未分类")}</span>
                        ${statusBadge(book)}
                      </div>
                      <h2>${escapeHtml(book.title)}</h2>
                      <p>${escapeHtml(book.subtitle || "")}</p>
                      <div class="library-card-foot">
                        <span>${book.count || 0} 题${book.pages ? ` · 原书 ${book.pages} 页` : ""}</span>
                        <span class="library-arrow">→</span>
                      </div>
                    </a>`
                  )
                  .join("")}
              </div>`
            : `<div class="empty-card"><span>▤</span><h2>还没有教材题库</h2><p>OCR 批次完成后，书目会出现在这里。</p></div>`
        }
      </div>`;
  }

  function renderBook(slug) {
    const book = findBook(slug);
    if (!book) {
      return `<section class="empty-state"><h1>没有这本书</h1><p>书目可能已更新。</p><a class="btn btn-primary" href="#/library">返回教材题库</a></section>`;
    }
    if (!loaded.has(slug)) {
      loadBook(slug)
        .then(() => QZ.router.render())
        .catch(error => QZ.ui.toast(error.message, "error"));
      return `<section class="empty-state"><h1>正在加载《${escapeHtml(book.title)}》…</h1><p>首次打开需要读取整本书的题库文件。</p></section>`;
    }
    const record = loaded.get(slug);
    const subject = record.subject;
    const stats = QZ.data.subjectStats(subject.id);
    return `
      <div class="page">
        <header class="subject-header" style="--subject-color:${subject.color}">
          <div class="subject-header-main">
            <p class="eyebrow">${escapeHtml(book.subject || "教材题库")} · OCR DRAFT</p>
            <h1>${escapeHtml(book.title)}</h1>
            <p class="page-sub">${escapeHtml(book.subtitle || "扫描版教材配套习题")}</p>
            <div class="hero-actions">
              <button class="btn btn-primary" data-action="start-library" data-slug="${slug}">顺序练习</button>
              <button class="btn btn-ghost" data-action="start-library" data-slug="${slug}" data-mode="random" data-limit="20">随机 20 题</button>
              <button class="btn btn-ghost" data-action="start-library" data-slug="${slug}" data-mode="wrong">本书错题</button>
            </div>
          </div>
          <div class="subject-dashboard">
            <div class="subject-ring" style="--score:${Math.round(stats.coverage * 100)}">
              <div><strong>${percent(stats.coverage)}</strong><span>已练覆盖</span></div>
            </div>
            <dl>
              <div><dt>题量</dt><dd>${subject.count}</dd></div>
              <div><dt>已练</dt><dd>${stats.answered}</dd></div>
              <div><dt>正确率</dt><dd>${stats.accuracy ? percent(stats.accuracy) : "—"}</dd></div>
              <div><dt>原书页码</dt><dd>${escapeHtml(book.pages || "—")}</dd></div>
            </dl>
          </div>
        </header>
        <div class="draft-banner compact">
          <strong>未逐题校对</strong>
          <span>本册由 OCR 自动整理，填空/简答的参考答案可能不完整；选择题答案来自原书答案区。发现错漏请以原书为准。</span>
        </div>
        <section class="chapter-section">
          <div class="section-heading"><h2>章节 / 题型</h2><span>${subject.chapters.length} 组</span></div>
          <div class="chapter-list">
            ${subject.chapters
              .map((chapter, index) => {
                const c = QZ.data.chapterStats(subject.id, chapter.name);
                return `<div class="chapter-row">
                  <div class="chapter-main">
                    <span class="chapter-no">${String(index + 1).padStart(2, "0")}</span>
                    <div><h3>${escapeHtml(chapter.name)}</h3><p>${chapter.count} 题 · 已练 ${c.answered} 题</p></div>
                  </div>
                  <div class="chapter-metrics">
                    <div class="chapter-bar"><span style="width:${Math.round(c.mastery * 100)}%"></span></div>
                    <span class="chapter-acc">${c.seen ? percent(c.accuracy) : "—"}</span>
                  </div>
                  <button class="btn btn-ghost btn-sm" data-action="start-library" data-slug="${slug}" data-chapter="${escapeHtml(chapter.name)}">练习</button>
                </div>`;
              })
              .join("")}
          </div>
        </section>
      </div>`;
  }

  QZ.library = {
    loadIndex,
    loadBook,
    start,
    renderList,
    renderBook
  };
})();
