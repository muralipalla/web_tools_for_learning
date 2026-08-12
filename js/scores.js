(() => {
  "use strict";
  const client = window.supabaseClient;
  const store = window.ProgressStore;
  const status = document.getElementById("scoresStatus");
  const signIn = document.getElementById("scoresSignIn");
  const table = document.getElementById("scoresTableWrap");
  const body = document.getElementById("scoresBody");
  const refresh = document.getElementById("refreshScoresButton");
  const labels = {
    "general-chemistry-v1": "Custom Chemistry Quiz", "ionic-formula-v1": "Ionic Formula Quiz",
    "multiplication-practice-v1": "Multiplication Practice", "oxidation-numbers-v1": "Oxidation Numbers",
    "trig-angles-v1": "Trigonometric Angles", "units-and-dimensions-v1": "Units and Dimensions",
    "vocabulary-daily-v1": "Daily Vocabulary", "gre-vocabulary-v1": "Advanced Vocabulary"
  };

  function cell(text, className = "") {
    const element = document.createElement("td");
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  async function load() {
    const { data } = await client.auth.getSession();
    if (!data.session?.user) {
      status.hidden = true; signIn.hidden = false; table.hidden = true; refresh.hidden = true; return;
    }
    status.hidden = false; status.textContent = "Loading your scores…"; signIn.hidden = true; refresh.hidden = false;
    try {
      const attempts = await store.listAttempts({ limit: 100 });
      body.replaceChildren(...attempts.map(attempt => {
        const row = document.createElement("tr");
        const percent = Math.round((attempt.score / attempt.total) * 100);
        row.append(cell(labels[attempt.quiz_id] || attempt.quiz_id), cell(`${attempt.score}/${attempt.total}`, "score-value"), cell(`${percent}%`), cell(new Date(attempt.completed_at).toLocaleString()));
        return row;
      }));
      table.hidden = attempts.length === 0;
      status.hidden = attempts.length > 0;
      status.textContent = attempts.length ? "" : "No saved scores yet. Complete a quiz while signed in to see it here.";
    } catch (error) {
      table.hidden = true; status.hidden = false; status.textContent = error?.message || "Could not load your scores.";
    }
  }

  if (!client || !store) { status.textContent = "Account services are not configured."; return; }
  refresh.addEventListener("click", load);
  client.auth.onAuthStateChange(() => { void load(); });
  void load();
})();
