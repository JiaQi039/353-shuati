/* 应用外壳：路由、页面视图、事件与快捷键 */
(function () {
  const QZ = (window.QZ = window.QZ || {});
  const { escapeHtml, percent, formatTime, formatDate, toast } = QZ.ui;

  const QUOTES = [
    "今天多刷一题，考场上少慌一分。",
    "先把会的做对，再把不会的弄懂。",
    "重复不是笨办法，是记忆最老实的路。",
    "错题不是失败，是还没拆开的礼物。",
    "把大目标拆小，今天只负责这一页。"
  ];

  const ROUTES = [
    { id: "home", test: /^#\/?$/, view: renderHome },
    { id: "subject", test: /^#\/subject\/([\w-]+)$/, view: renderSubject },
    { id: "practice", test: /^#\/practice$/, view: () => QZ.practice.view() },
    { id: "exam", test: /^#\/exam$/, view: () => QZ.exam.view("setup") },
    { id: "exam-run", test: /^#\/exam\/run$/, view: () => QZ.exam.view("run") },
    { id: "exam-result", test: /^#\/exam\/result$/, view: () => QZ.exam.view("result") },
    { id: "library", test: /^#\/library$/, view: () => QZ.library.renderList() },
    { id: "library-book", test: /^#\/library\/([\w-]+)$/, view: slug => QZ.library.renderBook(slug) },
    { id: "wrong", test: /^#\/wrong$/, view: renderWrong },
    { id: "fav", test: /^#\/fav$/, view: renderFav },
    { id: "stats", test: /^#\/stats$/, view: renderStats },
    { id: "settings", test: /^#\/settings$/, view: renderSettings }
  ];

  let currentRoute = "home";

  /* ---------------------------------- 路由 ---------------------------------- */

  function parse() {
    const hash = location.hash || "#/";
    for (const route of ROUTES) {
      const match = hash.match(route.test);
      if (match) return { route, params: match.slice(1) };
    }
    return { route: ROUTES[0], params: [] };
  }

  function render() {
    const { route, params } = parse();
    currentRoute = route.id;
    const main = document.getElementById("mainContent");
    let html = "";
    try {
      html = route.view(...params);
    } catch (error) {
      console.error(error);
      html = `<section class="empty-state"><h1>页面出错了</h1><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="#/">返回首页</a></section>`;
    }
    main.dataset.route = route.id;
    main.innerHTML = html;
    updateSidebar(route, params);
    document.querySelectorAll(".side-subject").forEach(node => {
      const subjectId = node.dataset.subject;
      if (params[0] && subjectId === params[0]) node.open = true;
      if (QZ.practice.state?.subject && subjectId === QZ.practice.state.subject) node.open = true;
    });
    window.QZ.currentHash = location.hash;
  }

  function go(hash) {
    if ((location.hash || "#/") === hash) {
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    location.hash = hash;
  }

  QZ.router = { render, go };

  /* --------------------------------- 侧边栏 --------------------------------- */

  function buildSidebar() {
    const tree = document.getElementById("noteTree");
    tree.innerHTML = `
      <div class="side-nav">
        <a href="#/" data-nav="home"><span class="nav-icon">◈</span>首页</a>
        <a href="#/wrong" data-nav="wrong"><span class="nav-icon">✕</span>错题本<span class="nav-badge" data-badge="wrong">0</span></a>
        <a href="#/fav" data-nav="fav"><span class="nav-icon">☆</span>收藏夹<span class="nav-badge" data-badge="fav">0</span></a>
        <a href="#/exam" data-nav="exam"><span class="nav-icon">◷</span>模拟考试</a>
        <a href="#/stats" data-nav="stats"><span class="nav-icon">▤</span>学习统计</a>
        <a href="${window.QZ_LIBRARY_MODE ? "#/library" : "library.html"}" data-nav="library"><span class="nav-icon">▥</span>教材题库</a>
        <a href="#/settings" data-nav="settings"><span class="nav-icon">⚙</span>设置与题库</a>
      </div>
      <div class="side-heading">题库 · ${QZ.data.total} 题</div>
      <div class="side-subjects">
        ${QZ.data.subjects
          .map(
            subject => `<details class="side-subject" data-subject="${subject.id}">
              <summary>
                <span class="subject-dot" style="--subject-color:${subject.color}"></span>
                <span class="side-subject-name">${escapeHtml(subject.name)}</span>
                <small>${subject.count}</small>
                <span class="side-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div class="side-chapters">
                <a class="side-overview" href="#/subject/${subject.id}">科目概览与进度</a>
                ${(subject.chapters || [])
                  .map(
                    chapter => `<button class="side-chapter" data-action="start-practice" data-subject="${subject.id}" data-chapter="${escapeHtml(chapter.name)}">
                      <span>${escapeHtml(chapter.name)}</span><em>${chapter.count}</em>
                    </button>`
                  )
                  .join("")}
              </div>
            </details>`
          )
          .join("")}
      </div>`;
  }

  function updateSidebar(route, params) {
    const totals = QZ.store.totals();
    document.querySelectorAll("[data-badge]").forEach(node => {
      const key = node.dataset.badge;
      const value = key === "wrong" ? totals.wrong : totals.fav;
      node.textContent = value > 99 ? "99+" : String(value);
      node.classList.toggle("is-zero", !value);
    });
    const streakNode = document.querySelector("[data-top-streak]");
    if (streakNode) {
      const streak = QZ.store.calcStreak();
      streakNode.textContent = streak ? `连 ${streak} 天` : "今天开个头";
    }
    document.querySelectorAll(".side-nav a").forEach(link => {
      const key = link.dataset.nav;
      const active =
        key === route.id ||
        (route.id === "subject" && key === "home") ||
        (route.id === "library-book" && key === "library");
      link.classList.toggle("active", active);
    });
    document.querySelectorAll(".side-subject").forEach(node => {
      const subjectId = node.dataset.subject;
      node.classList.toggle("active", params?.[0] === subjectId);
    });
    const footer = document.querySelector(".sidebar-footer");
    if (footer) footer.textContent = `${QZ.data.total} 题 · 更新于 ${QZ.data.manifest?.updated || "—"}`;
  }

  /* ---------------------------------- 首页 ---------------------------------- */

  function renderHome() {
    const totals = QZ.store.totals();
    const today = QZ.store.state.daily[QZ.store.dayKey()] || { n: 0, c: 0, sec: 0 };
    const streak = QZ.store.calcStreak();
    const session = QZ.store.getSession();
    const weak = QZ.data.weakChapters(3);
    const week = QZ.store.weekSeries();
    const weekTotal = week.reduce((sum, day) => sum + day.n, 0);
    const weekMax = Math.max(5, ...week.map(day => day.n));
    const quote = QUOTES[new Date().getDate() % QUOTES.length];
    const todayAccuracy = today.n ? today.c / today.n : 0;
    const weekday = ["日", "一", "二", "三", "四", "五", "六"];

    return `
      <div class="page home-page">
        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow">353 · 卫生综合 · 刷题室</p>
            <h1>把厚厚的书，<br><em>拆成每天刷得完的一页。</em></h1>
            <p class="hero-sub">流行病学、卫生统计学、社会医学、环境卫生学、职业卫生与营养食品卫生，按章节练、按错题补。</p>
            <div class="hero-actions">
              <button class="btn btn-primary btn-lg" data-action="quick-random">随机 20 题</button>
              <a class="btn btn-ghost btn-lg" href="#/exam">模拟考试</a>
            </div>
            <p class="hero-foot">题库 ${QZ.data.total} 题 · ${QZ.data.subjects.length} 个科目 · 本地保存进度</p>
          </div>
          <aside class="hero-panel">
            <div class="hero-today">
              <span class="hero-today-label">今日练习</span>
              <strong>${today.n}</strong>
              <span class="hero-today-unit">题</span>
            </div>
            <div class="hero-ring-row">
              <div class="mini-ring" style="--score:${Math.round(todayAccuracy * 100)}">
                <span>${today.n ? percent(todayAccuracy) : "—"}</span>
              </div>
              <div class="hero-ring-copy"><b>今日正确率</b><span>${today.n ? `${today.c} 题答对` : "还没有开始"}</span></div>
            </div>
            <div class="hero-streak">
              <span class="streak-flame">✦</span>
              <div><b>连续 ${streak} 天</b><span>${streak ? "保持节奏，别断在今天" : "今天开个头，就算第 1 天"}</span></div>
            </div>
            <p class="hero-quote">${quote}</p>
          </aside>
        </section>

        ${
          session
            ? `<a class="resume-card" href="#/practice">
                <span class="resume-kicker">继续上次</span>
                <span class="resume-title">${escapeHtml(session.title || "未完成的练习")}</span>
                <span class="resume-meta">第 ${(session.idx || 0) + 1} / ${session.queue?.length || 0} 题</span>
                <span class="resume-arrow">→</span>
              </a>`
            : ""
        }

        <section class="quick-grid">
          <button class="quick-card accent" data-action="start-practice" data-mode="wrong">
            <span class="quick-icon">✕</span>
            <strong>错题重练</strong>
            <span>${totals.wrong ? `${totals.wrong} 道待订正` : "暂时没有错题"}</span>
          </button>
          <a class="quick-card" href="#/fav">
            <span class="quick-icon">☆</span>
            <strong>收藏夹</strong>
            <span>${totals.fav} 道收藏</span>
          </a>
          <a class="quick-card" href="#/stats">
            <span class="quick-icon">▤</span>
            <strong>学习统计</strong>
            <span>${totals.seen} 题次 · ${totals.mastered} 题掌握</span>
          </a>
          <a class="quick-card" href="library.html">
            <span class="quick-icon">▥</span>
            <strong>教材题库</strong>
            <span>扫描件 OCR 草稿 · 按书练习</span>
          </a>
        </section>

        <div class="home-grid">
          <section class="subjects-section">
            <div class="section-heading"><h2>按科目练习</h2><span>${QZ.data.subjects.length} 个科目</span></div>
            <div class="subject-grid">
              ${QZ.data.subjects
                .map((subject, index) => {
                  const stats = QZ.data.subjectStats(subject.id);
                  return `<a class="subject-card" href="#/subject/${subject.id}" style="--subject-color:${subject.color}">
                    <div class="subject-card-top">
                      <span class="subject-index">${String(index + 1).padStart(2, "0")}</span>
                      <span class="subject-count">${subject.count} 题</span>
                    </div>
                    <h3>${escapeHtml(subject.name)}</h3>
                    <p>${escapeHtml(subject.description || "")}</p>
                    <div class="progress-track small"><span style="width:${Math.round(stats.coverage * 100)}%"></span></div>
                    <div class="subject-foot">
                      <span>已练 ${stats.answered}/${stats.total}</span>
                      <span>${stats.accuracy ? percent(stats.accuracy) : "未开始"}</span>
                    </div>
                  </a>`;
                })
                .join("")}
            </div>
          </section>

          <aside class="home-aside">
            <section class="panel">
              <div class="section-heading"><h2>最近 7 天</h2><span>${weekTotal} 题</span></div>
              <div class="week-bars">
                ${week
                  .map(
                    day => `<div class="week-col">
                      <div class="week-bar-wrap"><span class="week-bar" style="height:${day.n ? Math.max(8, Math.round((day.n / weekMax) * 100)) : 3}%"><i>${day.n || ""}</i></span></div>
                      <label>${weekday[day.date.getDay()]}</label>
                    </div>`
                  )
                  .join("")}
              </div>
            </section>

            <section class="panel">
              <div class="section-heading"><h2>需要回看</h2><a href="#/stats">全部</a></div>
              ${
                weak.length
                  ? `<div class="weak-list">${weak
                      .map(
                        item => `<button class="weak-row" data-action="start-practice" data-subject="${item.subjectId}" data-chapter="${escapeHtml(item.chapter)}">
                          <span class="weak-name">${escapeHtml(item.chapter)}</span>
                          <span class="weak-meta">${escapeHtml(item.subjectName)} · ${percent(item.accuracy)}</span>
                          <span class="weak-arrow">→</span>
                        </button>`
                      )
                      .join("")}</div>`
                  : `<p class="panel-empty">练够 3 题后，正确率偏低的章节会出现在这里。</p>`
              }
            </section>
          </aside>
        </div>
      </div>`;
  }

  /* --------------------------------- 科目页 --------------------------------- */

  function renderSubject(subjectId) {
    const subject = QZ.data.subject(subjectId);
    if (!subject) return notFound("没有这个科目");
    const stats = QZ.data.subjectStats(subjectId);
    const firstChapter = subject.chapters?.[0]?.name;
    return `
      <div class="page">
        <header class="subject-header" style="--subject-color:${subject.color}">
          <div class="subject-header-main">
            <p class="eyebrow">${escapeHtml(subject.short || "科目")} · ${stats.total} 题</p>
            <h1>${escapeHtml(subject.name)}</h1>
            <p class="page-sub">${escapeHtml(subject.description || "")}</p>
            <div class="hero-actions">
              <button class="btn btn-primary" ${firstChapter ? `data-action="start-practice" data-subject="${subject.id}"` : "disabled"}>顺序练习</button>
              <button class="btn btn-ghost" data-action="start-practice" data-subject="${subject.id}" data-mode="random" data-limit="20">随机 20 题</button>
              <button class="btn btn-ghost" data-action="start-practice" data-subject="${subject.id}" data-mode="wrong">本科错题</button>
            </div>
          </div>
          <div class="subject-dashboard">
            <div class="subject-ring" style="--score:${Math.round(stats.coverage * 100)}">
              <div><strong>${percent(stats.coverage)}</strong><span>已练覆盖</span></div>
            </div>
            <dl>
              <div><dt>已练</dt><dd>${stats.answered} / ${stats.total}</dd></div>
              <div><dt>正确率</dt><dd>${stats.accuracy ? percent(stats.accuracy) : "—"}</dd></div>
              <div><dt>已掌握</dt><dd>${stats.mastered}</dd></div>
              <div><dt>待订正</dt><dd>${stats.wrong}</dd></div>
            </dl>
          </div>
        </header>

        <section class="chapter-section">
          <div class="section-heading"><h2>章节</h2><span>${subject.chapters?.length || 0} 章</span></div>
          <div class="chapter-list">
            ${(subject.chapters || [])
              .map((chapter, index) => {
                const c = QZ.data.chapterStats(subject.id, chapter.name);
                return `<div class="chapter-row">
                  <div class="chapter-main">
                    <span class="chapter-no">${String(index + 1).padStart(2, "0")}</span>
                    <div><h3>${escapeHtml(chapter.name)}</h3><p>${chapter.count} 题 · 已练 ${c.answered} 题</p></div>
                  </div>
                  <div class="chapter-metrics">
                    <div class="chapter-bar"><span style="width:${Math.round(c.mastery * 100)}%"></span></div>
                    <span class="chapter-acc ${c.seen && c.accuracy < 0.6 ? "is-bad" : ""}">${c.seen ? percent(c.accuracy) : "—"}</span>
                  </div>
                  <button class="btn btn-ghost btn-sm" data-action="start-practice" data-subject="${subject.id}" data-chapter="${escapeHtml(chapter.name)}">练习</button>
                </div>`;
              })
              .join("")}
          </div>
        </section>

        ${
          subject.custom
            ? `<div class="inline-note">这是从本地导入的自定义题库，只保存在当前浏览器。可在<a href="#/settings">设置</a>中重新导入或清空。</div>`
            : ""
        }
      </div>`;
  }

  /* -------------------------------- 错题 / 收藏 -------------------------------- */

  function reviewListMarkup(questions, emptyHref) {
    return questions
      .map(question => {
        const p = QZ.store.getProgress(question.id) || {};
        return `<details class="review-item">
          <summary>
            <span class="pill">${QZ.ui.typeLabel(question.type)}</span>
            <span class="review-stem">${escapeHtml(question.stem)}</span>
            <span class="review-flag">${p.wrong ? `错 ${p.wrong} 次` : ""}</span>
          </summary>
          <div class="review-body">
            ${
              question.type === "fill" || question.type === "short"
                ? `<p class="review-answer">参考答案：${escapeHtml(question.referenceAnswer || "原书未提供")}</p>`
                : `<div class="review-options">
                    ${question.options
                      .map((option, index) => {
                        const letter = String.fromCharCode(65 + index);
                        return `<div class="review-option ${question.answer.includes(letter) ? "correct" : ""}"><span>${letter}</span>${escapeHtml(option)}</div>`;
                      })
                      .join("")}
                  </div>
                  <p class="review-answer">正确答案：${question.answer.join("、")}</p>`
            }
            <p class="review-explain">${escapeHtml(question.explain || "暂无解析")}</p>
            <p class="review-source">${escapeHtml(QZ.data.subject(question.subject)?.name || "")} · ${escapeHtml(question.chapter)}${question.source ? ` · ${escapeHtml(question.source)}` : ""}</p>
          </div>
        </details>`;
      })
      .join("");
  }

  function renderWrong() {
    const questions = QZ.data.wrongQuestions();
    return `
      <div class="page narrow">
        <header class="page-head">
          <div>
            <p class="eyebrow">WRONG ANSWERS</p>
            <h1>错题本</h1>
            <p class="page-sub">答错的题会留在这里；连续答对 2 次后自动移出。</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-primary" data-action="start-practice" data-mode="wrong">重练全部</button>
          </div>
        </header>
        ${
          questions.length
            ? `<p class="list-count">${questions.length} 道待订正</p><div class="review-list">${reviewListMarkup(questions)}</div>`
            : `<div class="empty-card"><span>✓</span><h2>错题本是空的</h2><p>继续保持。每道错题都值得回头看一次解析。</p><a class="btn btn-primary" href="#/">去练几题</a></div>`
        }
      </div>`;
  }

  function renderFav() {
    const questions = QZ.data.favQuestions();
    return `
      <div class="page narrow">
        <header class="page-head">
          <div>
            <p class="eyebrow">BOOKMARKS</p>
            <h1>收藏夹</h1>
            <p class="page-sub">把反复记不住的题收在这里，考前集中过一遍。</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-primary" data-action="start-practice" data-mode="fav">练收藏题</button>
          </div>
        </header>
        ${
          questions.length
            ? `<p class="list-count">${questions.length} 道已收藏</p><div class="review-list">${reviewListMarkup(questions)}</div>`
            : `<div class="empty-card"><span>☆</span><h2>还没有收藏</h2><p>做题时点右上角的星标，就能把题目留在这里。</p><a class="btn btn-primary" href="#/">去刷题</a></div>`
        }
      </div>`;
  }

  /* --------------------------------- 统计页 --------------------------------- */

  function renderStats() {
    const totals = QZ.store.totals();
    const days = QZ.store.dailySeries(84);
    const activeDays = days.filter(day => day.n > 0).length;
    const maxDay = Math.max(1, ...days.map(day => day.n));
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const weak = QZ.data.weakChapters(6);
    const exams = QZ.store.state.exams.slice(0, 6);
    return `
      <div class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">PROGRESS</p>
            <h1>学习统计</h1>
            <p class="page-sub">看得见的积累，比“感觉学过了”更可靠。</p>
          </div>
        </header>

        <section class="stat-hero">
          <div class="stat-big"><span>累计答题</span><strong>${totals.seen}</strong><small>题次</small></div>
          <div class="stat-big"><span>总正确率</span><strong>${totals.seen ? percent(totals.accuracy) : "—"}</strong></div>
          <div class="stat-big"><span>已掌握</span><strong>${totals.mastered}</strong><small>/ ${QZ.data.total} 题</small></div>
          <div class="stat-big"><span>连续学习</span><strong>${QZ.store.calcStreak()}</strong><small>天</small></div>
        </section>

        <section class="panel heatmap-panel">
          <div class="section-heading"><h2>近 12 周</h2><span>${activeDays} 天有练习 · 最多 ${maxDay} 题/天</span></div>
          <div class="heatmap-wrap">
            <div class="heatmap">
              ${weeks
                .map(
                  week => `<div class="heat-col">${week
                    .map(day => {
                      const level = day.n === 0 ? 0 : day.n < 10 ? 1 : day.n < 25 ? 2 : day.n < 50 ? 3 : 4;
                      return `<span class="heat-cell level-${level}" title="${formatDate(day.date)} · ${day.n} 题"></span>`;
                    })
                    .join("")}</div>`
                )
                .join("")}
            </div>
            <div class="heat-legend"><span>少</span><i class="level-0"></i><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i><span>多</span></div>
          </div>
        </section>

        <section class="panel">
          <div class="section-heading"><h2>分科目进度</h2><span>正确率 / 覆盖率</span></div>
          <div class="subject-table">
            ${QZ.data.subjects
              .map(subject => {
                const stats = QZ.data.subjectStats(subject.id);
                return `<a class="subject-table-row" href="#/subject/${subject.id}">
                  <span class="table-dot" style="background:${subject.color}"></span>
                  <span class="table-name">${escapeHtml(subject.name)}</span>
                  <span class="table-num">${stats.answered}/${stats.total}</span>
                  <span class="table-bar"><i style="width:${Math.round(stats.coverage * 100)}%"></i></span>
                  <span class="table-acc">${stats.accuracy ? percent(stats.accuracy) : "—"}</span>
                </a>`;
              })
              .join("")}
          </div>
        </section>

        <section class="panel">
          <div class="section-heading"><h2>薄弱章节</h2><span>正确率低于 70%</span></div>
          ${
            weak.length
              ? `<div class="weak-table">${weak
                  .map(
                    item => `<button class="weak-table-row" data-action="start-practice" data-subject="${item.subjectId}" data-chapter="${escapeHtml(item.chapter)}">
                      <span class="weak-subject">${escapeHtml(item.subjectName)}</span>
                      <span class="weak-chapter">${escapeHtml(item.chapter)}</span>
                      <span class="weak-bar"><i style="width:${Math.round(item.accuracy * 100)}%"></i></span>
                      <span class="weak-acc">${percent(item.accuracy)}</span>
                      <span class="weak-arrow">→</span>
                    </button>`
                  )
                  .join("")}</div>`
              : `<p class="panel-empty">暂无薄弱章节。每个章节至少练 3 题后，正确率低于 70% 的会显示在这里。</p>`
          }
        </section>

        <section class="panel">
          <div class="section-heading"><h2>考试记录</h2><a href="#/exam">去考试</a></div>
          ${
            exams.length
              ? `<div class="exam-history">${exams
                  .map(
                    item => `<div class="history-row">
                      <span class="history-date">${formatDate(item.at)}</span>
                      <span class="history-score">${Math.round(item.score * 100)} 分</span>
                      <span class="history-meta">${item.correct}/${item.total} 题 · ${formatTime(item.usedSeconds)}</span>
                    </div>`
                  )
                  .join("")}</div>`
              : `<p class="panel-empty">还没有考试记录。完成一次模拟考试后，成绩会保存在这里。</p>`
          }
        </section>
      </div>`;
  }

  /* --------------------------------- 设置页 --------------------------------- */

  function renderSettings() {
    const settings = QZ.store.state.settings;
    const custom = QZ.store.getCustomBank();
    return `
      <div class="page narrow">
        <header class="page-head">
          <div>
            <p class="eyebrow">SETTINGS</p>
            <h1>设置与题库</h1>
            <p class="page-sub">进度只保存在当前浏览器，换设备请先导出。</p>
          </div>
        </header>

        <section class="panel settings-panel">
          <div class="section-heading"><h2>外观</h2></div>
          <div class="theme-options">
            <button class="theme-option ${settings.theme === "auto" ? "active" : ""}" data-action="set-theme" data-theme-value="auto">
              <span class="theme-preview auto"></span><b>跟随系统</b>
            </button>
            <button class="theme-option ${settings.theme === "light" ? "active" : ""}" data-action="set-theme" data-theme-value="light">
              <span class="theme-preview light"></span><b>浅色</b>
            </button>
            <button class="theme-option ${settings.theme === "dark" ? "active" : ""}" data-action="set-theme" data-theme-value="dark">
              <span class="theme-preview dark"></span><b>深色</b>
            </button>
          </div>
        </section>

        <section class="panel settings-panel">
          <div class="section-heading"><h2>练习</h2></div>
          <label class="toggle-row">
            <div><b>答对后自动下一题</b><span>单选题答对后停留约 1 秒，再进入下一题。</span></div>
            <input type="checkbox" data-toggle="autoNext" ${settings.autoNext ? "checked" : ""}>
            <span class="toggle-ui"></span>
          </label>
          <label class="toggle-row">
            <div><b>显示计时</b><span>在练习页面显示本轮已用时间。</span></div>
            <input type="checkbox" data-toggle="showTimer" ${settings.showTimer ? "checked" : ""}>
            <span class="toggle-ui"></span>
          </label>
        </section>

        <section class="panel settings-panel">
          <div class="section-heading"><h2>学习数据</h2><span>${QZ.store.totals().seen} 题次</span></div>
          <div class="settings-actions">
            <button class="btn btn-ghost" data-action="export-data">导出进度</button>
            <button class="btn btn-ghost" data-action="import-data">导入进度</button>
            <button class="btn btn-ghost danger" data-action="reset-progress">清空全部进度</button>
          </div>
          <p class="settings-note">导出的 JSON 可在另一台电脑或手机浏览器中导入，继续原来的进度。</p>
        </section>

        <section class="panel settings-panel">
          <div class="section-heading"><h2>自定义题库</h2><span>${custom.length} 题</span></div>
          <p class="settings-note">导入 JSON 题目后，会作为一个“我的题库”科目出现在首页和侧边栏。导入会替换现有自定义题库，不影响内置题库和学习进度。</p>
          <div class="settings-actions">
            <button class="btn btn-primary" data-action="import-bank">导入题库</button>
            <button class="btn btn-ghost" data-action="export-bank">导出题库</button>
            <button class="btn btn-ghost danger" data-action="clear-bank" ${custom.length ? "" : "disabled"}>清空自定义题库</button>
          </div>
          <details class="format-help">
            <summary>查看题目 JSON 格式</summary>
            <pre><code>[
  {
    "stem": "题干",
    "options": ["选项 A", "选项 B", "选项 C", "选项 D"],
    "answer": ["A"],
    "type": "single",
    "chapter": "自定义章节",
    "tag": "考点",
    "explain": "解析"
  }
]</code></pre>
            <p>answer 使用字母数组；多选题写多个字母，如 ["A","C"]；判断题选项写 ["正确","错误"]，答案写 ["A"]。type 可省略，脚本会根据答案数量自动判断。</p>
          </details>
        </section>

        <section class="panel settings-panel about-panel">
          <div class="section-heading"><h2>关于</h2><span>v1.0</span></div>
          <p>本站是一个纯静态的 353 卫生综合刷题工具，参考“公卫研习室”的技术路线：无需构建、无需后端，直接部署到 GitHub Pages 即可使用。</p>
          <p class="settings-note">题库覆盖流行病学、卫生统计学、社会医学、环境卫生学、职业卫生与职业医学、营养与食品卫生学，以及可选的毒理学模块。部分选择题改编自公开的北大 2026 模拟卷并已标注来源，其余为按通用教材知识点原创整理，<b>不是官方真题</b>。各校 353 的科目组合、题型和分值不同，请以目标院校当年考试大纲和指定教材为准；发现题目错误时，请以教材原文复核。</p>
        </section>
      </div>`;
  }

  function notFound(message) {
    return `<section class="empty-state"><p class="eyebrow">404</p><h1>${escapeHtml(message)}</h1><p>链接可能已经失效，回到首页重新选择吧。</p><a class="btn btn-primary" href="#/">返回首页</a></section>`;
  }

  /* --------------------------------- 主题 --------------------------------- */

  function applyTheme() {
    const setting = QZ.store.state.settings.theme || "auto";
    const dark = setting === "dark" || (setting === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelectorAll("[data-theme-value]").forEach(node => {
      node.classList.toggle("active", node.dataset.themeValue === setting);
    });
  }

  function setTheme(value) {
    QZ.store.setSetting("theme", value);
    applyTheme();
    if (currentRoute === "settings") render();
  }

  function toggleTheme() {
    const isDark = document.documentElement.dataset.theme === "dark";
    setTheme(isDark ? "light" : "dark");
  }

  /* --------------------------------- 数据导入 -------------------------------- */

  async function exportProgress() {
    const data = QZ.store.exportData();
    QZ.ui.download(`353进度-${QZ.store.dayKey()}.json`, JSON.stringify(data, null, 2));
    toast("进度已导出");
  }

  async function importProgress() {
    const file = await QZ.ui.pickFile("application/json,.json");
    if (!file) return;
    const ok = await QZ.ui.confirm({
      title: "导入学习进度",
      body: `将用「${file.name}」替换当前浏览器中的答题记录、错题和考试记录。`,
      okLabel: "导入并替换"
    });
    if (!ok) return;
    try {
      const count = QZ.store.importData(file.text);
      toast(`已导入 ${count} 道题的进度`);
      render();
    } catch (error) {
      toast(`导入失败：${error.message}`, "error");
    }
  }

  async function importBank() {
    const file = await QZ.ui.pickFile("application/json,.json");
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(file.text);
    } catch (error) {
      toast("JSON 解析失败，请检查逗号和引号", "error");
      return;
    }
    const list = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(list)) {
      toast("格式不正确：顶层应为数组或包含 questions 数组", "error");
      return;
    }
    const valid = list.filter(
      item => item && typeof item.stem === "string" && item.stem.trim() && Array.isArray(item.options) && item.options.length >= 2 && item.answer
    );
    if (!valid.length) {
      toast("没有找到有效题目：请检查 stem / options / answer", "error");
      return;
    }
    const ok = await QZ.ui.confirm({
      title: "导入自定义题库",
      body: `共 ${valid.length} 道有效题目（${list.length - valid.length} 道格式不完整将被跳过）。导入会替换现有自定义题库。`,
      okLabel: "导入"
    });
    if (!ok) return;
    if (!QZ.store.setCustomBank(valid)) {
      toast("保存失败，可能是浏览器存储空间不足", "error");
      return;
    }
    await reloadData();
    toast(`已导入 ${valid.length} 道题`);
    render();
  }

  function exportBank() {
    const list = QZ.store.getCustomBank();
    if (!list.length) {
      toast("还没有自定义题目", "warn");
      return;
    }
    QZ.ui.download(`自定义题库-${QZ.store.dayKey()}.json`, JSON.stringify(list, null, 2));
    toast("题库已导出");
  }

  async function clearBank() {
    const ok = await QZ.ui.confirm({
      title: "清空自定义题库",
      body: "将删除所有导入的题目，内置题库和学习进度不受影响。",
      okLabel: "清空",
      danger: true
    });
    if (!ok) return;
    QZ.store.setCustomBank([]);
    await reloadData();
    toast("自定义题库已清空");
    render();
  }

  async function resetProgress() {
    const ok = await QZ.ui.confirm({
      title: "清空全部学习进度",
      body: "答题记录、错题本、收藏、考试记录都会被删除。自定义题库会保留。此操作无法撤销，建议先导出备份。",
      okLabel: "确认清空",
      danger: true
    });
    if (!ok) return;
    QZ.store.resetProgress();
    QZ.practice.discard();
    toast("学习进度已清空");
    render();
  }

  async function reloadData() {
    await QZ.data.load();
    buildSidebar();
  }

  /* --------------------------------- 事件 --------------------------------- */

  function closeDrawer() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("overlay").classList.remove("show");
  }

  function openDrawer() {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("overlay").classList.add("show");
  }

  document.addEventListener("click", async event => {
    const link = event.target.closest('a[href^="#"]');
    if (link && !link.dataset.action) {
      closeDrawer();
      if (link.getAttribute("href") === (location.hash || "#/")) {
        event.preventDefault();
        render();
      }
      return;
    }
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    switch (action) {
      case "menu":
        openDrawer();
        break;
      case "close-menu":
        closeDrawer();
        break;
      case "toggle-theme":
        toggleTheme();
        break;
      case "quick-random":
        QZ.practice.start({ mode: "random", limit: 20, title: "随机练习", subtitle: "全部科目" });
        break;
      case "start-practice":
        QZ.practice.start({
          subject: el.dataset.subject || undefined,
          chapter: el.dataset.chapter || undefined,
          mode: el.dataset.mode || "seq",
          limit: el.dataset.limit || undefined
        });
        break;
      case "fav":
        QZ.practice.toggleFav();
        break;
      case "choose":
        QZ.practice.choose(el.dataset.letter);
        break;
      case "submit-answer":
        QZ.practice.grade();
        break;
      case "reveal-answer":
        QZ.practice.revealAnswer();
        break;
      case "self-grade":
        QZ.practice.selfGrade(el.dataset.correct === "true");
        break;
      case "prev":
        QZ.practice.prev();
        break;
      case "next":
        QZ.practice.next();
        break;
      case "redo-wrong":
        QZ.practice.restart();
        break;
      case "restart-session":
        QZ.practice.restartAll();
        break;
      case "exit-practice":
        QZ.practice.discard();
        go("#/");
        break;
      case "exam-choose":
        QZ.exam.choose(el.dataset.letter);
        break;
      case "exam-mark":
        QZ.exam.toggleMark();
        break;
      case "exam-prev":
        QZ.exam.prev();
        break;
      case "exam-next":
        QZ.exam.next();
        break;
      case "exam-jump":
        QZ.exam.goTo(el.dataset.index);
        break;
      case "submit-exam": {
        if (!QZ.exam.state) return;
        const answered = QZ.exam.state.queue.filter(id => (QZ.exam.state.answers[id] || []).length).length;
        const unanswered = QZ.exam.state.queue.length - answered;
        const ok = await QZ.ui.confirm({
          title: "确认交卷？",
          body: unanswered ? `还有 ${unanswered} 题未作答，交卷后将按错题计入成绩。` : "所有题目都已作答，交卷后统一批改。",
          okLabel: "交卷"
        });
        if (ok) QZ.exam.submit(false);
        break;
      }
      case "exam-review-wrong":
        QZ.exam.reviewWrong();
        break;
      case "start-library":
        if (QZ.library) {
          await QZ.library.start(el.dataset.slug, {
            chapter: el.dataset.chapter || undefined,
            mode: el.dataset.mode || "seq",
            limit: el.dataset.limit || undefined
          });
        }
        break;
      case "set-theme":
        setTheme(el.dataset.themeValue);
        break;
      case "export-data":
        exportProgress();
        break;
      case "import-data":
        importProgress();
        break;
      case "import-bank":
        importBank();
        break;
      case "export-bank":
        exportBank();
        break;
      case "clear-bank":
        clearBank();
        break;
      case "reset-progress":
        resetProgress();
        break;
      default:
        break;
    }
  });

  document.addEventListener("change", event => {
    const input = event.target.closest("[data-toggle]");
    if (!input) return;
    QZ.store.setSetting(input.dataset.toggle, input.checked);
    toast(input.checked ? "已开启" : "已关闭");
  });

  document.addEventListener("input", event => {
    const input = event.target.closest("[data-subjective-input]");
    if (input) QZ.practice.saveDraft(input.dataset.subjectiveInput, input.value);
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest("[data-action='exam-form']");
    if (!form) return;
    event.preventDefault();
    const subjects = [...form.querySelectorAll('input[name="subject"]:checked')].map(input => input.value);
    if (!subjects.length) {
      toast("至少选择一个科目", "warn");
      return;
    }
    const count = Number(form.querySelector('[name="count"]').value);
    const duration = Number(form.querySelector('[name="duration"]').value);
    QZ.exam.start({ subjects, count, duration });
  });

  document.addEventListener("keydown", event => {
    const tag = document.activeElement?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (document.querySelector("dialog[open]")) return;
    const route = currentRoute;
    const key = event.key;
    const letter = key.length === 1 ? key.toUpperCase() : "";

    if (route === "practice") {
      if (/^[A-F]$/.test(letter)) {
        event.preventDefault();
        QZ.practice.choose(letter);
      } else if (key === "Enter") {
        event.preventDefault();
        const current = QZ.practice.current();
        if (current && QZ.practice.state && !QZ.practice.state.graded[current.id] && current.type === "multiple") QZ.practice.grade();
        else QZ.practice.next();
      } else if (key === "ArrowLeft") {
        QZ.practice.prev();
      } else if (key === "ArrowRight") {
        QZ.practice.next();
      } else if (letter === "F") {
        QZ.practice.toggleFav();
      }
      return;
    }

    if (route === "exam-run") {
      if (/^[A-F]$/.test(letter)) {
        event.preventDefault();
        QZ.exam.choose(letter);
      } else if (key === "ArrowLeft") {
        QZ.exam.prev();
      } else if (key === "ArrowRight") {
        QZ.exam.next();
      } else if (letter === "M") {
        QZ.exam.toggleMark();
      }
    }
  });

  window.addEventListener("hashchange", () => {
    closeDrawer();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (QZ.store.state.settings.theme === "auto") applyTheme();
  });

  /* --------------------------------- 启动 --------------------------------- */

  async function boot() {
    applyTheme();
    if (window.QZ_LIBRARY_MODE) {
      document.title = "教材题库（OCR 草稿）｜353 刷题室";
    }
    try {
      await QZ.data.load();
    } catch (error) {
      document.getElementById("mainContent").innerHTML = `<section class="empty-state">
        <h1>题库加载失败</h1>
        <p>${escapeHtml(error.message)}</p>
        <p class="settings-note">请通过本地服务器打开网站，例如在项目目录运行 <code>python -m http.server 8000</code>，然后访问 http://localhost:8000 。直接双击 index.html 会被浏览器阻止读取题库文件。</p>
      </section>`;
      return;
    }
    if (window.QZ_LIBRARY_MODE) {
      try {
        await QZ.library.loadIndex();
      } catch (error) {
        console.warn(error);
      }
      if (!location.hash || location.hash === "#/") location.hash = "#/library";
    }
    buildSidebar();
    render();
    setInterval(() => {
      QZ.practice.tickClock();
      if (currentRoute === "exam-run") QZ.exam.tick();
    }, 1000);
  }

  QZ.app = { render, go, reloadData, applyTheme };

  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(error => console.warn("离线缓存注册失败", error));
    });
  }

  boot();
})();
