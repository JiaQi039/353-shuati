/* 练习引擎：顺序 / 随机 / 错题 / 收藏 / 重做 */
(function () {
  const QZ = (window.QZ = window.QZ || {});
  const { escapeHtml, typeLabel, letters, percent, formatTime, toast } = QZ.ui;

  let state = null;
  let advanceTimer = null;

  function clearAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  function elapsedSeconds() {
    if (!state) return 0;
    return Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
  }

  function save() {
    if (!state) return;
    QZ.store.saveSession({
      queue: state.queue,
      idx: state.idx,
      selected: state.selected,
      graded: state.graded,
      revealed: state.revealed,
      selfCorrect: state.selfCorrect,
      drafts: state.drafts,
      startedAt: state.startedAt,
      mode: state.mode,
      title: state.title,
      subtitle: state.subtitle,
      subject: state.subject,
      chapter: state.chapter,
      limit: state.limit,
      source: state.source
    });
  }

  function buildTitle({ subject, chapter, mode }) {
    if (mode === "wrong") return "错题重练";
    if (mode === "fav") return "收藏练习";
    if (mode === "random") return "随机练习";
    if (chapter) return `${subject?.name || ""} · ${chapter}`;
    if (subject) return subject.name;
    return "综合练习";
  }

  function buildSubtitle(mode, subject) {
    if (mode === "wrong") return "错题本";
    if (mode === "fav") return "收藏夹";
    if (mode === "random") return "随机抽题";
    if (mode === "review") return "错题重做";
    return subject ? subject.name : "全部科目";
  }

  function start(config = {}) {
    clearAdvance();
    const mode = config.mode || "seq";
    const subject = config.subject ? QZ.data.subject(config.subject) : null;
    let questions;
    if (Array.isArray(config.ids) && config.ids.length) {
      questions = config.ids.map(id => QZ.data.byId(id)).filter(Boolean);
    } else {
      questions = QZ.data.pool({
        subject: config.subject,
        chapter: config.chapter,
        mode,
        limit: config.limit
      });
    }
    if (!questions.length) {
      const message =
        mode === "wrong"
          ? "错题本是空的，先去练几题吧"
          : mode === "fav"
            ? "还没有收藏题目"
            : "这里暂时没有题目";
      toast(message, "warn");
      return false;
    }
    state = {
      mode,
      queue: questions.map(question => question.id),
      idx: 0,
      selected: {},
      graded: {},
      revealed: {},
      selfCorrect: {},
      drafts: {},
      startedAt: Date.now(),
      title: config.title || buildTitle({ subject, chapter: config.chapter, mode }),
      subtitle: config.subtitle || buildSubtitle(mode, subject),
      subject: config.subject || null,
      chapter: config.chapter || null,
      limit: config.limit || null,
      source: config.source || null,
      finished: false,
      results: null
    };
    save();
    QZ.router.go("#/practice");
    return true;
  }

  function restore() {
    const saved = QZ.store.getSession();
    if (!saved || !Array.isArray(saved.queue) || !saved.queue.length) return false;
    const queue = saved.queue.filter(id => QZ.data.byId(id));
    if (!queue.length) {
      QZ.store.clearSession();
      return false;
    }
    const elapsed = Math.max(0, Math.round((Date.now() - (saved.startedAt || Date.now())) / 1000));
    state = {
      mode: saved.mode || "seq",
      queue,
      idx: Math.min(saved.idx || 0, queue.length - 1),
      selected: saved.selected || {},
      graded: saved.graded || {},
      revealed: saved.revealed || {},
      selfCorrect: saved.selfCorrect || {},
      drafts: saved.drafts || {},
      startedAt: Date.now() - elapsed * 1000,
      title: saved.title || "继续练习",
      subtitle: saved.subtitle || "上次进度",
      subject: saved.subject || null,
      chapter: saved.chapter || null,
      limit: saved.limit || null,
      source: saved.source || null,
      finished: false,
      results: null
    };
    return true;
  }

  function current() {
    if (!state) return null;
    return QZ.data.byId(state.queue[state.idx]);
  }

  function isGraded(id) {
    return Boolean(state?.graded[id]);
  }

  function selectedOf(id) {
    return state?.selected[id] || [];
  }

  function sameSet(a, b) {
    const left = [...a].sort();
    const right = [...b].sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function isSubjective(question) {
    return question?.type === "fill" || question?.type === "short";
  }

  function creditTime() {
    if (!state) return;
    const now = Date.now();
    const delta = Math.min(300, Math.max(0, (now - (state.lastCredit || state.startedAt)) / 1000));
    state.lastCredit = now;
    if (delta > 1) QZ.store.addTime(delta);
  }

  function choose(letter) {
    const question = current();
    if (!question || isGraded(question.id) || isSubjective(question)) return;
    const chosen = selectedOf(question.id);
    if (question.type === "multiple") {
      const next = chosen.includes(letter) ? chosen.filter(item => item !== letter) : [...chosen, letter];
      state.selected[question.id] = next.sort();
      QZ.router.render();
      return;
    }
    state.selected[question.id] = [letter];
    grade();
  }

  function grade() {
    const question = current();
    if (!question || isGraded(question.id) || isSubjective(question)) return;
    const chosen = selectedOf(question.id);
    if (!chosen.length) {
      toast("请先选择一个答案", "warn");
      return;
    }
    const correct = sameSet(chosen, question.answer);
    state.graded[question.id] = true;
    state.lastResult = { id: question.id, correct };
    QZ.store.recordAnswer(question.id, correct);
    creditTime();
    save();
    QZ.router.render();
    if (correct && QZ.store.state.settings.autoNext) {
      clearAdvance();
      advanceTimer = setTimeout(() => {
        if (state && current()?.id === question.id && location.hash === "#/practice") next();
      }, 850);
    }
  }

  function revealAnswer() {
    const question = current();
    if (!question || !isSubjective(question)) return;
    state.revealed[question.id] = true;
    save();
    QZ.router.render();
  }

  function selfGrade(correct) {
    const question = current();
    if (!question || !isSubjective(question) || isGraded(question.id)) return;
    state.revealed[question.id] = true;
    state.selfCorrect[question.id] = Boolean(correct);
    state.graded[question.id] = true;
    state.lastResult = { id: question.id, correct: Boolean(correct) };
    QZ.store.recordAnswer(question.id, Boolean(correct));
    creditTime();
    save();
    QZ.router.render();
    if (correct && QZ.store.state.settings.autoNext) {
      clearAdvance();
      advanceTimer = setTimeout(() => {
        if (state && current()?.id === question.id && location.hash === "#/practice") next();
      }, 850);
    }
  }

  function saveDraft(id, value) {
    if (!state) return;
    state.drafts[id] = value;
  }

  function next() {
    clearAdvance();
    if (!state) return;
    creditTime();
    if (state.idx < state.queue.length - 1) {
      state.idx += 1;
      save();
      QZ.router.render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    finish();
  }

  function prev() {
    clearAdvance();
    if (!state || state.idx === 0) return;
    creditTime();
    state.idx -= 1;
    save();
    QZ.router.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFav() {
    const question = current();
    if (!question) return;
    const active = QZ.store.toggleFav(question.id);
    toast(active ? "已加入收藏" : "已取消收藏");
    QZ.router.render();
  }

  function finish() {
    if (!state) return;
    creditTime();
    const results = { correct: 0, wrong: 0, skipped: 0, idsWrong: [], idsSkipped: [], idsCorrect: [] };
    for (const id of state.queue) {
      const question = QZ.data.byId(id);
      if (!question) continue;
      if (!state.graded[id]) {
        results.skipped += 1;
        results.idsWrong.push(id);
        results.idsSkipped.push(id);
        continue;
      }
      const correct = isSubjective(question)
        ? Boolean(state.selfCorrect[id])
        : sameSet(selectedOf(id), question.answer);
      if (correct) {
        results.correct += 1;
        results.idsCorrect.push(id);
      } else {
        results.wrong += 1;
        results.idsWrong.push(id);
      }
    }
    results.total = state.queue.length;
    results.seconds = elapsedSeconds();
    results.finishedAt = Date.now();
    state.finished = true;
    state.results = results;
    QZ.store.clearSession();
    QZ.router.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function restart() {
    if (!state) return;
    const config = {
      mode: "review",
      ids: state.results?.idsWrong?.length ? state.results.idsWrong : state.queue,
      title: state.title,
      subtitle: "重做本轮",
      subject: state.subject,
      chapter: state.chapter
    };
    start(config);
  }

  function restartAll() {
    if (!state) return;
    start({
      mode: "review",
      ids: state.queue,
      title: state.title,
      subtitle: "再练一组",
      subject: state.subject,
      chapter: state.chapter
    });
  }

  function discard() {
    clearAdvance();
    state = null;
    QZ.store.clearSession();
  }

  function optionClass(question, letter) {
    const chosen = selectedOf(question.id);
    const graded = isGraded(question.id);
    const classes = ["option"];
    const isAnswer = question.answer.includes(letter);
    if (!graded && chosen.includes(letter)) classes.push("is-selected");
    if (graded) {
      if (isAnswer) classes.push("is-correct");
      else if (chosen.includes(letter)) classes.push("is-wrong");
      else classes.push("is-muted");
    }
    return classes.join(" ");
  }

  function optionMark(question, letter) {
    if (!isGraded(question.id)) return "";
    if (question.answer.includes(letter)) return "✓";
    if (selectedOf(question.id).includes(letter)) return "✗";
    return "";
  }

  function renderQuestion() {
    const question = current();
    if (!question) {
      state = null;
      return renderEmpty();
    }
    const graded = isGraded(question.id);
    const chosen = selectedOf(question.id);
    const subjective = isSubjective(question);
    const correct = graded
      ? subjective
        ? Boolean(state.selfCorrect[question.id])
        : sameSet(chosen, question.answer)
      : false;
    const missing = graded ? question.answer.filter(letter => !chosen.includes(letter)) : [];
    const extra = graded ? chosen.filter(letter => !question.answer.includes(letter)) : [];
    const resultLabel = correct ? "回答正确" : missing.length && !extra.length ? "漏选，回答不完整" : "回答错误";
    const favorites = QZ.store.isFav(question.id);
    const answered = Object.keys(state.graded).length;
    let rightCount = 0;
    for (const id of Object.keys(state.graded)) {
      const item = QZ.data.byId(id);
      if (!item) continue;
      if (isSubjective(item) ? state.selfCorrect[id] : sameSet(selectedOf(id), item.answer)) rightCount += 1;
    }
    const accuracy = answered ? rightCount / answered : 0;
    const isLast = state.idx === state.queue.length - 1;
    const barPercent = Math.round(((state.idx + 1) / state.queue.length) * 100);

    return `
      <div class="practice-shell">
        <header class="session-head">
          <div class="session-title">
            <p class="eyebrow">${escapeHtml(state.subtitle)}</p>
            <h1>${escapeHtml(state.title)}</h1>
          </div>
          <div class="session-chips">
            <span class="chip"><b>${state.idx + 1}</b><span class="chip-sep">/</span>${state.queue.length}</span>
            <span class="chip">答对率 <b>${answered ? percent(accuracy) : "—"}</b></span>
            ${QZ.store.state.settings.showTimer ? `<span class="chip" data-practice-clock>${formatTime(elapsedSeconds())}</span>` : ""}
          </div>
        </header>

        <div class="progress-track" role="progressbar" aria-valuenow="${barPercent}" aria-valuemin="0" aria-valuemax="100">
          <span style="width:${barPercent}%"></span>
        </div>

        <article class="question-card">
          <div class="question-top">
            <span class="pill">${typeLabel(question.type)}</span>
            <span class="q-tag">${escapeHtml(question.tag || "未标注考点")}</span>
            <button class="fav-button ${favorites ? "active" : ""}" data-action="fav" aria-label="${favorites ? "取消收藏" : "收藏本题"}" aria-pressed="${favorites}">
              ${favorites ? "★" : "☆"}
            </button>
          </div>
          <h2 class="stem">${escapeHtml(question.stem)}</h2>
          ${
            subjective
              ? `<div class="subjective-box">
                  <label class="subjective-label" for="answer-${question.id}">你的答案</label>
                  <textarea id="answer-${question.id}" class="subjective-input" data-subjective-input="${question.id}" rows="${question.type === "fill" ? 2 : 6}" placeholder="${question.type === "fill" ? "填写答案要点…" : "写下你的作答思路…"}">${escapeHtml(state.drafts[question.id] || "")}</textarea>
                  ${
                    !state.revealed[question.id] && !graded
                      ? `<button class="btn btn-primary submit-answer" data-action="reveal-answer">查看参考答案</button>`
                      : ""
                  }
                  ${
                    state.revealed[question.id] || graded
                      ? `<div class="reference-answer">
                          <h4>参考答案</h4>
                          <p>${escapeHtml(question.referenceAnswer || "原书未提供参考答案。")}</p>
                          ${question.explain ? `<p class="reference-explain">${escapeHtml(question.explain)}</p>` : ""}
                        </div>`
                      : ""
                  }
                  ${
                    state.revealed[question.id] && !graded
                      ? `<div class="self-grade">
                          <span>对照参考答案自评：</span>
                          <button class="btn btn-ghost btn-sm" data-action="self-grade" data-correct="true">我答对了</button>
                          <button class="btn btn-ghost btn-sm" data-action="self-grade" data-correct="false">没答对</button>
                        </div>`
                      : ""
                  }
                  ${graded ? `<p class="self-result">已自评：${correct ? "答对" : "没答对"}；本题计入错题本时会按自评结果处理。</p>` : ""}
                </div>`
              : `<div class="options" role="group" aria-label="选项">
                  ${question.options
                    .map((option, index) => {
                      const letter = String.fromCharCode(65 + index);
                      return `<button class="${optionClass(question, letter)}" data-action="choose" data-letter="${letter}" ${graded ? "disabled" : ""} aria-pressed="${chosen.includes(letter)}">
                        <span class="option-letter">${letter}</span>
                        <span class="option-text">${escapeHtml(option)}</span>
                        <span class="option-mark" aria-hidden="true">${optionMark(question, letter)}</span>
                      </button>`;
                    })
                    .join("")}
                </div>
                ${
                  question.type === "multiple" && !graded
                    ? `<button class="btn btn-primary submit-answer" data-action="submit-answer" ${chosen.length ? "" : "disabled"}>确认作答</button>
                       <p class="multi-hint">多选题：选好后点击“确认作答”</p>`
                    : ""
                }`
          }
          ${
            graded
              ? `<div class="feedback ${correct ? "is-ok" : "is-bad"}">
                  <div class="feedback-head">
                    <strong>${subjective ? (correct ? "自评：答对" : "自评：没答对") : resultLabel}</strong>
                    <span>${subjective ? "参考答案见上方" : `正确答案：${question.answer.join("、")}`}</span>
                  </div>
                  <p>${escapeHtml(question.explain || "暂无解析")}</p>
                  <div class="feedback-foot"><span>考点 · ${escapeHtml(question.tag || "未标注")}</span><span>${escapeHtml(question.source || question.id)}</span></div>
                </div>`
              : ""
          }
        </article>

        <footer class="practice-bar">
          <button class="btn btn-ghost" data-action="prev" ${state.idx === 0 ? "disabled" : ""}>← 上一题</button>
          <div class="key-hint">A–D 选择 · Enter 下一题 · F 收藏</div>
          <button class="btn ${graded ? "btn-primary" : "btn-ghost"}" data-action="next">
            ${graded ? (isLast ? "查看结果" : "下一题 →") : isLast ? "查看结果" : "跳过 →"}
          </button>
        </footer>
      </div>`;
  }

  function renderSummary() {
    const results = state.results;
    const accuracy = results.total ? results.correct / results.total : 0;
    const wrongItems = results.idsWrong.map(id => QZ.data.byId(id)).filter(Boolean);
    return `
      <div class="summary-shell">
        <section class="summary-hero">
          <div class="score-ring" style="--score:${Math.round(accuracy * 100)}">
            <div class="score-ring-inner">
              <strong>${percent(accuracy)}</strong>
              <span>正确率</span>
            </div>
          </div>
          <div class="summary-copy">
            <p class="eyebrow">练习完成</p>
            <h1>${escapeHtml(state.title)}</h1>
            <p class="summary-meta">${results.correct} / ${results.total} 题答对 · 用时 ${formatTime(results.seconds)}</p>
          </div>
        </section>

        <section class="summary-stats">
          <div class="mini-stat"><span>答对</span><b class="ok-text">${results.correct}</b></div>
          <div class="mini-stat"><span>答错</span><b class="bad-text">${results.wrong}</b></div>
          <div class="mini-stat"><span>未作答</span><b>${results.skipped}</b></div>
          <div class="mini-stat"><span>本轮题量</span><b>${results.total}</b></div>
        </section>

        <div class="summary-actions">
          ${wrongItems.length ? `<button class="btn btn-primary" data-action="redo-wrong">重做错题${results.skipped ? "与未答" : ""}（${wrongItems.length}）</button>` : ""}
          <button class="btn btn-ghost" data-action="restart-session">再练一组</button>
          <a class="btn btn-ghost" href="#/">返回首页</a>
          ${wrongItems.length ? `<a class="btn btn-ghost" href="#/wrong">去错题本</a>` : ""}
        </div>

        ${
          wrongItems.length
            ? `<section class="review-section">
                <div class="section-heading"><h2>错题回顾</h2><span>${wrongItems.length} 题</span></div>
                <div class="review-list">
                  ${wrongItems
                    .map(question => {
                      const chosen = selectedOf(question.id);
                      return `<details class="review-item">
                        <summary>
                          <span class="pill">${typeLabel(question.type)}</span>
                          <span class="review-stem">${escapeHtml(question.stem)}</span>
                          <span class="review-flag">${isSubjective(question) ? (state.graded[question.id] ? "自评答错" : "未答") : chosen.length ? "答错" : "未答"}</span>
                        </summary>
                        <div class="review-body">
                          ${
                            isSubjective(question)
                              ? `<p class="review-answer">参考答案：${escapeHtml(question.referenceAnswer || "原书未提供")}</p>`
                              : `<div class="review-options">
                                  ${question.options
                                    .map((option, index) => {
                                      const letter = String.fromCharCode(65 + index);
                                      const cls = question.answer.includes(letter) ? "correct" : chosen.includes(letter) ? "wrong" : "";
                                      return `<div class="review-option ${cls}"><span>${letter}</span>${escapeHtml(option)}</div>`;
                                    })
                                    .join("")}
                                </div>
                                <p class="review-answer">你的答案：${chosen.length ? chosen.join("、") : "未作答"}　正确答案：${question.answer.join("、")}</p>`
                          }
                          <p class="review-explain">${escapeHtml(question.explain || "暂无解析")}</p>
                        </div>
                      </details>`;
                    })
                    .join("")}
                </div>
              </section>`
            : `<section class="perfect-card"><span>✦</span><div><h2>本轮全对</h2><p>保持这个节奏，去挑战下一章吧。</p></div></section>`
        }
      </div>`;
  }

  function renderEmpty() {
    return `<section class="empty-state">
      <p class="eyebrow">还没有开始的练习</p>
      <h1>从一组小题开始。</h1>
      <p>可以随机抽 20 题热身，或从左侧选择科目和章节。</p>
      <div class="empty-actions">
        <button class="btn btn-primary" data-action="quick-random">随机 20 题</button>
        <a class="btn btn-ghost" href="#/">返回首页</a>
      </div>
    </section>`;
  }

  function view() {
    if (!state && !restore()) return renderEmpty();
    if (state.finished) return renderSummary();
    return renderQuestion();
  }

  function tickClock() {
    if (!state || state.finished) return;
    document.querySelectorAll("[data-practice-clock]").forEach(node => {
      node.textContent = formatTime(elapsedSeconds());
    });
  }

  QZ.practice = {
    get state() {
      return state;
    },
    start,
    restore,
    discard,
    choose,
    grade,
    revealAnswer,
    selfGrade,
    saveDraft,
    next,
    prev,
    toggleFav,
    restart,
    restartAll,
    finish,
    view,
    tickClock,
    current
  };
})();
