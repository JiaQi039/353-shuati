/* 模拟考试：抽题、计时、答题卡、统一阅卷 */
(function () {
  const QZ = (window.QZ = window.QZ || {});
  const { escapeHtml, typeLabel, letters, percent, formatTime, clock, toast } = QZ.ui;
  const EXAM_KEY = "qz353.exam.v1";

  let state = null;

  function persist() {
    if (!state || state.submitted) return;
    try {
      localStorage.setItem(
        EXAM_KEY,
        JSON.stringify({
          queue: state.queue,
          idx: state.idx,
          answers: state.answers,
          marked: state.marked,
          startedAt: state.startedAt,
          endsAt: state.endsAt,
          duration: state.duration,
          config: state.config
        })
      );
    } catch (error) {
      console.warn("保存考试进度失败", error);
    }
  }

  function clearSaved() {
    try {
      localStorage.removeItem(EXAM_KEY);
    } catch (error) {
      console.warn(error);
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(EXAM_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved.queue) || !saved.queue.length) return false;
      const queue = saved.queue.filter(id => QZ.data.byId(id));
      if (!queue.length) return false;
      state = {
        queue,
        idx: Math.min(saved.idx || 0, queue.length - 1),
        answers: saved.answers || {},
        marked: saved.marked || {},
        startedAt: saved.startedAt || Date.now(),
        endsAt: saved.endsAt || Date.now() + (saved.duration || 60) * 60000,
        duration: saved.duration || 60,
        config: saved.config || { subjects: [], count: queue.length, duration: 60 },
        submitted: false,
        result: null
      };
      if (state.endsAt <= Date.now()) {
        submit(true);
        return true;
      }
      return true;
    } catch (error) {
      console.warn("恢复考试失败", error);
      return false;
    }
  }

  function start(config) {
    const subjectIds = Array.isArray(config.subjects) && config.subjects.length
      ? config.subjects
      : QZ.data.subjects.filter(subject => !subject.custom).map(subject => subject.id);
    const groups = subjectIds
      .map(id => ({
        id,
        pool: QZ.data.shuffle(
          QZ.data.questions.filter(
            question => question.subject === id && ["single", "multiple", "judge"].includes(question.type)
          )
        )
      }))
      .filter(group => group.pool.length);
    const available = groups.reduce((sum, group) => sum + group.pool.length, 0);
    const count = Math.min(Number(config.count) || 50, available);
    if (!count) {
      toast("所选科目暂无题目", "warn");
      return false;
    }
    // 按各科目题量比例分配名额，避免小样本考试里某科过多或过少
    const quotas = groups.map(group => {
      const exact = (count * group.pool.length) / available;
      return { group, base: Math.floor(exact), fraction: exact - Math.floor(exact) };
    });
    let assigned = quotas.reduce((sum, item) => sum + item.base, 0);
    const byFraction = [...quotas].sort((a, b) => b.fraction - a.fraction);
    for (const item of byFraction) {
      if (assigned >= count) break;
      if (item.base < item.group.pool.length) {
        item.base += 1;
        assigned += 1;
      }
    }
    const picked = quotas.flatMap(item => item.group.pool.slice(0, item.base));
    const queue = QZ.data.shuffle(picked).map(question => question.id);
    state = {
      queue,
      idx: 0,
      answers: {},
      marked: {},
      startedAt: Date.now(),
      endsAt: Date.now() + Number(config.duration || 60) * 60000,
      duration: Number(config.duration || 60),
      config: { subjects: subjectIds, count, duration: Number(config.duration || 60) },
      submitted: false,
      result: null
    };
    persist();
    QZ.router.go("#/exam/run");
    return true;
  }

  function current() {
    if (!state) return null;
    return QZ.data.byId(state.queue[state.idx]);
  }

  function answeredCount() {
    if (!state) return 0;
    return state.queue.filter(id => (state.answers[id] || []).length).length;
  }

  function choose(letter) {
    const question = current();
    if (!question || state.submitted) return;
    const chosen = state.answers[question.id] || [];
    if (question.type === "multiple") {
      const next = chosen.includes(letter) ? chosen.filter(item => item !== letter) : [...chosen, letter];
      state.answers[question.id] = next.sort();
    } else {
      state.answers[question.id] = [letter];
    }
    persist();
    QZ.router.render();
  }

  function toggleMark() {
    const question = current();
    if (!question) return;
    state.marked[question.id] = !state.marked[question.id];
    persist();
    QZ.router.render();
  }

  function goTo(index) {
    if (!state) return;
    const target = Number(index);
    if (!Number.isInteger(target) || target < 0 || target >= state.queue.length) return;
    state.idx = target;
    persist();
    QZ.router.render();
  }

  function next() {
    if (!state) return;
    if (state.idx < state.queue.length - 1) goTo(state.idx + 1);
  }

  function prev() {
    if (!state) return;
    if (state.idx > 0) goTo(state.idx - 1);
  }

  function remainingSeconds() {
    if (!state) return 0;
    return Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  }

  function tick() {
    if (!state || state.submitted) return;
    const node = document.querySelector("[data-exam-clock]");
    if (node) {
      const left = remainingSeconds();
      node.textContent = clock(left);
      node.classList.toggle("is-urgent", left <= 300);
    }
    if (remainingSeconds() <= 0) {
      toast("考试时间到，已自动交卷", "warn");
      submit(true);
    }
  }

  function sameSet(a, b) {
    const left = [...a].sort();
    const right = [...b].sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function submit(auto = false) {
    if (!state || state.submitted) return;
    const result = {
      total: state.queue.length,
      correct: 0,
      wrong: 0,
      unanswered: 0,
      wrongIds: [],
      breakdown: {}
    };
    for (const id of state.queue) {
      const question = QZ.data.byId(id);
      if (!question) continue;
      const chosen = state.answers[id] || [];
      const subject = QZ.data.subject(question.subject);
      const key = question.subject;
      if (!result.breakdown[key]) {
        result.breakdown[key] = { name: subject?.name || key, total: 0, correct: 0 };
      }
      result.breakdown[key].total += 1;
      if (!chosen.length) {
        result.unanswered += 1;
        result.wrongIds.push(id);
        continue;
      }
      const correct = sameSet(chosen, question.answer);
      if (correct) {
        result.correct += 1;
        result.breakdown[key].correct += 1;
      } else {
        result.wrong += 1;
        result.wrongIds.push(id);
      }
      QZ.store.recordAnswer(id, correct);
    }
    result.usedSeconds = Math.min(state.duration * 60, Math.round((Date.now() - state.startedAt) / 1000));
    result.score = result.total ? result.correct / result.total : 0;
    state.submitted = true;
    state.result = result;
    state.autoSubmitted = auto;
    QZ.store.addExam({
      id: `exam-${Date.now()}`,
      at: Date.now(),
      total: result.total,
      correct: result.correct,
      score: result.score,
      usedSeconds: result.usedSeconds,
      duration: state.duration,
      subjects: state.config.subjects,
      breakdown: result.breakdown
    });
    clearSaved();
    QZ.router.go("#/exam/result");
  }

  function reset() {
    state = null;
    clearSaved();
    QZ.router.go("#/exam");
  }

  function renderSetup() {
    const recent = QZ.store.state.exams.slice(0, 4);
    return `
      <div class="page narrow">
        <header class="page-head">
          <div>
            <p class="eyebrow">MOCK EXAM</p>
            <h1>模拟考试</h1>
            <p class="page-sub">按目标院校的节奏抽题，计时作答，交卷后统一批改。</p>
          </div>
        </header>

        <form class="exam-setup" data-action="exam-form">
          <section class="setup-card">
            <div class="setup-head"><span class="step-no">01</span><div><h2>选择科目</h2><p>默认全选；可按院校大纲只保留考试科目。</p></div></div>
            <div class="subject-picks">
              ${QZ.data.subjects
                .filter(subject => !subject.custom && subject.count)
                .map(
                  (subject, index) => `<label class="subject-pick" style="--subject-color:${subject.color}">
                    <input type="checkbox" name="subject" value="${subject.id}" checked>
                    <span class="pick-check"></span>
                    <span class="pick-name">${escapeHtml(subject.name)}</span>
                    <span class="pick-count">${subject.count} 题</span>
                  </label>`
                )
                .join("")}
            </div>
          </section>

          <section class="setup-card">
            <div class="setup-head"><span class="step-no">02</span><div><h2>题量与时长</h2><p>353 专业课考试通常为 3 小时、300 分；此处按每题 3 分折算。</p></div></div>
            <div class="setup-grid">
              <label class="field">
                <span>题量</span>
                <select name="count">
                  <option value="25">25 题 · 小测</option>
                  <option value="50" selected>50 题 · 半套</option>
                  <option value="100">100 题 · 整套</option>
                  <option value="150">150 题 · 加量</option>
                </select>
              </label>
              <label class="field">
                <span>时长</span>
                <select name="duration">
                  <option value="30">30 分钟</option>
                  <option value="60">60 分钟</option>
                  <option value="120">120 分钟</option>
                  <option value="180" selected>180 分钟</option>
                </select>
              </label>
            </div>
            <p class="setup-note">交卷前不显示答案；未作答题目按错题计入成绩单。</p>
          </section>

          <div class="setup-submit">
            <button class="btn btn-primary btn-lg" type="submit" data-action="start-exam">开始考试 →</button>
          </div>
        </form>

        ${
          recent.length
            ? `<section class="recent-exams">
                <div class="section-heading"><h2>最近的考试</h2><span>共 ${QZ.store.state.exams.length} 次</span></div>
                <div class="exam-history">
                  ${recent
                    .map(
                      item => `<div class="history-row">
                        <span class="history-date">${QZ.ui.formatDate(item.at)}</span>
                        <span class="history-score">${Math.round(item.score * 100)} 分</span>
                        <span class="history-meta">${item.correct}/${item.total} 题 · ${formatTime(item.usedSeconds)}</span>
                      </div>`
                    )
                    .join("")}
                </div>
              </section>`
            : ""
        }
      </div>`;
  }

  function renderRun() {
    const question = current();
    if (!question) return renderSetup();
    const chosen = state.answers[question.id] || [];
    const marked = Boolean(state.marked[question.id]);
    const answered = answeredCount();
    const remaining = remainingSeconds();
    const subject = QZ.data.subject(question.subject);

    return `
      <div class="exam-shell">
        <header class="exam-head">
          <div class="exam-head-left">
            <span class="exam-dot" aria-hidden="true"></span>
            <div><strong>模拟考试</strong><span>${state.queue.length} 题 · ${state.duration} 分钟</span></div>
          </div>
          <div class="exam-head-right">
            <span class="exam-progress">已答 <b>${answered}</b> / ${state.queue.length}</span>
            <span class="exam-clock ${remaining <= 300 ? "is-urgent" : ""}" data-exam-clock>${clock(remaining)}</span>
            <button class="btn btn-ghost btn-sm" data-action="submit-exam">交卷</button>
          </div>
        </header>

        <div class="exam-body">
          <main class="exam-main">
            <article class="question-card exam-question">
              <div class="question-top">
                <span class="pill">${typeLabel(question.type)}</span>
                <span class="q-tag">${escapeHtml(subject?.name || "")} · ${escapeHtml(question.chapter)}</span>
                <button class="mark-button ${marked ? "active" : ""}" data-action="exam-mark" aria-pressed="${marked}">
                  ${marked ? "已标记" : "标记"}
                </button>
              </div>
              <h2 class="stem">${escapeHtml(question.stem)}</h2>
              <div class="options" role="group" aria-label="选项">
                ${question.options
                  .map((option, index) => {
                    const letter = String.fromCharCode(65 + index);
                    const selected = chosen.includes(letter);
                    return `<button class="option ${selected ? "is-selected" : ""}" data-action="exam-choose" data-letter="${letter}" aria-pressed="${selected}">
                      <span class="option-letter">${letter}</span>
                      <span class="option-text">${escapeHtml(option)}</span>
                    </button>`;
                  })
                  .join("")}
              </div>
              ${question.type === "multiple" ? `<p class="multi-hint">多选题，选完后可直接进入下一题</p>` : ""}
            </article>

            <footer class="practice-bar exam-bar">
              <button class="btn btn-ghost" data-action="exam-prev" ${state.idx === 0 ? "disabled" : ""}>← 上一题</button>
              <div class="key-hint">A–D 选择 · M 标记 · ← → 翻题</div>
              <button class="btn btn-primary" data-action="exam-next" ${state.idx === state.queue.length - 1 ? "disabled" : ""}>下一题 →</button>
            </footer>
          </main>

          <aside class="exam-palette">
            <div class="palette-head"><h2>答题卡</h2><span>${answered}/${state.queue.length}</span></div>
            <div class="palette-legend">
              <span><i class="dot answered"></i>已答</span>
              <span><i class="dot marked"></i>标记</span>
              <span><i class="dot"></i>未答</span>
            </div>
            <div class="palette-grid">
              ${state.queue
                .map((id, index) => {
                  const isAnswered = (state.answers[id] || []).length;
                  const isMarked = state.marked[id];
                  const classes = ["palette-cell"];
                  if (isAnswered) classes.push("answered");
                  if (isMarked) classes.push("marked");
                  if (index === state.idx) classes.push("current");
                  return `<button class="${classes.join(" ")}" data-action="exam-jump" data-index="${index}" aria-label="第 ${index + 1} 题${isAnswered ? "，已答" : "，未答"}">${index + 1}</button>`;
                })
                .join("")}
            </div>
            <button class="btn btn-primary palette-submit" data-action="submit-exam">交卷并查看成绩</button>
            <p class="palette-tip">未作答题目会在成绩单中单独列出。</p>
          </aside>
        </div>
      </div>`;
  }

  function renderResult() {
    if (!state?.result) {
      return `<section class="empty-state"><h1>没有可显示的成绩</h1><p>请先完成一次模拟考试。</p><a class="btn btn-primary" href="#/exam">去考试</a></section>`;
    }
    const result = state.result;
    const score = Math.round(result.score * 100);
    const grade = score >= 85 ? "状态很好" : score >= 70 ? "稳步推进" : score >= 60 ? "险过线" : "需要补强";
    const wrongItems = result.wrongIds.map(id => QZ.data.byId(id)).filter(Boolean);
    const breakdown = Object.values(result.breakdown);
    return `
      <div class="summary-shell">
        <section class="exam-result-hero">
          <div class="score-ring large" style="--score:${score}">
            <div class="score-ring-inner"><strong>${score}</strong><span>/ 100</span></div>
          </div>
          <div>
            <p class="eyebrow">${state.autoSubmitted ? "时间到 · 自动交卷" : "已交卷"}</p>
            <h1>${grade}</h1>
            <p class="summary-meta">${result.correct} / ${result.total} 题正确 · 折算 300 分制约 ${Math.round(result.score * 300)} 分</p>
            <p class="summary-meta">用时 ${formatTime(result.usedSeconds)} · ${result.unanswered} 题未作答</p>
          </div>
        </section>

        <section class="result-grid">
          ${breakdown
            .map(
              item => `<div class="result-subject">
                <div class="result-subject-head"><span>${escapeHtml(item.name)}</span><b>${item.correct}/${item.total}</b></div>
                <div class="progress-track small"><span style="width:${Math.round((item.correct / item.total) * 100)}%"></span></div>
                <small>${percent(item.correct / item.total)}</small>
              </div>`
            )
            .join("")}
        </section>

        <div class="summary-actions">
          <a class="btn btn-primary" href="#/exam">再考一次</a>
          <button class="btn btn-ghost" data-action="exam-review-wrong">只看错题</button>
          <a class="btn btn-ghost" href="#/stats">查看统计</a>
          <a class="btn btn-ghost" href="#/">返回首页</a>
        </div>

        ${
          wrongItems.length
            ? `<section class="review-section">
                <div class="section-heading"><h2>错题与未答</h2><span>${wrongItems.length} 题</span></div>
                <div class="review-list">
                  ${wrongItems
                    .map(question => {
                      const chosen = state.answers[question.id] || [];
                      return `<details class="review-item">
                        <summary>
                          <span class="pill">${typeLabel(question.type)}</span>
                          <span class="review-stem">${escapeHtml(question.stem)}</span>
                          <span class="review-flag">${chosen.length ? "答错" : "未答"}</span>
                        </summary>
                        <div class="review-body">
                          <div class="review-options">
                            ${question.options
                              .map((option, index) => {
                                const letter = String.fromCharCode(65 + index);
                                const cls = question.answer.includes(letter) ? "correct" : chosen.includes(letter) ? "wrong" : "";
                                return `<div class="review-option ${cls}"><span>${letter}</span>${escapeHtml(option)}</div>`;
                              })
                              .join("")}
                          </div>
                          <p class="review-answer">你的答案：${chosen.length ? chosen.join("、") : "未作答"}　正确答案：${question.answer.join("、")}</p>
                          <p class="review-explain">${escapeHtml(question.explain || "暂无解析")}</p>
                        </div>
                      </details>`;
                    })
                    .join("")}
                </div>
              </section>`
            : `<section class="perfect-card"><span>✦</span><div><h2>全部答对</h2><p>这套题已经难不住你了，可以加量或换科目。</p></div></section>`
        }
      </div>`;
  }

  function reviewWrong() {
    if (!state?.result?.wrongIds?.length) {
      toast("这次没有错题", "info");
      return;
    }
    QZ.practice.start({
      mode: "review",
      ids: state.result.wrongIds,
      title: "模拟考试错题",
      subtitle: "考后订正"
    });
  }

  function view(mode) {
    if (mode === "setup") return renderSetup();
    if (mode === "result") return renderResult();
    if (!state && !restore()) return renderSetup();
    if (state.submitted) return renderResult();
    return renderRun();
  }

  QZ.exam = {
    get state() {
      return state;
    },
    start,
    restore,
    choose,
    toggleMark,
    goTo,
    next,
    prev,
    submit,
    reset,
    tick,
    view,
    reviewWrong,
    remainingSeconds
  };
})();
