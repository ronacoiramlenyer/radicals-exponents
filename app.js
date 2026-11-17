(() => {
  "use strict";
  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =========================================================
     Tiny math-markup helpers. Every "token" has a key (data-k).
     When a stepper moves to the next step, tokens with the same
     key glide from their old spot to their new spot (FLIP).
     ========================================================= */
  const T = (k, c, cls = "") => `<span class="tok ${cls}" data-k="${k}">${c}</span>`;
  const O = (k, c) => T(k, c, "op");
  const v = (s) => `<i>${s}</i>`;
  const X = (k, cls = "") => T(k, v("x"), cls);
  const S = (inner) => `<sup>${inner}</sup>`;
  const PW = (kb, b, ke, e, cb = "", ce = "") => `${T(kb, b, cb)}${S(T(ke, e, ce))}`;
  const F = (n, d) => `<span class="frac"><span class="num">${n}</span><span class="den">${d}</span></span>`;
  const SYM = `<span class="rad-sym" aria-hidden="true"><svg viewBox="0 0 20 40" preserveAspectRatio="none"><path d="M1 25 L5 22.5 L10.5 38 L18 1 L20 1"/></svg></span>`;
  const R = (inner, idx = "") =>
    `<span class="rad${idx ? " has-idx" : ""}">${idx ? `<span class="rad-idx">${idx}</span>` : ""}${SYM}<span class="rad-in">${inner}</span></span>`;
  const MINUS = "−";

  /* ---------- FLIP renderer ---------- */
  function flip(stage, html, instant) {
    const old = new Map();
    stage.querySelectorAll("[data-k]").forEach((el) => {
      if (old.has(el.dataset.k) || el.classList.contains("ghost")) return;
      old.set(el.dataset.k, {
        r: el.getBoundingClientRect(),
        el,
        html: el.innerHTML,
        fs: getComputedStyle(el).fontSize,
      });
    });
    stage.querySelectorAll(".ghost").forEach((g) => g.remove());
    stage.innerHTML = `<div class="expr">${html}</div>`;
    if (instant || REDUCE) return;

    const seen = new Set();
    stage.querySelectorAll("[data-k]").forEach((el) => {
      const k = el.dataset.k;
      const o = old.get(k);
      if (o) {
        seen.add(k);
        const n = el.getBoundingClientRect();
        const dx = o.r.left - n.left;
        const dy = o.r.top - n.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
            duration: 750,
            easing: "cubic-bezier(.22,.9,.24,1)",
          });
        }
        if (o.html !== el.innerHTML) el.classList.add("changed");
      } else {
        el.animate(
          [
            { opacity: 0, transform: "translateY(10px) scale(.6)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 450, delay: 380, easing: "ease-out", fill: "backwards" }
        );
      }
    });
    const nr = stage.getBoundingClientRect();
    old.forEach((o, k) => {
      if (seen.has(k)) return;
      const g = o.el.cloneNode(true);
      g.classList.add("ghost");
      g.removeAttribute("data-k");
      Object.assign(g.style, {
        position: "absolute",
        left: o.r.left - nr.left + "px",
        top: o.r.top - nr.top + "px",
        width: o.r.width + "px",
        height: o.r.height + "px",
        fontSize: o.fs,
        margin: "0",
        pointerEvents: "none",
        fontFamily: "var(--f-math)",
        lineHeight: o.r.height + "px",
      });
      stage.appendChild(g);
      const a = g.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(-14px) scale(.5)" },
        ],
        { duration: 480, easing: "ease-in", fill: "forwards" }
      );
      a.onfinish = () => g.remove();
    });
  }

  /* ---------- Stepper component ---------- */
  class Stepper {
    constructor(el, steps, opts = {}) {
      if (el._stepper) el._stepper.stop();
      el._stepper = this;
      this.el = el;
      this.steps = steps;
      this.opts = opts;
      this.i = 0;
      this.timer = null;
      const title = opts.title || el.dataset.title;
      el.classList.add("stepper");
      el.classList.toggle("compact", !!opts.compact);
      el.innerHTML = `
        ${title ? `<div class="st-head"><span class="st-tag">Animated walkthrough</span><span class="st-title">${title}</span></div>` : ""}
        <div class="st-stage" tabindex="0" aria-label="Animation stage. Use left and right arrow keys to change steps."></div>
        <div class="st-note" aria-live="polite"></div>
        <div class="st-bar">
          <button type="button" class="btn ghost" data-a="prev" aria-label="Previous step">←</button>
          <div class="st-dots">${steps
            .map((_, j) => `<button type="button" class="dot" data-j="${j}" aria-label="Go to step ${j + 1}"></button>`)
            .join("")}</div>
          <span class="st-count"></span>
          <button type="button" class="btn ghost" data-a="play">▶ Play</button>
          <button type="button" class="btn" data-a="next">Next step →</button>
        </div>`;
      this.stage = el.querySelector(".st-stage");
      this.note = el.querySelector(".st-note");
      this.dots = [...el.querySelectorAll(".dot")];
      this.count = el.querySelector(".st-count");
      this.bPrev = el.querySelector('[data-a="prev"]');
      this.bNext = el.querySelector('[data-a="next"]');
      this.bPlay = el.querySelector('[data-a="play"]');
      el.onclick = (e) => {
        const b = e.target.closest("button");
        if (!b || !el.contains(b)) return;
        if (b.dataset.j) {
          this.stop();
          this.go(+b.dataset.j);
        } else if (b.dataset.a === "next") {
          this.stop();
          this.next();
        } else if (b.dataset.a === "prev") {
          this.stop();
          this.go(this.i - 1);
        } else if (b.dataset.a === "play") this.toggle();
      };
      el.onkeydown = (e) => {
        if (e.target.tagName === "INPUT") return;
        if (e.key === "ArrowRight") {
          this.stop();
          this.next();
          e.preventDefault();
        } else if (e.key === "ArrowLeft") {
          this.stop();
          this.go(this.i - 1);
          e.preventDefault();
        }
      };
      this.go(0, true);
    }
    go(j, instant) {
      if (j < 0 || j >= this.steps.length) return;
      this.i = j;
      const s = this.steps[j];
      flip(this.stage, s.h, instant);
      this.note.innerHTML = s.n;
      this.note.classList.remove("in");
      void this.note.offsetWidth;
      this.note.classList.add("in");
      this.dots.forEach((d, k) => {
        d.classList.toggle("is-on", k === j);
        d.classList.toggle("is-past", k < j);
        d.setAttribute("aria-current", k === j ? "step" : "false");
      });
      this.count.textContent = `Step ${j + 1} of ${this.steps.length}`;
      this.bPrev.disabled = j === 0;
      const last = j === this.steps.length - 1;
      this.bNext.disabled = last && !this.opts.loop;
      if (!this.timer) this.bPlay.textContent = last ? "↺ Replay" : "▶ Play";
    }
    next() {
      if (this.i < this.steps.length - 1) this.go(this.i + 1);
      else if (this.opts.loop) this.go(0);
    }
    toggle() {
      this.timer ? this.stop() : this.play();
    }
    play() {
      if (this.i === this.steps.length - 1) this.go(0);
      else this.next();
      this.timer = setInterval(() => {
        if (this.i >= this.steps.length - 1 && !this.opts.loop) return this.stop();
        this.next();
      }, this.opts.delay || 2800);
      this.bPlay.textContent = "❚❚ Pause";
    }
    stop() {
      clearInterval(this.timer);
      this.timer = null;
      if (this.bPlay) this.bPlay.textContent = this.i === this.steps.length - 1 ? "↺ Replay" : "▶ Play";
    }
  }

  /* =========================================================
     Step-by-step scripts for every walkthrough.
     h = expression markup, n = what to say about it.
     ========================================================= */
  const RULE = (name, f) => `<b>${name}:</b> <span class="m">${f}</span>`;

  const STEPS = {
    /* ----- prerequisites ----- */
    signParen: [
      { h: O("p1", "(") + T("a", MINUS + "3", "hl") + O("p2", ")") + S(T("e", "2", "hl2")), n: "The parentheses make <b>−3</b> the base. The whole −3 gets squared." },
      { h: O("p1", "(") + T("a", MINUS + "3") + O("p2", ")") + O("m", "·") + O("p3", "(") + T("a2", MINUS + "3") + O("p4", ")"), n: "Squared means two factors: (−3) · (−3)." },
      { h: T("a", "9", "hl"), n: "Negative × negative = positive. So <b>(−3)<sup>2</sup> = 9</b>." },
    ],
    signNoParen: [
      { h: T("neg", MINUS, "hl2") + PW("a", "3", "e", "2", "hl"), n: "No parentheses: the base is only <b>3</b>. The minus sign waits outside." },
      { h: T("neg", MINUS) + O("p1", "(") + T("a", "3") + O("m", "·") + T("a2", "3") + O("p2", ")"), n: "Exponents come first (GEMDAS), so square the 3." },
      { h: T("neg", MINUS) + T("a", "9"), n: "Then apply the minus. So <b>−3<sup>2</sup> = −9</b>." },
    ],
    fraction: [
      { h: F(T("a", "2"), T("b", "3")) + O("m", "·") + F(T("c", "9"), T("d", "4")), n: "Two fractions multiplied." },
      { h: F(T("a", "2") + O("m1", "·") + T("c", "9"), T("b", "3") + O("m2", "·") + T("d", "4")), n: "Multiply straight across: top times top, bottom times bottom." },
      { h: F(T("a", "2") + O("m1", "·") + T("c3", "3") + O("m3", "·") + T("c", "3"), T("b", "3") + O("m2", "·") + T("d2", "2") + O("m4", "·") + T("d", "2")), n: "Break 9 and 4 into primes: 9 = 3 · 3 and 4 = 2 · 2." },
      { h: F(T("a", "2", "cancel") + O("m1", "·") + T("c3", "3", "cancel") + O("m3", "·") + T("c", "3"), T("b", "3", "cancel") + O("m2", "·") + T("d2", "2", "cancel") + O("m4", "·") + T("d", "2")), n: "A factor on top cancels the same factor on the bottom (because 2/2 = 1 and 3/3 = 1)." },
      { h: F(T("c", "3"), T("d", "2")), n: "What's left: <b>3/2</b>. Cancelling factors is exactly what the quotient rule does with exponents." },
    ],

    /* ----- laws of exponents ----- */
    meaning: [
      { h: PW("f1", "2", "e", "4", "hl", "hl2"), n: "The <b>base</b> is 2 and the <b>exponent</b> is 4. The exponent counts how many times the base is used as a factor." },
      { h: T("f1", "2") + O("m1", "·") + T("f2", "2") + O("m2", "·") + T("f3", "2") + O("m3", "·") + T("f4", "2"), n: "So write the base 4 times and multiply." },
      { h: T("f1", "4") + O("m2", "·") + T("f3", "2") + O("m3", "·") + T("f4", "2"), n: "Multiply from left to right: 2 · 2 = 4." },
      { h: T("f1", "8") + O("m3", "·") + T("f4", "2"), n: "4 · 2 = 8." },
      { h: T("f1", "16", "hl"), n: "8 · 2 = 16. So <b>2<sup>4</sup> = 16</b>. (Not 2 · 4 = 8!)" },
    ],
    product: [
      { h: PW("a", v("x"), "ae", "3", "hl", "hl2") + O("o1", "·") + PW("b", v("x"), "be", "2", "hl", "hl2"), n: "Same base <i>x</i>, multiplied. What does this really mean?" },
      { h: O("p1", "(") + X("a") + O("m1", "·") + X("x2") + O("m2", "·") + X("x3") + O("p2", ")") + O("o1", "·") + O("p3", "(") + X("b") + O("m3", "·") + X("x5") + O("p4", ")"), n: "Expand: <i>x</i><sup>3</sup> is three <i>x</i>’s and <i>x</i><sup>2</sup> is two <i>x</i>’s." },
      { h: X("a", "hl") + O("m1", "·") + X("x2", "hl") + O("m2", "·") + X("x3", "hl") + O("o1", "·") + X("b", "hl") + O("m3", "·") + X("x5", "hl"), n: "Drop the parentheses and count them: <b>5</b> factors of <i>x</i>." },
      { h: PW("a", v("x"), "ae", "3 + 2", "", "hl2"), n: "Counting them is the same as <b>adding the exponents</b>: 3 + 2." },
      { h: PW("a", v("x"), "ae", "5", "", "hl2"), n: RULE("Product rule", "a<sup>m</sup> · a<sup>n</sup> = a<sup>m+n</sup>") },
    ],
    quotient: [
      { h: F(PW("a", v("x"), "ae", "5", "", "hl2"), PW("b", v("x"), "be", "2", "", "hl2")), n: "Same base, divided. A fraction bar means division." },
      { h: F(X("a") + O("m1", "·") + X("t2") + O("m2", "·") + X("t3") + O("m3", "·") + X("t4") + O("m4", "·") + X("t5"), X("b") + O("m5", "·") + X("d2")), n: "Expand the top (five <i>x</i>’s) and the bottom (two <i>x</i>’s)." },
      { h: F(X("a", "cancel") + O("m1", "·") + X("t2", "cancel") + O("m2", "·") + X("t3") + O("m3", "·") + X("t4") + O("m4", "·") + X("t5"), X("b", "cancel") + O("m5", "·") + X("d2", "cancel")), n: "Each <i>x</i>/<i>x</i> pair equals 1, so it cancels. Two pairs cancel." },
      { h: X("t3", "hl") + O("m3", "·") + X("t4", "hl") + O("m4", "·") + X("t5", "hl"), n: "Three <i>x</i>’s are left on top." },
      { h: PW("t3", v("x"), "e", "5 " + MINUS + " 2", "", "hl2"), n: "That's 5 − 2: <b>subtract the exponents</b> (top minus bottom)." },
      { h: PW("t3", v("x"), "e", "3", "", "hl2"), n: RULE("Quotient rule", "a<sup>m</sup> ÷ a<sup>n</sup> = a<sup>m−n</sup>") },
    ],
    powpow: [
      { h: O("p1", "(") + PW("a", v("x"), "ae", "2") + O("p2", ")") + S(T("o", "3", "hl2")), n: "A power raised to another power. The outside 3 means “use what's inside 3 times.”" },
      { h: PW("a", v("x"), "ae", "2") + O("m1", "·") + PW("b", v("x"), "be", "2") + O("m2", "·") + PW("c", v("x"), "ce", "2"), n: "Three copies of <i>x</i><sup>2</sup>, multiplied." },
      { h: PW("a", v("x"), "ae", "2 + 2 + 2", "", "hl2"), n: "Product rule: same base, so add the exponents." },
      { h: PW("a", v("x"), "ae", "2 · 3", "", "hl2"), n: "Adding 2 three times is the same as 2 × 3." },
      { h: PW("a", v("x"), "ae", "6", "", "hl2"), n: RULE("Power of a power", "(a<sup>m</sup>)<sup>n</sup> = a<sup>mn</sup>") + ". Multiply the exponents." },
    ],
    powprod: [
      { h: O("p1", "(") + T("two", "2") + X("x") + O("p2", ")") + S(T("o", "3", "hl2")), n: "Everything inside the parentheses is raised to the 3rd power." },
      { h: O("q1", "(") + T("two", "2") + X("x") + O("q2", ")") + O("m1", "·") + O("q3", "(") + T("t2", "2") + X("x2") + O("q4", ")") + O("m2", "·") + O("q5", "(") + T("t3", "2") + X("x3") + O("q6", ")"), n: "Write (2<i>x</i>) three times." },
      { h: T("two", "2", "hl") + O("m1", "·") + T("t2", "2", "hl") + O("m2", "·") + T("t3", "2", "hl") + O("m3", "·") + X("x", "hl2") + O("m4", "·") + X("x2", "hl2") + O("m5", "·") + X("x3", "hl2"), n: "You may multiply in any order, so group the 2’s together and the <i>x</i>’s together." },
      { h: PW("two", "2", "e1", "3", "", "hl2") + PW("x", v("x"), "e2", "3", "", "hl2"), n: "Each factor gets the exponent 3." },
      { h: T("two", "8") + PW("x", v("x"), "e2", "3"), n: "2<sup>3</sup> = 8. " + RULE("Power of a product", "(ab)<sup>n</sup> = a<sup>n</sup>b<sup>n</sup>") },
    ],
    powquot: [
      { h: O("p1", "(") + F(X("x"), T("three", "3")) + O("p2", ")") + S(T("o", "2", "hl2")), n: "A fraction raised to a power." },
      { h: F(X("x"), T("three", "3")) + O("m", "·") + F(X("x2"), T("three2", "3")), n: "Squared means two copies of the fraction." },
      { h: F(X("x") + O("m1", "·") + X("x2"), T("three", "3") + O("m2", "·") + T("three2", "3")), n: "Multiply fractions: top × top, bottom × bottom." },
      { h: F(PW("x", v("x"), "e1", "2", "", "hl2"), PW("three", "3", "e2", "2", "", "hl2")), n: "Both the numerator and the denominator get the exponent." },
      { h: F(PW("x", v("x"), "e1", "2"), T("three", "9")), n: RULE("Power of a quotient", "(a/b)<sup>n</sup> = a<sup>n</sup>/b<sup>n</sup>") },
    ],
    pattern: (() => {
      const rows = [
        ["3", "8"],
        ["2", "4"],
        ["1", "2"],
        ["0", "1"],
        [MINUS + "1", F("1", "2")],
        [MINUS + "2", F("1", "4")],
      ];
      const notes = [
        "2<sup>3</sup> = 8. Watch what happens each time the exponent goes down by 1.",
        "Exponent down by 1 → the value is divided by 2.",
        "Same pattern again: 4 ÷ 2 = 2.",
        "Keep going: 2 ÷ 2 = <b>1</b>. So 2<sup>0</sup> = 1. " + RULE("Zero exponent", "a<sup>0</sup> = 1"),
        "Past zero: 1 ÷ 2 = 1/2. So 2<sup>−1</sup> = 1/2<sup>1</sup>.",
        "And 2<sup>−2</sup> = 1/4 = 1/2<sup>2</sup>. " + RULE("Negative exponent", "a<sup>−n</sup> = 1/a<sup>n</sup>"),
      ];
      return rows.map((_, i) => ({
        h:
          `<span class="ptable">` +
          rows
            .slice(0, i + 1)
            .map(
              ([e, val], j) =>
                `<span class="prow">${PW("l" + j, "2", "le" + j, e, "", j === i ? "hl2" : "")}${O("q" + j, "=")}${T("r" + j, val, j === i ? "hl" : "")}${
                  j > 0 ? T("a" + j, "÷ 2 ↓", "arrow") : T("a0", "", "arrow")
                }</span>`
            )
            .join("") +
          `</span>`,
        n: notes[i],
      }));
    })(),
    zeroq: [
      { h: F(PW("a", v("x"), "ae", "3"), PW("b", v("x"), "be", "3")), n: "Any nonzero number divided by itself is 1. So this equals 1." },
      { h: PW("a", v("x"), "ae", "3 " + MINUS + " 3", "", "hl2") + O("eq", "=") + T("one", "1"), n: "But the quotient rule says: subtract the exponents." },
      { h: PW("a", v("x"), "ae", "0", "", "hl2") + O("eq", "=") + T("one", "1", "hl"), n: "Both ways must agree, so <b><i>x</i><sup>0</sup> = 1</b>." },
    ],
    negative: [
      { h: PW("a", "2", "ae", MINUS + "3", "", "hl2"), n: "A negative exponent does <b>not</b> make the number negative." },
      { h: F(T("one", "1"), PW("a", "2", "ae", "3", "", "hl2")), n: "It means reciprocal: move the power below the fraction bar, and the exponent becomes positive." },
      { h: F(T("one", "1"), T("a", "2") + O("m1", "·") + T("a2", "2") + O("m2", "·") + T("a3", "2")), n: "2<sup>3</sup> = 2 · 2 · 2" },
      { h: F(T("one", "1"), T("a", "8", "hl")), n: "<b>2<sup>−3</sup> = 1/8</b>. Small, but still positive." },
    ],
    negfrac: [
      { h: O("p1", "(") + F(T("t", "2"), T("b", "3")) + O("p2", ")") + S(T("e", MINUS + "2", "hl2")), n: "A fraction with a negative exponent." },
      { h: O("p1", "(") + F(T("b", "3", "hl"), T("t", "2", "hl")) + O("p2", ")") + S(T("e", "2", "hl2")), n: "Flip the fraction (take its reciprocal) and the exponent becomes positive." },
      { h: F(PW("b", "3", "e1", "2"), PW("t", "2", "e2", "2")), n: "Power of a quotient: square the top and the bottom." },
      { h: F(T("b", "9"), T("t", "4")), n: "<b>(2/3)<sup>−2</sup> = 9/4</b>" },
    ],

    /* ----- simplification process ----- */
    simp1: (() => {
      const rest = (eX = MINUS + "1", eY = "4") => O("dot", "·") + T("c2", "2") + PW("x2", v("x"), "x2e", eX) + PW("y2", v("y"), "y2e", eY);
      return [
        { h: O("p1", "(") + T("c", "3") + PW("x", v("x"), "xe", "2") + PW("y", v("y"), "ye", MINUS + "3") + O("p2", ")") + S(T("o", "2", "hl2")) + rest(), n: "<b>Step 1: clear parentheses.</b> The outside exponent 2 goes to every factor inside: 3, <i>x</i><sup>2</sup> and <i>y</i><sup>−3</sup>." },
        { h: T("c", "3") + S(T("o1", "2", "hl2")) + O("q1", "(") + PW("x", v("x"), "xe", "2") + O("q2", ")") + S(T("o2", "2", "hl2")) + O("q3", "(") + PW("y", v("y"), "ye", MINUS + "3") + O("q4", ")") + S(T("o3", "2", "hl2")) + rest(), n: "Power of a product: every factor gets the 2." },
        { h: T("c", "9", "hl") + PW("x", v("x"), "xe", "4", "", "hl2") + PW("y", v("y"), "ye", MINUS + "6", "", "hl2") + rest(), n: "3<sup>2</sup> = 9. Power of a power: 2 · 2 = 4 and −3 · 2 = −6." },
        { h: O("g1", "(") + T("c", "9") + O("m1", "·") + T("c2", "2") + O("g2", ")") + O("g3", "(") + PW("x", v("x"), "xe", "4") + O("m2", "·") + PW("x2", v("x"), "x2e", MINUS + "1") + O("g4", ")") + O("g5", "(") + PW("y", v("y"), "ye", MINUS + "6") + O("m3", "·") + PW("y2", v("y"), "y2e", "4") + O("g6", ")"), n: "<b>Step 2: group like bases.</b> Numbers together, <i>x</i>’s together, <i>y</i>’s together." },
        { h: T("c", "18", "hl") + PW("x", v("x"), "xe", "4 + (" + MINUS + "1)", "", "hl2") + PW("y", v("y"), "ye", MINUS + "6 + 4", "", "hl2"), n: "<b>Step 3: combine.</b> 9 · 2 = 18. Product rule: add the exponents." },
        { h: T("c", "18") + PW("x", v("x"), "xe", "3") + PW("y", v("y"), "ye", MINUS + "2", "hl", "hl2"), n: "Almost done, but <i>y</i><sup>−2</sup> still has a negative exponent." },
        { h: F(T("c", "18") + PW("x", v("x"), "xe", "3"), PW("y", v("y"), "ye", "2", "", "hl2")), n: "<b>Step 4: make exponents positive.</b> Move <i>y</i><sup>−2</sup> below the bar as <i>y</i><sup>2</sup>. Final answer: 18<i>x</i><sup>3</sup>/<i>y</i><sup>2</sup>." },
      ];
    })(),
    simp2: [
      { h: F(T("n", "12") + PW("a", v("a"), "ae", "5") + PW("b", v("b"), "be", "2"), T("d", "4") + PW("a2", v("a"), "a2e", "2") + PW("b2", v("b"), "b2e", "6")), n: "A quotient of two monomials. No parentheses to clear." },
      { h: F(T("n", "12"), T("d", "4")) + O("m1", "·") + F(PW("a", v("a"), "ae", "5"), PW("a2", v("a"), "a2e", "2")) + O("m2", "·") + F(PW("b", v("b"), "be", "2"), PW("b2", v("b"), "b2e", "6")), n: "<b>Group like bases:</b> split it into numbers, <i>a</i>’s and <i>b</i>’s." },
      { h: T("n", "3", "hl") + O("m1", "·") + PW("a", v("a"), "ae", "5 " + MINUS + " 2", "", "hl2") + O("m2", "·") + PW("b", v("b"), "be", "2 " + MINUS + " 6", "", "hl2"), n: "<b>Combine:</b> 12 ÷ 4 = 3. Quotient rule: subtract (top minus bottom)." },
      { h: T("n", "3") + PW("a", v("a"), "ae", "3") + PW("b", v("b"), "be", MINUS + "4", "hl", "hl2"), n: "2 − 6 = −4, a negative exponent." },
      { h: F(T("n", "3") + PW("a", v("a"), "ae", "3"), PW("b", v("b"), "be", "4", "", "hl2")), n: "<b>Make it positive:</b> <i>b</i><sup>−4</sup> moves down as <i>b</i><sup>4</sup>. Answer: 3<i>a</i><sup>3</sup>/<i>b</i><sup>4</sup>." },
    ],

    /* ----- radicals ----- */
    area: (() => {
      const tiles = Array.from({ length: 16 }, (_, i) => T("t" + i, "", "tile")).join("");
      return [
        { h: `<span class="tiles row">${tiles}</span>`, n: "16 unit squares, each with area 1. Can we arrange them into one big square?" },
        { h: `<span class="area-wrap"><span class="area-col"><span class="tiles sq">${tiles}</span>${T("s1", "side = 4", "side-lab")}</span></span>`, n: "Yes! A 4 × 4 square. Its area is 16 and its side is 4." },
        { h: `<span class="area-wrap"><span class="area-col"><span class="tiles sq">${tiles}</span>${T("s1", "side = 4", "side-lab")}</span>${R(T("n", "16"))}${O("eq", "=")}${T("r", "4", "hl")}</span>`, n: "So <b>√16 = 4</b>, because 4<sup>2</sup> = 16. Square root = side of the square." },
      ];
    })(),
    ratexp: [
      { h: T("b", "8") + S(T("en", "2", "hl2") + T("sl", "/") + T("ed", "3", "hl")), n: "A fraction exponent. The <b>denominator</b> (3) is the root. The <b>numerator</b> (2) is the power." },
      { h: O("p1", "(") + R(T("b", "8"), T("ed", "3", "hl")) + O("p2", ")") + S(T("en", "2", "hl2")), n: "Denominator 3 becomes a cube root. Numerator 2 becomes a square." },
      { h: O("p1", "(") + T("b", "2", "hl") + O("p2", ")") + S(T("en", "2", "hl2")), n: "Take the root first, so the numbers stay small: ∛8 = 2 because 2<sup>3</sup> = 8." },
      { h: T("b", "4", "hl"), n: "2<sup>2</sup> = 4. So <b>8<sup>2/3</sup> = 4</b>." },
    ],
    psq: [
      { h: R(T("n", "72")), n: "Find the <b>largest perfect square</b> that divides 72. Check from the top: 64? No. 49? No. 36? Yes!" },
      { h: R(T("a", "36", "hl") + O("m", "·") + T("b", "2")), n: "72 = 36 · 2, and 36 is a perfect square." },
      { h: R(T("a", "36", "hl")) + O("m", "·") + R(T("b", "2")), n: "Product property: √(36 · 2) = √36 · √2." },
      { h: T("a", "6", "hl") + R(T("b", "2")), n: "√36 = 6 comes out. <b>√72 = 6√2</b>. Check: 6<sup>2</sup> · 2 = 72 ✓" },
    ],
    notlargest: [
      { h: R(T("n", "72")), n: "Suppose you notice 9 divides 72 first." },
      { h: R(T("a", "9", "hl") + O("m", "·") + T("b", "8")), n: "72 = 9 · 8. 9 is a perfect square." },
      { h: T("a", "3") + R(T("b", "8", "hl")), n: "3√8. But 8 still has a perfect square factor: 4. Not finished!" },
      { h: T("a", "3") + R(T("c", "4", "hl") + O("m2", "·") + T("b", "2")), n: "8 = 4 · 2" },
      { h: T("a", "3") + O("m3", "·") + T("c", "2", "hl") + R(T("b", "2")), n: "√4 = 2 comes out and multiplies the 3." },
      { h: T("a", "6", "hl") + R(T("b", "2")), n: "Same answer, <b>6√2</b>, but more steps. Always check the radicand one more time." },
    ],

    /* ----- operations ----- */
    addlike: [
      { h: T("a", "2", "hl") + R(T("r1", "3")) + O("pl", "+") + T("b", "5", "hl") + R(T("r2", "3")), n: "Same index and same radicand (3), so these are <b>like radicals</b>. Think of √3 as a unit, like 2 apples + 5 apples." },
      { h: O("p1", "(") + T("a", "2") + O("pl", "+") + T("b", "5") + O("p2", ")") + R(T("r1", "3")), n: "Factor out √3 and add the coefficients." },
      { h: T("a", "7", "hl") + R(T("r1", "3")), n: "2 + 5 = 7. <b>7√3</b>. The radicand stays the same: never add the 3’s." },
    ],
    addsimp: [
      { h: R(T("a", "12")) + O("pl", "+") + R(T("b", "27")), n: "Different radicands, so we can't add yet. Simplify each radical first." },
      { h: R(T("a1", "4", "hl") + O("m1", "·") + T("a", "3")) + O("pl", "+") + R(T("b1", "9", "hl") + O("m2", "·") + T("b", "3")), n: "12 = 4 · 3 and 27 = 9 · 3. Look for the perfect squares." },
      { h: T("a1", "2") + R(T("a", "3")) + O("pl", "+") + T("b1", "3") + R(T("b", "3")), n: "√4 = 2 and √9 = 3 come out. Now they are like radicals!" },
      { h: T("s", "5", "hl") + R(T("a", "3")), n: "2√3 + 3√3 = <b>5√3</b>" },
    ],
    mult: [
      { h: R(T("a", "6")) + O("m", "·") + R(T("b", "15")), n: "Same index, so multiply the radicands under one radical." },
      { h: R(T("a", "6") + O("m", "·") + T("b", "15")), n: "√6 · √15 = √(6 · 15)" },
      { h: R(T("a", "2") + O("m1", "·") + T("a2", "3") + O("m2", "·") + T("b", "3") + O("m3", "·") + T("b2", "5")), n: "Don't multiply to 90 yet. Break into primes so the pairs are easy to see." },
      { h: R(T("a2", "3", "hl") + O("m2", "·") + T("b", "3", "hl") + O("m1", "·") + T("a", "2") + O("m3", "·") + T("b2", "5")), n: "A pair of 3’s!" },
      { h: T("a2", "3", "hl") + R(T("a", "2") + O("m3", "·") + T("b2", "5")), n: "The pair comes out as one 3. The 2 and 5 stay inside." },
      { h: T("a2", "3") + R(T("a", "10")), n: "<b>3√10</b>" },
    ],
    div: [
      { h: F(R(T("a", "50")), R(T("b", "2"))), n: "Two square roots, divided." },
      { h: R(F(T("a", "50"), T("b", "2"))), n: "Quotient property: put them under one radical." },
      { h: R(T("a", "25", "hl")), n: "50 ÷ 2 = 25" },
      { h: T("a", "5", "hl"), n: "√25 = 5. <b>√50 ÷ √2 = 5</b>" },
    ],
    rat1: [
      { h: F(T("n", "3"), R(T("d", "2", "hl"))), n: "A radical in the denominator, so it's not in simplest form yet." },
      { h: F(T("n", "3"), R(T("d", "2"))) + O("m", "·") + F(R(T("n2", "2", "hl")), R(T("d2", "2", "hl"))), n: "Multiply by √2/√2. It equals 1, so the value doesn't change." },
      { h: F(T("n", "3") + R(T("n2", "2")), R(T("d", "2")) + O("m2", "·") + R(T("d2", "2"))), n: "Multiply across: top times top, bottom times bottom." },
      { h: F(T("n", "3") + R(T("n2", "2")), T("d", "2", "hl")), n: "√2 · √2 = 2. The denominator is a whole number now. <b>3√2/2</b>" },
    ],
    rat2: [
      { h: F(T("n", "4"), T("a", "3") + O("mi", MINUS) + R(T("r", "5"))), n: "A binomial denominator with a radical." },
      { h: F(T("n", "4"), T("a", "3") + O("mi", MINUS) + R(T("r", "5"))) + O("m", "·") + F(T("a2", "3") + O("pl", "+") + R(T("r2", "5")), T("a3", "3") + O("pl2", "+") + R(T("r3", "5"))), n: "Multiply by the <b>conjugate</b> over itself. The conjugate of 3 − √5 is 3 + √5 (flip the middle sign)." },
      { h: F(T("n", "4") + O("p1", "(") + T("a2", "3") + O("pl", "+") + R(T("r2", "5")) + O("p2", ")"), PW("a", "3", "s1", "2", "", "hl2") + O("mi", MINUS) + O("p3", "(") + R(T("r", "5")) + O("p4", ")") + S(T("s2", "2", "hl2"))), n: "(a − b)(a + b) = a<sup>2</sup> − b<sup>2</sup>. The middle terms cancel out." },
      { h: F(T("n", "4") + O("p1", "(") + T("a2", "3") + O("pl", "+") + R(T("r2", "5")) + O("p2", ")"), T("a", "9") + O("mi", MINUS) + T("r", "5")), n: "3<sup>2</sup> = 9 and (√5)<sup>2</sup> = 5. The radical is gone from the bottom!" },
      { h: F(T("n", "4", "cancel") + O("p1", "(") + T("a2", "3") + O("pl", "+") + R(T("r2", "5")) + O("p2", ")"), T("a", "4", "cancel")), n: "9 − 5 = 4. The 4 on top and the 4 on the bottom cancel." },
      { h: T("a2", "3") + O("pl", "+") + R(T("r2", "5")), n: "<b>4/(3 − √5) = 3 + √5</b>" },
    ],
  };

  /* =========================================================
     Radical breakdown machine: builds steps for any input.
     ========================================================= */
  function factor(n) {
    const out = [];
    let m = n;
    for (let p = 2; p * p <= m; p++) while (m % p === 0) { out.push(p); m /= p; }
    if (m > 1) out.push(m);
    return out;
  }
  const IDX = (k) => (k === 2 ? "" : String(k));
  const RAD_SYMBOL = { 2: "√", 3: "∛", 4: "∜" };
  const powTxt = (l, e) => (e === 0 ? "" : e === 1 ? v(l) : `${v(l)}<sup>${e}</sup>`);

  function radicalSteps(n, k, ex, ey) {
    const idx = IDX(k);
    const items = [];
    let id = 0;
    factor(n).forEach((p) => items.push({ k: "p" + id++, lab: String(p), key: "n" + p, val: p }));
    for (let i = 0; i < ex; i++) items.push({ k: "x" + i, lab: v("x"), key: "x", v: "x" });
    for (let i = 0; i < ey; i++) items.push({ k: "y" + i, lab: v("y"), key: "y", v: "y" });

    const order = [];
    const buckets = {};
    items.forEach((it) => {
      if (!buckets[it.key]) { buckets[it.key] = []; order.push(it.key); }
      buckets[it.key].push(it);
    });
    const groups = [];
    const left = [];
    order.forEach((key) => {
      const L = buckets[key].slice();
      while (L.length >= k) groups.push(L.splice(0, k));
      left.push(...L);
    });

    const chip = (it, cls = "") => T(it.k, it.lab, "chip " + cls);
    const start = T("N", String(n)) + (ex ? PW("X", v("x"), "XE", String(ex)) : "") + (ey ? PW("Y", v("y"), "YE", String(ey)) : "");
    const startTxt = `${RAD_SYMBOL[k]}(${n}${powTxt("x", ex)}${powTxt("y", ey)})`;
    const nm = { 2: "pairs", 3: "groups of 3", 4: "groups of 4" }[k];
    const primes = factor(n);
    const steps = [];

    steps.push({
      h: n === 1 && !ex && !ey ? R(T("N", "1"), idx) : R(n === 1 ? start.replace(T("N", "1"), "") : start, idx),
      n: `Start with <span class="m">${startTxt}</span>. Goal: pull out every factor that comes in <b>${nm}</b>.`,
    });

    const expand = [];
    if (n > 1) expand.push(`${n} = ${primes.length > 1 ? primes.join(" · ") : n + " (prime)"}`);
    if (ex) expand.push(`${powTxt("x", ex)} = ${Array(ex).fill(v("x")).join(" · ")}`);
    if (ey) expand.push(`${powTxt("y", ey)} = ${Array(ey).fill(v("y")).join(" · ")}`);
    steps.push({
      h: R(items.map((it) => chip(it)).join(""), idx),
      n: `<b>Break it down</b> into prime factors: <span class="m">${expand.join(", &nbsp;")}</span>`,
    });

    if (!groups.length) {
      steps.push({
        h: R(items.map((it) => chip(it)).join(""), idx),
        n: `No factor appears ${k} times, so nothing can come out. <b>${startTxt} is already in simplest form.</b>`,
      });
      return { steps, answer: startTxt };
    }

    steps.push({
      h: R(
        groups.map((g, gi) => `<span class="grp g${gi % 6}">${g.map((it) => chip(it, "g" + (gi % 6))).join("")}</span>`).join("") +
          left.map((it) => chip(it)).join(""),
        idx
      ),
      n: `<b>Group</b> identical factors in ${nm} (the index is ${k}). Found ${groups.length} group${groups.length > 1 ? "s" : ""}.`,
    });

    const outChips = groups.map((g, gi) => chip(g[0], "out g" + (gi % 6))).join("");
    steps.push({
      h: outChips + (left.length ? R(left.map((it) => chip(it)).join(""), idx) : ""),
      n: `<b>Pull out:</b> each group leaves the radical as just <b>one</b> factor. ${left.length ? "Leftovers stay inside." : "Nothing is left inside, so the radical disappears!"}`,
    });

    // final multiplication
    const numOut = groups.filter((g) => g[0].val).reduce((a, g) => a * g[0].val, 1);
    const xOut = groups.filter((g) => g[0].v === "x").length;
    const yOut = groups.filter((g) => g[0].v === "y").length;
    const numIn = left.filter((it) => it.val).reduce((a, it) => a * it.val, 1);
    const xIn = left.filter((it) => it.v === "x").length;
    const yIn = left.filter((it) => it.v === "y").length;

    const firstKey = (arr, pred) => (arr.find(pred) || {}).k;
    const gFirst = groups.map((g) => g[0]);
    let outside = "";
    const kNum = firstKey(gFirst, (it) => it.val);
    const kX = firstKey(gFirst, (it) => it.v === "x");
    const kY = firstKey(gFirst, (it) => it.v === "y");
    if (numOut > 1 || (!xOut && !yOut)) outside += T(kNum || "oN", String(numOut), "hl");
    if (xOut) outside += xOut === 1 ? T(kX, v("x"), "hl") : PW(kX, v("x"), "oxe", String(xOut), "hl", "hl2");
    if (yOut) outside += yOut === 1 ? T(kY, v("y"), "hl") : PW(kY, v("y"), "oye", String(yOut), "hl", "hl2");

    let inside = "";
    const hasIn = numIn > 1 || xIn || yIn;
    if (hasIn) {
      if (numIn > 1) inside += T(firstKey(left, (it) => it.val), String(numIn));
      if (xIn) inside += xIn === 1 ? T(firstKey(left, (it) => it.v === "x"), v("x")) : PW(firstKey(left, (it) => it.v === "x"), v("x"), "ixe", String(xIn));
      if (yIn) inside += yIn === 1 ? T(firstKey(left, (it) => it.v === "y"), v("y")) : PW(firstKey(left, (it) => it.v === "y"), v("y"), "iye", String(yIn));
    }
    const outTxt = (numOut > 1 || (!xOut && !yOut) ? String(numOut) : "") + powTxt("x", xOut) + powTxt("y", yOut);
    const inTxt = (numIn > 1 ? String(numIn) : "") + powTxt("x", xIn) + powTxt("y", yIn);
    const inParts = (numIn > 1 ? 1 : 0) + (xIn ? 1 : 0) + (yIn ? 1 : 0);
    const answer = outTxt + (hasIn ? RAD_SYMBOL[k] + (inParts > 1 ? "(" + inTxt + ")" : inTxt) : "");
    steps.push({
      h: outside + (hasIn ? R(inside, idx) : ""),
      n: `<b>Multiply</b> everything outside together and everything inside together. <span class="m">${startTxt} = <b>${answer}</b></span>`,
    });
    return { steps, answer };
  }

  /* =========================================================
     Boot the walkthroughs
     ========================================================= */
  document.querySelectorAll("[data-stepper]").forEach((el) => {
    const steps = STEPS[el.dataset.stepper];
    if (steps) new Stepper(el, steps);
  });

  // hero: loops automatically while visible
  const heroEl = document.getElementById("heroDemo");
  const hero = new Stepper(heroEl, radicalSteps(72, 2, 5, 0).steps, { loop: true, compact: true, delay: 3000 });
  if (!REDUCE && "IntersectionObserver" in window) {
    let userTook = false;
    heroEl.addEventListener("click", (e) => { if (e.target.closest("button") && !e.target.closest('[data-a="play"]')) userTook = true; });
    new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (en.isIntersecting && !hero.timer && !userTook) hero.play();
        else if (!en.isIntersecting && hero.timer) hero.stop();
      });
    }, { threshold: 0.4 }).observe(heroEl);
  }

  // radical anatomy picture
  document.getElementById("radAnat").innerHTML = R("64", "3");

  /* ---------- breakdown machine ---------- */
  const radForm = document.getElementById("radForm");
  const radErr = document.getElementById("radErr");
  const radStepEl = document.getElementById("radStepper");
  function runMachine(play) {
    const k = +document.getElementById("radIdx").value;
    const n = Math.floor(+document.getElementById("radN").value);
    const ex = Math.floor(+document.getElementById("radX").value || 0);
    const ey = Math.floor(+document.getElementById("radY").value || 0);
    let err = "";
    if (!(n >= 1 && n <= 100000)) err = "Use a whole number from 1 to 100000.";
    else if (!(ex >= 0 && ex <= 12 && ey >= 0 && ey <= 12)) err = "Variable powers must be whole numbers from 0 to 12.";
    else if (n === 1 && !ex && !ey) err = "The root of 1 is just 1. Try a bigger number.";
    radErr.hidden = !err;
    radErr.textContent = err;
    if (err) return;
    const { steps } = radicalSteps(n, k, ex, ey);
    const st = new Stepper(radStepEl, steps, { title: "Breakdown machine" });
    if (play && !REDUCE) st.play();
  }
  radForm.addEventListener("submit", (e) => { e.preventDefault(); runMachine(true); });
  document.querySelectorAll("[data-ex]").forEach((b) =>
    b.addEventListener("click", () => {
      const [k, n, x, y] = b.dataset.ex.split(",");
      document.getElementById("radIdx").value = k;
      document.getElementById("radN").value = n;
      document.getElementById("radX").value = x;
      document.getElementById("radY").value = y;
      runMachine(true);
    })
  );
  runMachine(false);

  /* ---------- ladder (prime factorization) ---------- */
  const ladderOut = document.getElementById("ladderOut");
  function expForm(primes) {
    const c = {};
    primes.forEach((p) => (c[p] = (c[p] || 0) + 1));
    return Object.keys(c).map((p) => (c[p] > 1 ? `${p}<sup>${c[p]}</sup>` : p)).join(" · ");
  }
  function runLadder(n) {
    n = Math.floor(n);
    if (!(n >= 2 && n <= 100000)) {
      ladderOut.innerHTML = `<p class="tool-err">Use a whole number from 2 to 100000.</p>`;
      return;
    }
    const rows = [];
    let m = n;
    while (m > 1) {
      let p = 2;
      while (m % p) p++;
      if (p * p > m && m % p) p = m;
      rows.push([p, m]);
      m /= p;
    }
    const primes = rows.map((r) => r[0]);
    const ladder =
      `<div class="ladder" aria-label="Ladder division of ${n}">` +
      rows.map(([p, val], i) => `<div class="lrow" style="--i:${i}"><span class="ldiv">${p}</span><span class="lnum">${val}</span></div>`).join("") +
      `<div class="lrow last" style="--i:${rows.length}"><span class="ldiv"></span><span class="lnum">1</span></div></div>`;
    const res =
      primes.length === 1
        ? `<div class="ladder-res" style="--i:${rows.length + 1}"><span class="lbl">Result</span><span class="m">${n} is prime</span><span>Its only factors are 1 and ${n}.</span></div>`
        : `<div class="ladder-res" style="--i:${rows.length + 1}"><span class="lbl">Product of primes</span><span class="m">${n} = ${primes.join(" · ")}</span><span class="lbl">Exponent form</span><span class="m">${n} = ${expForm(primes)}</span></div>`;
    ladderOut.innerHTML = ladder + res;
  }
  document.getElementById("ladderForm").addEventListener("submit", (e) => {
    e.preventDefault();
    runLadder(+document.getElementById("ladderN").value);
  });
  document.querySelectorAll("[data-n]").forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById("ladderN").value = b.dataset.n;
      runLadder(+b.dataset.n);
    })
  );
  runLadder(360);

  /* ---------- flip cards ---------- */
  const cardsEl = document.getElementById("cards");
  let cardSet = "sq";
  function renderCards() {
    const max = cardSet === "sq" ? 20 : 10;
    const p = cardSet === "sq" ? 2 : 3;
    cardsEl.innerHTML = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      return `<button type="button" class="fc" aria-pressed="false" aria-label="${n} to the power ${p}"><span class="fc-in"><span class="fc-f">${n}<sup>${p}</sup></span><span class="fc-b">${n ** p}</span></span></button>`;
    }).join("");
  }
  cardsEl.addEventListener("click", (e) => {
    const c = e.target.closest(".fc");
    if (!c) return;
    c.classList.toggle("on");
    c.setAttribute("aria-pressed", c.classList.contains("on"));
  });
  document.querySelectorAll("[data-set]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.set === "flipall") {
        const cards = [...cardsEl.children];
        const allOn = cards.every((c) => c.classList.contains("on"));
        cards.forEach((c, i) =>
          setTimeout(() => {
            c.classList.toggle("on", !allOn);
            c.setAttribute("aria-pressed", !allOn);
          }, REDUCE ? 0 : i * 40)
        );
        b.textContent = allOn ? "Reveal all" : "Hide all";
        return;
      }
      cardSet = b.dataset.set;
      document.querySelectorAll("[data-set]").forEach((o) => {
        if (o.dataset.set === "flipall") { o.textContent = "Reveal all"; return; }
        o.classList.toggle("is-on", o === b);
        o.setAttribute("aria-pressed", o === b);
      });
      renderCards();
    })
  );
  renderCards();

  /* =========================================================
     Practice quiz
     ========================================================= */
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const neg = (n) => (n < 0 ? MINUS + Math.abs(n) : String(n));
  const fracHTML = (n, d) => (d === 1 ? neg(n) : `${neg(n)}/${d}`);

  function parseAnswer(s) {
    s = String(s).trim().replace(/\s+/g, "").replace(/[−–—]/g, "-");
    if (!s) return null;
    let m = s.match(/^(-?\d+)\/(-?\d+)$/);
    if (m && +m[2] !== 0) return +m[1] / +m[2];
    if (/^-?\d*\.?\d+$/.test(s)) return +s;
    return NaN;
  }

  const GEN = {
    evalPow() {
      const kind = pick(["pos", "pos", "negbase", "trick", "zero", "negexp"]);
      let b, e, q, val, sol;
      if (kind === "pos") {
        b = rnd(2, 5); e = b === 2 ? rnd(3, 6) : rnd(2, 4);
        q = `${b}<sup>${e}</sup>`; val = [b ** e, 1];
        sol = `${b}<sup>${e}</sup> = ${Array(e).fill(b).join(" · ")} = ${b ** e}`;
      } else if (kind === "negbase") {
        b = rnd(2, 4); e = rnd(2, 4);
        q = `(${MINUS}${b})<sup>${e}</sup>`; val = [(-b) ** e, 1];
        sol = `${Array(e).fill(`(${MINUS}${b})`).join(" · ")} = ${neg((-b) ** e)}. ${e % 2 ? "Odd" : "Even"} power of a negative is ${e % 2 ? "negative" : "positive"}.`;
      } else if (kind === "trick") {
        b = rnd(2, 6);
        q = `${MINUS}${b}<sup>2</sup>`; val = [-(b * b), 1];
        sol = `Only ${b} is squared: ${MINUS}(${b} · ${b}) = ${neg(-(b * b))}`;
      } else if (kind === "zero") {
        b = pick(["7", "(" + MINUS + "4)", "125", "(3x)", "(" + v("ab") + ")"]);
        q = `${b}<sup>0</sup>`; val = [1, 1];
        sol = `Any nonzero base to the zero power is 1.`;
      } else {
        b = rnd(2, 5); e = b === 2 ? rnd(1, 4) : rnd(1, 3);
        q = `${b}<sup>${MINUS}${e}</sup>`; val = [1, b ** e];
        sol = `${b}<sup>${MINUS}${e}</sup> = 1/${b}<sup>${e}</sup> = 1/${b ** e}`;
      }
      return { topic: "exp", label: "Evaluate", q: `Evaluate. Write fractions like 1/8.<span class="big">${q}</span>`, type: "num", ans: val, ansTxt: fracHTML(val[0], val[1]), sol };
    },
    ruleMC() {
      const kind = pick(["prod", "quot", "pp", "neg", "zero", "prodcoef"]);
      const a = rnd(2, 7), b = rnd(2, 5);
      const P = (e) => `${v("x")}<sup>${e}</sup>`;
      let q, right, wrong, sol;
      if (kind === "prod") { q = `${P(a)} · ${P(b)}`; right = P(a + b); wrong = [P(a * b), `2${P(a + b)}`, P(Math.abs(a - b) || a + b + 1)]; sol = `Same base, multiplying: add exponents. ${a} + ${b} = ${a + b}`; }
      else if (kind === "quot") { const t = a + b; q = `${P(t)} ÷ ${P(b)}`; right = P(a); wrong = [P(t + b), P(t * b), Number.isInteger(t / b) && t / b !== a ? P(t / b) : P(a + 1)]; sol = `Same base, dividing: subtract exponents. ${t} − ${b} = ${a}`; }
      else if (kind === "pp") { q = `(${P(a)})<sup>${b}</sup>`; right = P(a * b); wrong = [P(a + b), P(a ** b > 99 ? a * b + 1 : a ** b), `${b}${P(a)}`]; sol = `Power of a power: multiply exponents. ${a} · ${b} = ${a * b}`; }
      else if (kind === "neg") { q = `${P(MINUS + a)}`; right = `1/${P(a)}`; wrong = [`${MINUS}${P(a)}`, `${MINUS}1/${P(a)}`, P(a)]; sol = `A negative exponent means reciprocal: ${P(MINUS + a)} = 1/${P(a)}`; }
      else if (kind === "zero") { q = `(${a}${v("x")}${v("y")}<sup>${b}</sup>)<sup>0</sup>`; right = "1"; wrong = ["0", String(a), `${a}${v("xy")}`]; sol = `Everything inside the parentheses is raised to 0, so the answer is 1.`; }
      else { q = `(${b}${P(a)})<sup>2</sup>`; right = `${b * b}${P(2 * a)}`; wrong = [`${b}${P(2 * a)}`, `${2 * b}${P(2 * a)}`, `${b * b}${P(a + 2)}`]; sol = `Square every factor: ${b}<sup>2</sup> = ${b * b}, and (${P(a)})<sup>2</sup> = ${P(2 * a)}.`; }
      const uniq = [...new Set(wrong.filter((w) => w !== right))].slice(0, 3);
      const opts = shuffle([right, ...uniq]);
      return { topic: "exp", label: "Laws of exponents", q: `Simplify.<span class="big">${q}</span>`, type: "mc", opts, ans: opts.indexOf(right), ansTxt: right, sol };
    },
    simpExp() {
      const c = rnd(2, 4), a = rnd(2, 4), b = rnd(1, 3), n = 2;
      // (c x^a y^-b)^2 -> c^2 x^2a / y^2b
      const right = `${c * c}${v("x")}<sup>${2 * a}</sup>/${v("y")}<sup>${2 * b}</sup>`;
      const wrong = [`${c}${v("x")}<sup>${2 * a}</sup>/${v("y")}<sup>${2 * b}</sup>`, `${c * c}${v("x")}<sup>${a + 2}</sup>/${v("y")}<sup>${b + 2}</sup>`, `${c * c}${v("x")}<sup>${2 * a}</sup>${v("y")}<sup>${2 * b}</sup>`];
      const opts = shuffle([right, ...wrong]);
      return { topic: "exp", label: "Simplify (several laws)", q: `Simplify. Use positive exponents only.<span class="big">(${c}${v("x")}<sup>${a}</sup>${v("y")}<sup>${MINUS}${b}</sup>)<sup>${n}</sup></span>`, type: "mc", opts, ans: opts.indexOf(right), ansTxt: right, sol: `Square each factor: ${c}<sup>2</sup> = ${c * c}, (${v("x")}<sup>${a}</sup>)<sup>2</sup> = ${v("x")}<sup>${2 * a}</sup>, (${v("y")}<sup>${MINUS}${b}</sup>)<sup>2</sup> = ${v("y")}<sup>${MINUS}${2 * b}</sup>. Then move ${v("y")}<sup>${MINUS}${2 * b}</sup> to the denominator.` };
    },
    sqrt() {
      const a = rnd(2, 7), b = pick([2, 3, 5, 6, 7, 10, 11]), n = a * a * b;
      return { topic: "rad", label: "Simplify the radical", q: `Write in simplest form.<span class="big">√${n}</span>`, type: "rad", sym: "√", ans: [a, b], ansTxt: `${a}√${b}`, sol: `Largest perfect square factor of ${n} is ${a * a}: √${n} = √(${a * a} · ${b}) = ${a}√${b}` };
    },
    cbrt() {
      const a = rnd(2, 4), b = pick([2, 3, 4, 5, 6, 7, 9, 10]), n = a ** 3 * b;
      return { topic: "rad", label: "Simplify the radical", q: `Write in simplest form.<span class="big">∛${n}</span>`, type: "rad", sym: "∛", ans: [a, b], ansTxt: `${a}∛${b}`, sol: `Largest perfect cube factor of ${n} is ${a ** 3}: ∛${n} = ∛(${a ** 3} · ${b}) = ${a}∛${b}` };
    },
    ratExp() {
      const [b, m, nn, val] = pick([[4, 1, 2, 2], [9, 3, 2, 27], [8, 2, 3, 4], [27, 2, 3, 9], [16, 3, 4, 8], [32, 2, 5, 4], [125, 1, 3, 5], [64, 2, 3, 16], [81, 3, 4, 27], [25, 3, 2, 125], [4, 5, 2, 32]]);
      const root = Math.round(b ** (1 / nn));
      const sym = nn === 2 ? "√" : nn === 3 ? "∛" : nn === 4 ? "∜" : `<sup class="idx">${nn}</sup>√`;
      return { topic: "rad", label: "Rational exponents", q: `Evaluate.<span class="big">${b}<sup>${m}/${nn}</sup></span>`, type: "num", ans: [val, 1], ansTxt: String(val), sol: `Denominator ${nn} = root, numerator ${m} = power: (${sym}${b})<sup>${m}</sup> = ${root}<sup>${m}</sup> = ${val}` };
    },
    addRad() {
      const b = pick([2, 3, 5]);
      const p = rnd(1, 4);
      let q = rnd(2, 5); if (q === p) q++;
      const r1 = p * p * b, r2 = q * q * b;
      const s1 = p === 1 ? `√${b}` : `${p}√${b}`;
      return { topic: "rad", label: "Add radicals", q: `Simplify.<span class="big">√${r1} + √${r2}</span>`, type: "rad", sym: "√", ans: [p + q, b], ansTxt: `${p + q}√${b}`, sol: `Simplify each first: √${r1} = ${s1} and √${r2} = ${q}√${b}. Like radicals: ${p} + ${q} = ${p + q}, so ${p + q}√${b}.` };
    },
    multRad() {
      const pairs = [[6, 15, 3, 10], [2, 8, 4, 1], [3, 12, 6, 1], [6, 10, 2, 15], [5, 10, 5, 2], [2, 14, 2, 7], [3, 15, 3, 5], [10, 15, 5, 6]];
      const [a, b, c, d] = pick(pairs);
      const product = a * b;
      return d === 1
        ? { topic: "rad", label: "Multiply radicals", q: `Simplify.<span class="big">√${a} · √${b}</span>`, type: "num", ans: [c, 1], ansTxt: String(c), sol: `√${a} · √${b} = √${product} = ${c}` }
        : { topic: "rad", label: "Multiply radicals", q: `Simplify.<span class="big">√${a} · √${b}</span>`, type: "rad", sym: "√", ans: [c, d], ansTxt: `${c}√${d}`, sol: `√${a} · √${b} = √${product} = √(${c * c} · ${d}) = ${c}√${d}` };
    },
    rationalize() {
      const [a, b] = pick([[1, 2], [3, 2], [1, 3], [2, 3], [1, 5], [2, 5], [3, 5], [1, 7], [3, 7], [5, 3]]);
      const A = a === 1 ? "" : a;
      const right = `${A}√${b}/${b}`;
      const opts = shuffle([right, `${a}/${b}`, `√${a * b}`, `${A || 1}√${b}`]);
      return { topic: "rad", label: "Rationalize the denominator", q: `Rationalize the denominator.<span class="big">${a}/√${b}</span>`, type: "mc", opts, ans: opts.indexOf(right), ansTxt: right, sol: `Multiply by √${b}/√${b}: (${a} · √${b}) / (√${b} · √${b}) = ${right}` };
    },
  };
  const TOPIC_GENS = {
    exp: ["evalPow", "evalPow", "ruleMC", "ruleMC", "ruleMC", "simpExp", "evalPow", "ruleMC", "simpExp", "evalPow"],
    rad: ["sqrt", "sqrt", "cbrt", "ratExp", "addRad", "multRad", "rationalize", "sqrt", "ratExp", "addRad"],
    all: ["evalPow", "ruleMC", "simpExp", "sqrt", "cbrt", "ratExp", "addRad", "multRad", "rationalize", "ruleMC"],
  };

  const qz = {
    topic: "all", list: [], i: 0, score: 0, answered: false,
    el: {
      prog: document.getElementById("qzProg"), score: document.getElementById("qzScore"), bar: document.getElementById("qzBarFill"),
      kind: document.getElementById("qzKind"), q: document.getElementById("qzQ"), form: document.getElementById("qzForm"), fb: document.getElementById("qzFb"),
    },
  };
  function newRound() {
    qz.list = shuffle(TOPIC_GENS[qz.topic]).map((g) => GEN[g]());
    qz.i = 0; qz.score = 0;
    showQ();
  }
  function showQ() {
    const Q = qz.list[qz.i];
    qz.answered = false;
    qz.el.prog.textContent = `Question ${qz.i + 1} of ${qz.list.length}`;
    qz.el.score.textContent = `Score: ${qz.score}`;
    qz.el.bar.style.width = `${(qz.i / qz.list.length) * 100}%`;
    qz.el.kind.textContent = Q.label;
    qz.el.q.innerHTML = Q.q;
    qz.el.fb.innerHTML = "";
    if (Q.type === "mc") {
      qz.el.form.innerHTML = Q.opts.map((o, j) => `<button type="button" class="opt" data-o="${j}">${o}</button>`).join("");
    } else if (Q.type === "rad") {
      qz.el.form.innerHTML = `<span class="rad-ans"><input id="qzA" type="number" inputmode="numeric" aria-label="Number outside the radical"><span>${Q.sym}</span><input id="qzB" type="number" inputmode="numeric" aria-label="Number inside the radical"></span><button type="submit" class="btn">Check</button>`;
    } else {
      qz.el.form.innerHTML = `<input id="qzA" type="text" inputmode="text" aria-label="Your answer" placeholder="Your answer"><button type="submit" class="btn">Check</button>`;
    }
    const first = qz.el.form.querySelector("input");
    if (first && qz.i > 0) first.focus({ preventScroll: true });
  }
  function grade(ok, Q) {
    qz.answered = true;
    if (ok) qz.score++;
    qz.el.score.textContent = `Score: ${qz.score}`;
    qz.el.form.querySelectorAll("input,button").forEach((x) => (x.disabled = true));
    const last = qz.i === qz.list.length - 1;
    qz.el.fb.innerHTML = `<div class="res ${ok ? "ok" : "no"}"><b class="t">${ok ? "✓ Correct!" : "✗ Not quite."}</b>${ok ? "" : `<span>Answer: <span class="sol">${Q.ansTxt}</span></span>`}<span class="sol">${Q.sol}</span><div class="actions"><button type="button" class="btn" id="qzNext">${last ? "See my score" : "Next question →"}</button></div></div>`;
    document.getElementById("qzNext").focus({ preventScroll: true });
  }
  qz.el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (qz.answered) return;
    const Q = qz.list[qz.i];
    if (Q.type === "rad") {
      const a = +document.getElementById("qzA").value, b = +document.getElementById("qzB").value;
      if (!document.getElementById("qzA").value || !document.getElementById("qzB").value) return showHint("Fill in both boxes: the number outside and the number inside.");
      grade(a === Q.ans[0] && b === Q.ans[1], Q);
    } else {
      const val = parseAnswer(document.getElementById("qzA").value);
      if (val === null) return showHint("Type an answer first.");
      if (Number.isNaN(val)) return showHint("Use a whole number, a decimal, or a fraction like 1/8.");
      grade(Math.abs(val - Q.ans[0] / Q.ans[1]) < 1e-9, Q);
    }
  });
  function showHint(t) { qz.el.fb.innerHTML = `<div class="res no"><span>${t}</span></div>`; }
  qz.el.form.addEventListener("click", (e) => {
    const b = e.target.closest(".opt");
    if (!b || qz.answered) return;
    const Q = qz.list[qz.i];
    const j = +b.dataset.o;
    qz.el.form.querySelectorAll(".opt").forEach((o, k) => { if (k === Q.ans) o.classList.add("right"); });
    if (j !== Q.ans) b.classList.add("wrong");
    grade(j === Q.ans, Q);
  });
  qz.el.fb.addEventListener("click", (e) => {
    if (e.target.id === "qzNext") {
      if (qz.i < qz.list.length - 1) { qz.i++; showQ(); }
      else endRound();
    } else if (e.target.id === "qzAgain") newRound();
  });
  function endRound() {
    qz.el.bar.style.width = "100%";
    qz.el.kind.textContent = "Round complete";
    const pct = qz.score / qz.list.length;
    const msg = pct === 1 ? "Perfect! You're ready." : pct >= 0.7 ? "Good work. Review the ones you missed and try another round." : "Keep going. Re-watch the walkthroughs for the topics you missed, then try again.";
    qz.el.q.innerHTML = `<div class="qz-end"><span class="score">${qz.score}/${qz.list.length}</span><span>${msg}</span></div>`;
    qz.el.form.innerHTML = "";
    qz.el.fb.innerHTML = `<div class="actions"><button type="button" class="btn" id="qzAgain">New round</button></div>`;
  }
  document.querySelectorAll("[data-topic]").forEach((b) =>
    b.addEventListener("click", () => {
      qz.topic = b.dataset.topic;
      document.querySelectorAll("[data-topic]").forEach((o) => { o.classList.toggle("is-on", o === b); o.setAttribute("aria-pressed", o === b); });
      newRound();
    })
  );
  newRound();

  /* =========================================================
     Navigation: active lesson + "I understand" progress
     ========================================================= */
  const links = [...document.querySelectorAll(".toc a")];
  const linkFor = (id) => links.find((a) => a.dataset.sec === id);
  links.forEach((a) =>
    a.addEventListener("click", (e) => {
      const t = document.getElementById(a.dataset.sec);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "start" });
      try { history.replaceState(null, "", "#" + a.dataset.sec); } catch (_) {}
    })
  );
  if ("IntersectionObserver" in window) {
    const vis = new Map();
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => vis.set(en.target.id, en.isIntersecting ? en.intersectionRatio : 0));
      let best = "start";
      document.querySelectorAll("[data-section]").forEach((s) => {
        if (s.getBoundingClientRect().top < window.innerHeight * 0.35) best = s.id;
      });
      links.forEach((a) => a.classList.toggle("is-active", a.dataset.sec === best));
      const act = linkFor(best);
      if (act && window.innerWidth <= 960) act.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    }, { threshold: [0, 0.1, 0.5, 1], rootMargin: "-80px 0px -40% 0px" });
    document.querySelectorAll("[data-section]").forEach((s) => io.observe(s));
  }

  const KEY = "radexp-done-v1";
  let done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (_) { done = {}; }
  function paintDone() {
    let c = 0;
    document.querySelectorAll("[data-done]").forEach((cb) => {
      const id = cb.dataset.done;
      cb.checked = !!done[id];
      if (done[id]) c++;
      const a = linkFor(id);
      if (a) a.classList.toggle("is-done", !!done[id]);
    });
    document.getElementById("doneCount").textContent = c;
  }
  document.querySelectorAll("[data-done]").forEach((cb) =>
    cb.addEventListener("change", () => {
      done[cb.dataset.done] = cb.checked;
      try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (_) {}
      paintDone();
    })
  );
  paintDone();
})();
