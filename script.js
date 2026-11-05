// Same-origin when served by FastAPI. If the UI is hosted elsewhere, set your API URL here.
const API_BASE = "";

const form = document.getElementById("form");
const btn = document.getElementById("submit");
const errBox = document.getElementById("error");
const result = document.getElementById("result");
const el = (id) => document.getElementById(id);

const NUMERIC = ["person_age","person_income","person_emp_length","loan_amnt","loan_int_rate","cb_person_cred_hist_length"];

function pctOfIncome() {
  const inc = parseFloat(form.person_income.value);
  const amt = parseFloat(form.loan_amnt.value);
  return inc > 0 && amt >= 0 ? amt / inc : null;
}
function refreshPct() {
  const p = pctOfIncome();
  el("pct").textContent = p === null ? "–" : (p * 100).toFixed(1).replace(/\.0$/, "") + "%";
}
["person_income", "loan_amnt"].forEach((n) => form[n].addEventListener("input", refreshPct));
refreshPct();

function setDial(prob, threshold) {
  // Dial spans -90° (0%) to +90° (100%)
  const deg = (p) => -90 + Math.min(Math.max(p, 0), 1) * 180;
  el("thr").style.transform = `rotate(${deg(threshold)}deg)`;
  el("needle").style.transform = `rotate(${deg(prob)}deg)`;
  el("fill").style.strokeDashoffset = 100 - Math.min(Math.max(prob, 0), 1) * 100;
}

function countUp(target, ms = 1400) {
  const out = el("prob");
  const start = performance.now();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { out.textContent = target.toFixed(1); return; }
  (function tick(now) {
    const t = Math.min((now - start) / ms, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    out.textContent = (target * eased).toFixed(1);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

function validate() {
  let ok = true;
  [...NUMERIC].forEach((n) => {
    const f = form[n];
    const bad = f.value === "" || Number.isNaN(Number(f.value)) || Number(f.value) < Number(f.min || -Infinity);
    f.classList.toggle("bad", bad);
    if (bad) ok = false;
  });
  if (pctOfIncome() === null) ok = false;
  return ok;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.hidden = true;
  if (!validate()) {
    errBox.textContent = "Check the highlighted fields. Income must be above zero and no number can be negative.";
    errBox.hidden = false;
    return;
  }

  const fd = new FormData(form);
  const payload = {
    person_age: parseInt(fd.get("person_age"), 10),
    person_income: parseFloat(fd.get("person_income")),
    person_home_ownership: fd.get("person_home_ownership"),
    person_emp_length: parseFloat(fd.get("person_emp_length")),
    loan_intent: fd.get("loan_intent"),
    loan_grade: fd.get("loan_grade"),
    loan_amnt: parseFloat(fd.get("loan_amnt")),
    loan_int_rate: parseFloat(fd.get("loan_int_rate")),
    loan_percent_income: Number(pctOfIncome().toFixed(4)),
    cb_person_default_on_file: fd.get("cb_person_default_on_file"),
    cb_person_cred_hist_length: parseInt(fd.get("cb_person_cred_hist_length"), 10),
  };

  btn.disabled = true;
  btn.classList.add("loading");
  btn.querySelector(".label").textContent = "Assessing";

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`The server returned ${res.status}. Check the values and try again.`);
    const d = await res.json();
    show(d);
  } catch (err) {
    errBox.textContent = err.message.includes("Failed to fetch")
      ? "Can't reach the server. If it was idle, give it 30 seconds to wake up and try again."
      : err.message;
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.querySelector(".label").textContent = "Assess risk";
  }
});

function show(d) {
  const prob = d.default_probability, thr = d.threshold;
  const high = d.default_prediction === 1;

  // Reset the needle first so the sweep replays on every run
  el("needle").style.transition = "none";
  el("needle").style.transform = "rotate(-90deg)";
  el("fill").style.transition = "none";
  el("fill").style.strokeDashoffset = 100;
  void el("needle").getBoundingClientRect();
  el("needle").style.transition = "";
  el("fill").style.transition = "";

  result.dataset.state = high ? "high" : "low";
  setDial(prob, thr);
  countUp(prob * 100);

  el("verdict").textContent = d.Result;
  el("note").textContent = high
    ? "The estimated chance of default is above the cut-off, so this application is flagged."
    : "The estimated chance of default is below the cut-off, so this application looks safe to approve.";

  const gap = (prob - thr) * 100;
  el("f-prob").textContent = (prob * 100).toFixed(1) + "%";
  el("f-thr").textContent = (thr * 100).toFixed(1) + "%";
  el("f-gap").textContent = (gap > 0 ? "+" : "") + gap.toFixed(1) + " pts";
  el("facts").hidden = false;

  if (matchMedia("(max-width:860px)").matches) result.scrollIntoView({ behavior: "smooth", block: "start" });
}
