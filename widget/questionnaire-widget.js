// questionnaire-widget.js
// Reusable questionnaire widget for Claude's Visualizer.
// Loaded via CDN; exposes window.initQuestionnaire(config, mountId?).
//
// Expected config shape:
// {
//   configuration: {
//     title:        string  (required)
//     intro:        string  (optional, shown on first page only)
//     submitLabel:  string  (optional, defaults to "Submit")
//     pages:        Array<{ id, title, intro, questionIds[] }>  (optional)
//   },
//   questions: Array<{
//     id:             string  (required, unique)
//     responseShape:  "likert+text+note" | "text-only"  (optional, default "likert+text+note")
//     prompt:         string  (required)
//     description:    string  (optional, sub-text hint)
//     charLimitText:  number  (optional, default 200)
//     charLimitNote:  number  (optional, default 100; only used by "likert+text+note")
//   }>
// }
//
// On submit, calls sendPrompt('questionnaire:' + JSON.stringify(payload)) where
// payload echoes configuration + questions and adds results[] and meta.

(function () {
  const LIKERT_LABELS = [
    "Strongly disagree", "Disagree", "Slightly disagree", "Neutral",
    "Slightly agree", "Agree", "Strongly agree"
  ];
  const THUMB_INSET = 9;
  const BASE_CAP = 200;
  const BASE_HEIGHT = 62;
  const STYLE_ID = "qw-styles";

  const STYLES = `
    .qw-frame {
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      color: var(--color-text-primary);
      background: var(--color-background-secondary);
      border: 0.5px solid var(--color-border-tertiary);
      border-radius: var(--border-radius-lg);
      height: 560px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .qw-top { padding: 14px 18px 8px; }
    .qw-title { font-family: var(--font-serif); font-size: 18px; font-weight: 500; margin: 0 0 2px; }
    .qw-intro { color: var(--color-text-secondary); margin: 0; font-size: 13px; }
    .qw-page-meta { display: flex; align-items: baseline; justify-content: space-between; padding: 8px 18px 4px; }
    .qw-page-title { font-family: var(--font-serif); font-size: 15px; font-weight: 500; margin: 0; color: var(--color-text-secondary); }
    .qw-page-counter { color: var(--color-text-tertiary); font-size: 12px; }
    .qw-page-intro { color: var(--color-text-secondary); font-size: 12.5px; padding: 0 18px 8px; margin: 0; }
    .qw-scroll { flex: 1; overflow-y: auto; padding: 4px 18px 12px; display: flex; flex-direction: column; gap: 14px; }
    .qw-card { background: var(--color-background-primary); border-radius: var(--border-radius-md); padding: 14px 16px; }
    .qw-prompt { font-size: 14px; font-weight: 500; margin: 0 0 4px; }
    .qw-description { font-size: 12px; color: var(--color-text-tertiary); margin: 0 0 8px; }
    .qw-textarea-wrap { position: relative; margin-bottom: 12px; }
    .qw-counter { position: absolute; right: 8px; bottom: 6px; font-size: 11px; color: var(--color-text-tertiary); padding: 0 4px; border-radius: 3px; pointer-events: none; }
    .qw-counter.amber { color: var(--color-text-warning); }
    .qw-slider { display: flex; flex-direction: column; margin-bottom: 12px; }
    .qw-slider-ends { display: flex; justify-content: space-between; color: var(--color-text-tertiary); font-size: 11px; margin-bottom: 2px; padding: 0 9px; }
    input[type="range"].qw-slider-input { width: 100%; margin: 0; accent-color: var(--color-text-info); }
    .qw-slider-ticks { position: relative; height: 16px; margin-top: 2px; font-size: 11px; color: var(--color-text-tertiary); }
    .qw-slider-ticks span { position: absolute; transform: translateX(-50%); }
    .qw-slider-ticks span.selected { color: var(--color-text-info); font-weight: 500; }
    .qw-note-wrap { display: flex; justify-content: flex-end; }
    .qw-note-inner { width: 50%; display: flex; align-items: center; gap: 10px; position: relative; }
    .qw-note-label { font-size: 13px; color: var(--color-text-secondary); flex-shrink: 0; }
    .qw-nav { display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; border-top: 0.5px solid var(--color-border-tertiary); background: var(--color-background-secondary); gap: 12px; }
    .qw-nav-right { display: flex; align-items: center; gap: 10px; }
    .qw-validation { color: var(--color-text-warning); font-size: 12px; }
    .qw-result { padding: 16px 18px; overflow-y: auto; flex: 1; }
    .qw-result h3 { margin: 0 0 6px; font-family: var(--font-serif); font-weight: 500; font-size: 15px; }
    .qw-result pre { margin: 0; font-size: 11px; line-height: 1.5; overflow-x: auto; background: var(--color-background-primary); padding: 10px; border-radius: var(--border-radius-md); font-family: var(--font-mono); }
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function textareaHeight(cap) {
    return Math.round((cap / BASE_CAP) * BASE_HEIGHT);
  }

  function applyFieldStyle(el, opts) {
    opts = opts || {};
    el.style.fontSize = opts.fontSize || "14px";
    el.style.lineHeight = "1.55";
    el.style.fontFamily = "var(--font-sans)";
    el.style.background = "var(--color-background-secondary)";
    el.style.border = "0.5px solid transparent";
    el.style.borderRadius = "var(--border-radius-md)";
    el.style.color = "var(--color-text-primary)";
    el.style.width = opts.width || "100%";
    el.style.padding = opts.padding || "8px 10px";
    if (opts.minHeight) {
      el.style.minHeight = opts.minHeight;
      el.style.height = opts.minHeight;
    }
    el.style.boxShadow = "none";
    el.style.outline = "none";
    el.addEventListener("focus", () => {
      el.style.background = "var(--color-background-primary)";
      el.style.borderColor = "var(--color-border-info)";
      el.style.boxShadow = "0 0 0 2px var(--color-background-info)";
    });
    el.addEventListener("blur", () => {
      el.style.background = "var(--color-background-secondary)";
      el.style.borderColor = "transparent";
      el.style.boxShadow = "none";
    });
  }

  function initQuestionnaire(config, mountId) {
    mountId = mountId || "qw-root";
    const mount = document.getElementById(mountId);
    if (!mount) {
      console.error("initQuestionnaire: mount element #" + mountId + " not found");
      return;
    }
    if (!config || !config.configuration || !Array.isArray(config.questions)) {
      console.error("initQuestionnaire: invalid config");
      return;
    }

    injectStyles();

    mount.innerHTML = "";
    const frame = document.createElement("div");
    frame.className = "qw-frame";
    mount.appendChild(frame);

    const submitLabel = config.configuration.submitLabel || "Submit";
    const pages = (config.configuration.pages && config.configuration.pages.length)
      ? config.configuration.pages
      : [{ id: "all", title: "", intro: "", questionIds: config.questions.map(q => q.id) }];

    const state = { pageIndex: 0, answers: {} };
    config.questions.forEach(q => {
      state.answers[q.id] = { likert: null, text: "", note: "" };
    });

    const getQ = id => config.questions.find(q => q.id === id);

    function missingForPage(page, isLast) {
      const ids = isLast ? config.questions.map(q => q.id) : page.questionIds;
      let missingRatings = 0;
      let missingText = 0;
      ids.forEach(id => {
        const q = getQ(id);
        const a = state.answers[id];
        if (q.responseShape === "likert+text+note" && a.likert === null) missingRatings++;
        if (a.text.trim() === "") missingText++;
      });
      return { missingRatings, missingText };
    }

    function updateNav() {
      const nav = frame.querySelector(".qw-nav");
      if (!nav) return;
      const isLast = state.pageIndex === pages.length - 1;
      const page = pages[state.pageIndex];
      const { missingRatings, missingText } = missingForPage(page, isLast);
      const right = nav.querySelector(".qw-nav-right");
      right.innerHTML = "";
      const parts = [];
      if (missingRatings > 0) parts.push(`${missingRatings} rating${missingRatings > 1 ? "s" : ""}`);
      if (missingText > 0) parts.push(`${missingText} response${missingText > 1 ? "s" : ""}`);
      if (parts.length > 0) {
        const v = document.createElement("span");
        v.className = "qw-validation";
        v.textContent = `${parts.join(" and ")} still needed`;
        right.appendChild(v);
      }
      const advance = document.createElement("button");
      advance.textContent = isLast ? submitLabel : "Next";
      advance.disabled = (missingRatings + missingText) > 0;
      advance.addEventListener("click", () => {
        if (isLast) submit();
        else { state.pageIndex++; render(); }
      });
      right.appendChild(advance);
    }

    function render() {
      const page = pages[state.pageIndex];
      const isFirst = state.pageIndex === 0;
      const isLast = state.pageIndex === pages.length - 1;
      const multi = pages.length > 1;

      frame.innerHTML = "";

      const top = document.createElement("div");
      top.className = "qw-top";
      top.innerHTML = `<h3 class="qw-title">${esc(config.configuration.title)}</h3>`;
      if (isFirst && config.configuration.intro) top.innerHTML += `<p class="qw-intro">${esc(config.configuration.intro)}</p>`;
      frame.appendChild(top);

      if (page.title || multi) {
        const meta = document.createElement("div");
        meta.className = "qw-page-meta";
        meta.innerHTML = `<h4 class="qw-page-title">${esc(page.title || "")}</h4>${multi ? `<span class="qw-page-counter">Page ${state.pageIndex + 1} of ${pages.length}</span>` : ""}`;
        frame.appendChild(meta);
      }

      if (page.intro) {
        const intro = document.createElement("p");
        intro.className = "qw-page-intro";
        intro.textContent = page.intro;
        frame.appendChild(intro);
      }

      const scroll = document.createElement("div");
      scroll.className = "qw-scroll";
      page.questionIds.forEach(qid => scroll.appendChild(card(getQ(qid))));
      frame.appendChild(scroll);

      const nav = document.createElement("div");
      nav.className = "qw-nav";
      const left = document.createElement("div");
      if (state.pageIndex > 0) {
        const prev = document.createElement("button");
        prev.textContent = "Previous";
        prev.addEventListener("click", () => { state.pageIndex--; render(); });
        left.appendChild(prev);
      }
      nav.appendChild(left);
      const right = document.createElement("div");
      right.className = "qw-nav-right";
      nav.appendChild(right);
      frame.appendChild(nav);

      updateNav();
    }

    function card(q) {
      const el = document.createElement("div");
      el.className = "qw-card";
      let html = `<div class="qw-prompt">${esc(q.prompt)}</div>`;
      if (q.description) html += `<div class="qw-description">${esc(q.description)}</div>`;
      el.innerHTML = html;
      const shape = q.responseShape || "likert+text+note";
      if (shape === "likert+text+note") {
        el.appendChild(textarea(q, "text", q.charLimitText || BASE_CAP));
        el.appendChild(slider(q));
        el.appendChild(note(q, q.charLimitNote || 100));
      } else if (shape === "text-only") {
        el.appendChild(textarea(q, "text", q.charLimitText || BASE_CAP));
      } else {
        console.warn("Unknown responseShape:", shape);
      }
      return el;
    }

    function textarea(q, slot, cap) {
      const wrap = document.createElement("div");
      wrap.className = "qw-textarea-wrap";
      const ta = document.createElement("textarea");
      ta.placeholder = "Your response";
      ta.value = state.answers[q.id][slot];
      ta.rows = 3;
      applyFieldStyle(ta, { fontSize: "14px", minHeight: `${textareaHeight(cap)}px`, padding: "8px 10px" });
      ta.style.resize = "vertical";
      ta.style.display = "block";
      const counter = document.createElement("span");
      counter.className = "qw-counter";
      const upd = () => { counter.textContent = `${ta.value.length} / ${cap}`; counter.classList.toggle("amber", ta.value.length >= cap); };
      ta.addEventListener("input", () => { state.answers[q.id][slot] = ta.value; upd(); updateNav(); });
      wrap.appendChild(ta);
      wrap.appendChild(counter);
      upd();
      return wrap;
    }

    function slider(q) {
      const wrap = document.createElement("div");
      wrap.className = "qw-slider";
      const ends = document.createElement("div");
      ends.className = "qw-slider-ends";
      ends.innerHTML = `<span>${LIKERT_LABELS[0]}</span><span>${LIKERT_LABELS[6]}</span>`;
      wrap.appendChild(ends);
      const inp = document.createElement("input");
      inp.className = "qw-slider-input";
      inp.type = "range";
      inp.min = "1"; inp.max = "7"; inp.step = "1";
      const cur = state.answers[q.id].likert;
      if (cur === null) {
        inp.value = "4";
        inp.classList.add("unset");
        inp.style.opacity = "0.35";
        inp.style.filter = "grayscale(0.6)";
      } else {
        inp.value = String(cur);
      }
      const ticks = document.createElement("div");
      ticks.className = "qw-slider-ticks";
      for (let i = 1; i <= 7; i++) {
        const s = document.createElement("span");
        s.textContent = i;
        s.style.left = `calc(${THUMB_INSET}px + ((${i - 1}) / 6) * (100% - ${THUMB_INSET * 2}px))`;
        if (cur === i) s.classList.add("selected");
        ticks.appendChild(s);
      }
      const refreshTicks = () => {
        const v = parseInt(inp.value, 10);
        Array.from(ticks.children).forEach((el, idx) => {
          el.classList.toggle("selected", (idx + 1) === v && !inp.classList.contains("unset"));
        });
      };
      const commitUnset = () => {
        if (inp.classList.contains("unset")) {
          state.answers[q.id].likert = parseInt(inp.value, 10);
          inp.classList.remove("unset");
          inp.style.opacity = "";
          inp.style.filter = "";
          refreshTicks();
          updateNav();
        }
      };
      inp.addEventListener("pointerdown", commitUnset);
      inp.addEventListener("keydown", commitUnset);
      inp.addEventListener("input", () => {
        state.answers[q.id].likert = parseInt(inp.value, 10);
        if (inp.classList.contains("unset")) {
          inp.classList.remove("unset");
          inp.style.opacity = "";
          inp.style.filter = "";
        }
        refreshTicks();
        updateNav();
      });
      wrap.appendChild(inp);
      wrap.appendChild(ticks);
      return wrap;
    }

    function note(q, cap) {
      const wrap = document.createElement("div");
      wrap.className = "qw-note-wrap";
      const inner = document.createElement("div");
      inner.className = "qw-note-inner";
      const label = document.createElement("span");
      label.className = "qw-note-label";
      label.textContent = "Notes";
      inner.appendChild(label);
      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = "optional";
      inp.value = state.answers[q.id].note;
      applyFieldStyle(inp, { fontSize: "14px", padding: "7px 50px 7px 10px" });
      inp.style.flex = "1";
      const counter = document.createElement("span");
      counter.className = "qw-counter";
      counter.style.right = "8px";
      counter.style.bottom = "auto";
      counter.style.top = "50%";
      counter.style.transform = "translateY(-50%)";
      const upd = () => { counter.textContent = `${inp.value.length} / ${cap}`; counter.classList.toggle("amber", inp.value.length >= cap); };
      inp.addEventListener("input", () => { state.answers[q.id].note = inp.value; upd(); });
      inner.appendChild(inp);
      inner.appendChild(counter);
      wrap.appendChild(inner);
      upd();
      return wrap;
    }

    function submit() {
      const results = config.questions.map(q => {
        const a = state.answers[q.id];
        const shape = q.responseShape || "likert+text+note";
        return shape === "likert+text+note"
          ? { id: q.id, responseShape: shape, text: a.text, likert: a.likert, note: a.note }
          : { id: q.id, responseShape: shape, text: a.text };
      });
      const payload = {
        configuration: config.configuration,
        questions: config.questions,
        results,
        meta: { submittedAt: new Date().toISOString(), schemaVersion: 1 }
      };

      // Submit handoff to host: sendPrompt if available, else log.
      if (typeof window.sendPrompt === "function") {
        window.sendPrompt("questionnaire:" + JSON.stringify(payload));
      } else {
        console.log("questionnaire submit:", payload);
      }

      // Render result acknowledgement inside the frame
      frame.innerHTML = "";
      const box = document.createElement("div");
      box.className = "qw-result";
      box.innerHTML = `<h3>Submitted</h3><p style="color:var(--color-text-secondary); margin:0 0 8px; font-size:12px;">Result sent to host via sendPrompt.</p><pre id="qw-result-json"></pre>`;
      frame.appendChild(box);
      const pre = box.querySelector("#qw-result-json");
      if (pre) pre.textContent = JSON.stringify(payload, null, 2);
    }

    render();
  }

  window.initQuestionnaire = initQuestionnaire;
})();
