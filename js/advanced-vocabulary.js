(() => {
  "use strict";

  const STORAGE_KEY = "gre_vocabulary_trainer_v1";
  const RESET_CHANNEL = "gre_vocabulary_trainer_reset_v1";
  const ACTIVITY_ID = "gre-vocabulary-v1";
  const MASTER_LEVEL = 3;
  const DAILY_GOAL = 20;
  const DIFFICULTY_LABELS = { 1: "Challenging", 2: "Demanding", 3: "Elite" };
  const BANK = Array.isArray(window.PALLADIUM_ADVANCED_VOCABULARY)
    ? window.PALLADIUM_ADVANCED_VOCABULARY
    : [];

  const elements = {
    heroWordCount: document.getElementById("heroWordCount"),
    tabs: Array.from(document.querySelectorAll(".trainer-tab")),
    screens: Array.from(document.querySelectorAll(".trainer-screen")),
    setupPanel: document.getElementById("setupPanel"),
    questionPanel: document.getElementById("questionPanel"),
    resultPanel: document.getElementById("resultPanel"),
    modeCards: Array.from(document.querySelectorAll(".mode-card")),
    sessionLength: document.getElementById("sessionLength"),
    difficultyFilter: document.getElementById("difficultyFilter"),
    startSessionButton: document.getElementById("startSessionButton"),
    reviewSessionButton: document.getElementById("reviewSessionButton"),
    reviewButtonCount: document.getElementById("reviewButtonCount"),
    continueOfflineButton: document.getElementById("continueOfflineButton"),
    setupMessage: document.getElementById("setupMessage"),
    questionType: document.getElementById("questionType"),
    questionDifficulty: document.getElementById("questionDifficulty"),
    endSessionButton: document.getElementById("endSessionButton"),
    questionCounter: document.getElementById("questionCounter"),
    liveScore: document.getElementById("liveScore"),
    comboCount: document.getElementById("comboCount"),
    questionProgressBar: document.getElementById("questionProgressBar"),
    questionProgress: document.getElementById("questionProgress"),
    questionContent: document.getElementById("questionContent"),
    answerOptions: document.getElementById("answerOptions"),
    answerFeedback: document.getElementById("answerFeedback"),
    hintButton: document.getElementById("hintButton"),
    nextQuestionButton: document.getElementById("nextQuestionButton"),
    resultEmblem: document.getElementById("resultEmblem"),
    resultHeadline: document.getElementById("resultHeadline"),
    resultSummary: document.getElementById("resultSummary"),
    resultScore: document.getElementById("resultScore"),
    resultAccuracy: document.getElementById("resultAccuracy"),
    resultXp: document.getElementById("resultXp"),
    resultReview: document.getElementById("resultReview"),
    practiceAgainButton: document.getElementById("practiceAgainButton"),
    reviewMistakesButton: document.getElementById("reviewMistakesButton"),
    bankResultCount: document.getElementById("bankResultCount"),
    bankSearch: document.getElementById("bankSearch"),
    bankDifficulty: document.getElementById("bankDifficulty"),
    bankMastery: document.getElementById("bankMastery"),
    wordBankGrid: document.getElementById("wordBankGrid"),
    loadMoreWordsButton: document.getElementById("loadMoreWordsButton"),
    progressMastered: document.getElementById("progressMastered"),
    progressReview: document.getElementById("progressReview"),
    progressAccuracy: document.getElementById("progressAccuracy"),
    progressSessions: document.getElementById("progressSessions"),
    startPriorityReviewButton: document.getElementById("startPriorityReviewButton"),
    priorityWords: document.getElementById("priorityWords"),
    sessionHistory: document.getElementById("sessionHistory"),
    resetProgressButton: document.getElementById("resetProgressButton"),
    rankName: document.getElementById("rankName"),
    levelNumber: document.getElementById("levelNumber"),
    totalXp: document.getElementById("totalXp"),
    sidebarStreak: document.getElementById("sidebarStreak"),
    sidebarAccuracy: document.getElementById("sidebarAccuracy"),
    sidebarMastered: document.getElementById("sidebarMastered"),
    sidebarReview: document.getElementById("sidebarReview"),
    dailyGoalText: document.getElementById("dailyGoalText"),
    dailyGoalBar: document.getElementById("dailyGoalBar"),
    dailyGoalTrack: document.getElementById("dailyGoalTrack"),
    celebrationLayer: document.getElementById("celebrationLayer")
  };

  let selectedMode = "mixed";
  let state = createEmptyState();
  let activeOwnerId;
  let activeStorageKey = STORAGE_KEY;
  let storageActivationVersion = 0;
  let cloudSaveTimer = null;
  let cloudSavePromise = Promise.resolve();
  let attemptSyncPromise = Promise.resolve();
  let syncGeneration = 0;
  let offlineGuestMode = false;
  let cloudSyncEnabled = false;
  let pendingOfflineOwnerId = null;
  let resetInProgress = false;
  const resetChannel = typeof window.BroadcastChannel === "function"
    ? new window.BroadcastChannel(RESET_CHANNEL)
    : null;
  let bankVisibleCount = 40;
  let session = null;
  let storageReady = false;
  let bankValid = BANK.length === 300;

  function createEmptyState() {
    return {
      version: 1,
      ownerId: null,
      progress: {},
      logs: [],
      totalAnswered: 0,
      totalCorrect: 0,
      totalXp: 0,
      streak: 0,
      lastPracticeDate: null,
      daily: { date: localDateKey(), answered: 0 },
      localUpdatedAt: null
    };
  }

  function mergePendingLogs(baseState, localState) {
    const pending = (localState.logs || []).filter(log => !log.cloudSaved && Number(log.total) > 0);
    if (!pending.length) return baseState;
    const logs = [...(baseState.logs || [])];
    const known = new Set(logs.map(log => log.clientAttemptId).filter(Boolean));
    pending.forEach(log => {
      if (!known.has(log.clientAttemptId)) logs.push(log);
    });
    logs.sort((left, right) => Date.parse(right.completedAt || "") - Date.parse(left.completedAt || ""));
    return { ...baseState, logs: logs.slice(0, 100) };
  }

  function normaliseState(value) {
    const empty = createEmptyState();
    if (!value || typeof value !== "object" || Array.isArray(value)) return empty;

    return {
      ...empty,
      ...value,
      progress: value.progress && typeof value.progress === "object" && !Array.isArray(value.progress)
        ? value.progress
        : {},
      logs: Array.isArray(value.logs) ? value.logs.slice(0, 100) : [],
      daily: value.daily && typeof value.daily === "object"
        ? { date: value.daily.date || localDateKey(), answered: Number(value.daily.answered) || 0 }
        : empty.daily
    };
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function readLocalState(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return normaliseState(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.warn("Advanced vocabulary progress could not be read.", error);
      return createEmptyState();
    }
  }

  function hasMeaningfulState(value) {
    return Boolean(
      value && (
        Object.keys(value.progress || {}).length ||
        (Array.isArray(value.logs) && value.logs.length) ||
        value.totalAnswered ||
        value.totalXp
      )
    );
  }

  function ensureDailyState() {
    const today = localDateKey();
    if (state.daily?.date !== today) state.daily = { date: today, answered: 0 };
  }

  function saveState({ sync = true } = {}) {
    ensureDailyState();
    state.localUpdatedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(activeStorageKey, JSON.stringify(state));
    } catch (error) {
      console.warn("Advanced vocabulary progress could not be saved locally.", error);
    }

    if (!sync || !cloudSyncEnabled || !activeOwnerId || !window.ProgressStore) return;
    window.clearTimeout(cloudSaveTimer);
    const stateSnapshot = JSON.parse(JSON.stringify(state));
    const expectedOwnerId = activeOwnerId;
    const expectedGeneration = syncGeneration;
    cloudSaveTimer = window.setTimeout(() => {
      cloudSavePromise = cloudSavePromise
        .then(() => {
          if (
            expectedGeneration !== syncGeneration ||
            activeOwnerId !== expectedOwnerId ||
            window.ProgressStore?.currentOwnerId() !== expectedOwnerId
          ) return null;
          return window.ProgressStore.saveActivityState(ACTIVITY_ID, stateSnapshot, expectedOwnerId);
        })
        .catch(error => console.warn("Advanced vocabulary progress could not be synced.", error));
    }, 700);
  }

  function readWordProgress(word) {
    const progress = state.progress[word.id];
    if (!progress || typeof progress !== "object") {
      return { seen: 0, correct: 0, wrong: 0, mastery: 0, due: false, lastSeen: null };
    }
    return {
      seen: Number(progress.seen) || 0,
      correct: Number(progress.correct) || 0,
      wrong: Number(progress.wrong) || 0,
      mastery: Math.min(MASTER_LEVEL, Math.max(0, Number(progress.mastery) || 0)),
      due: Boolean(progress.due),
      lastSeen: progress.lastSeen || null
    };
  }

  function touchWordProgress(word) {
    state.progress[word.id] ||= readWordProgress(word);
    return state.progress[word.id];
  }

  function isMastered(word) {
    return readWordProgress(word).mastery >= MASTER_LEVEL;
  }

  function needsReview(word) {
    const progress = readWordProgress(word);
    return progress.due || (progress.wrong > 0 && progress.mastery < MASTER_LEVEL);
  }

  function difficultyWords(value = elements.difficultyFilter.value) {
    return value === "all" ? BANK : BANK.filter(word => String(word.difficulty) === String(value));
  }

  function updateModeSelection(mode) {
    selectedMode = ["mixed", "meaning", "context", "synonym"].includes(mode) ? mode : "mixed";
    const labels = {
      mixed: "Start mixed challenge",
      meaning: "Start meaning match",
      context: "Start context lab",
      synonym: "Start word relations"
    };
    elements.startSessionButton.firstChild.textContent = `${labels[selectedMode]} `;

    elements.modeCards.forEach(card => {
      const selected = card.dataset.mode === selectedMode;
      card.classList.toggle("selected", selected);
      card.setAttribute("aria-checked", String(selected));
      card.tabIndex = selected ? 0 : -1;
    });
  }

  function setPracticeReady(ready) {
    storageReady = ready;
    elements.startSessionButton.disabled = !ready || !bankValid;
    const reviewCount = BANK.filter(needsReview).length;
    elements.reviewSessionButton.disabled = !ready || !bankValid || reviewCount === 0;
    elements.modeCards.forEach(card => { card.disabled = !ready; });
    elements.sessionLength.disabled = !ready;
    elements.difficultyFilter.disabled = !ready;
    elements.startPriorityReviewButton.disabled = !ready || !bankValid || reviewCount === 0;
    elements.resetProgressButton.disabled = !ready || Boolean(activeOwnerId && !cloudSyncEnabled);
  }

  function weightedSessionWords(pool, count, reviewOnly = false, suppliedWords = null) {
    if (Array.isArray(suppliedWords) && suppliedWords.length) {
      return shuffle([...new Map(suppliedWords.map(word => [word.id, word])).values()]).slice(0, count);
    }

    const candidates = reviewOnly ? pool.filter(needsReview) : pool;
    return candidates
      .map(word => {
        const progress = readWordProgress(word);
        const priority = progress.due
          ? 160 + progress.wrong * 12
          : progress.seen === 0
            ? 75
            : progress.mastery < MASTER_LEVEL
              ? 95 - progress.mastery * 14 + progress.wrong * 5
              : 12;
        return { word, key: Math.random() ** (1 / Math.max(1, priority)) };
      })
      .sort((a, b) => b.key - a.key)
      .slice(0, count)
      .map(item => item.word);
  }

  function distractorValues(target, selector, exclusions = []) {
    const forbidden = new Set([selector(target), ...exclusions].filter(Boolean).map(value => String(value).toLowerCase()));
    const sameNeighbourhood = BANK.filter(candidate => (
      candidate.id !== target.id &&
      (!target.confusableGroup || candidate.confusableGroup !== target.confusableGroup) &&
      candidate.partOfSpeech === target.partOfSpeech &&
      Math.abs(Number(candidate.difficulty) - Number(target.difficulty)) <= 1
    ));
    const fallbacks = BANK.filter(candidate => (
      candidate.id !== target.id &&
      (!target.confusableGroup || candidate.confusableGroup !== target.confusableGroup)
    ));
    const options = [];

    for (const candidate of shuffle([...sameNeighbourhood, ...fallbacks])) {
      const value = selector(candidate);
      const normalised = String(value || "").trim().toLowerCase();
      if (!normalised || forbidden.has(normalised)) continue;
      forbidden.add(normalised);
      options.push(String(value).trim());
      if (options.length === 3) break;
    }
    return options;
  }

  function questionTypeFor(index) {
    if (selectedMode === "meaning") return "meaning";
    if (selectedMode === "context") return "context";
    if (selectedMode === "synonym") return index % 2 ? "antonym" : "synonym";
    const order = session.typeOrder;
    return order[index % order.length];
  }

  function eligibleQuestionType(word, requestedType) {
    if (requestedType !== "antonym" || word.antonymEligible !== false) return requestedType;
    return "synonym";
  }

  function buildQuestion(word, index) {
    const type = eligibleQuestionType(word, questionTypeFor(index));
    let answer;
    let distractors;

    if (type === "meaning") {
      answer = word.definition;
      distractors = distractorValues(word, candidate => candidate.definition);
    } else if (type === "synonym") {
      answer = word.synonyms[0];
      distractors = distractorValues(
        word,
        candidate => candidate.synonyms[0],
        [...word.synonyms, ...word.antonyms, word.word]
      );
    } else if (type === "antonym") {
      answer = word.antonyms[0];
      distractors = distractorValues(
        word,
        candidate => candidate.antonyms[0],
        [...word.synonyms, ...word.antonyms, word.word]
      );
    } else {
      answer = word.word;
      distractors = distractorValues(
        word,
        candidate => candidate.word,
        [...word.synonyms, ...word.antonyms]
      );
    }

    if (distractors.length !== 3) {
      throw new Error(`Could not create four unique choices for ${word.word}.`);
    }

    return { word, type, answer, options: shuffle([answer, ...distractors]) };
  }

  function questionLabel(type) {
    return {
      meaning: "Meaning match",
      synonym: "Closest synonym",
      antonym: "Precise antonym",
      context: "Context completion"
    }[type];
  }

  function questionMarkup(question) {
    const word = question.word;
    if (question.type === "context") {
      return `
        <p class="question-instruction">Choose the word that best completes this sentence.</p>
        <p class="context-sentence">${escapeHtml(word.cloze).replace("_____", '<span class="context-blank">_____</span>')}</p>
        <span class="question-pos">${escapeHtml(word.partOfSpeech)}</span>
      `;
    }

    const instruction = question.type === "meaning"
      ? "Choose the most precise definition."
      : question.type === "synonym"
        ? "Choose the word closest in meaning."
        : "Choose the word most nearly opposite in meaning.";

    return `
      <p class="question-instruction">${instruction}</p>
      <h2 class="question-word">${escapeHtml(word.word)}</h2>
      <span class="question-pos">${escapeHtml(word.partOfSpeech)}</span>
    `;
  }

  function startSession({ reviewOnly = false, suppliedWords = null } = {}) {
    if (!storageReady) {
      elements.setupMessage.textContent = "Your saved progress is still loading. Please wait a moment.";
      return;
    }
    if (BANK.length !== 300) {
      elements.setupMessage.textContent = "The 300-word bank could not be loaded. Please refresh the page.";
      return;
    }

    const requestedLength = Math.max(1, Number(elements.sessionLength.value) || 20);
    const pool = reviewOnly ? BANK : difficultyWords();
    const words = weightedSessionWords(pool, requestedLength, reviewOnly, suppliedWords);

    if (!words.length) {
      elements.setupMessage.textContent = reviewOnly
        ? "Your review queue is empty. Start a regular challenge to discover new words."
        : "No words match that difficulty setting.";
      return;
    }

    elements.setupMessage.textContent = words.length < requestedLength
      ? `This review contains all ${words.length} currently available words.`
      : "";

    session = {
      words,
      questions: [],
      index: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      xp: 0,
      answered: false,
      hinted: false,
      endedEarly: false,
      reviewOnly,
      startedAt: Date.now(),
      mistakes: [],
      correctWords: [],
      typeOrder: shuffle(["meaning", "context", "synonym", "antonym"])
    };
    session.questions = words.map((word, index) => buildQuestion(word, index));

    elements.setupPanel.hidden = true;
    elements.resultPanel.hidden = true;
    elements.questionPanel.hidden = false;
    showQuestion();
  }

  function showQuestion() {
    if (!session) return;
    session.answered = false;
    session.hinted = false;
    const question = session.questions[session.index];

    elements.questionType.textContent = questionLabel(question.type);
    elements.questionDifficulty.textContent = DIFFICULTY_LABELS[question.word.difficulty] || "Advanced";
    elements.questionCounter.textContent = `Question ${session.index + 1} of ${session.questions.length}`;
    elements.liveScore.textContent = session.score;
    elements.comboCount.textContent = session.combo;
    elements.questionProgressBar.style.width = `${(session.index / session.questions.length) * 100}%`;
    elements.questionProgress.setAttribute("aria-valuemax", String(session.questions.length));
    elements.questionProgress.setAttribute("aria-valuenow", String(session.index));
    elements.questionContent.innerHTML = questionMarkup(question);
    elements.answerFeedback.hidden = true;
    elements.answerFeedback.className = "answer-feedback";
    elements.answerFeedback.textContent = "";
    elements.nextQuestionButton.disabled = true;
    elements.hintButton.disabled = false;

    elements.answerOptions.replaceChildren(...question.options.map((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-option";
      button.dataset.answer = option;
      button.setAttribute("aria-describedby", "questionContent");
      button.innerHTML = `<span class="option-number">${index + 1}</span><span>${escapeHtml(option)}</span>`;
      button.addEventListener("click", () => chooseAnswer(button));
      return button;
    }));

    window.requestAnimationFrame(() => elements.questionContent.focus());
  }

  function feedbackMarkup(question, correct) {
    const word = question.word;
    const lead = correct
      ? "<strong>Correct.</strong> Precision unlocked."
      : `<strong>Not quite.</strong> The correct answer is <span class="feedback-word"><strong>${escapeHtml(question.answer)}</strong></span>.`;
    return `
      ${lead}<br>
      <span class="feedback-word"><strong>${escapeHtml(word.word)}</strong></span>
      <em>(${escapeHtml(word.partOfSpeech)})</em> means ${escapeHtml(word.definition)}.<br>
      <strong>Synonyms:</strong> ${escapeHtml(word.synonyms.join(", "))} ·
      <strong>Antonyms:</strong> ${escapeHtml(word.antonyms.join(", "))}<br>
      <strong>In context:</strong> ${escapeHtml(word.example)}
    `;
  }

  function chooseAnswer(button) {
    if (!session || session.answered || resetInProgress) return;
    session.answered = true;

    const question = session.questions[session.index];
    const chosen = button.dataset.answer;
    const correct = chosen === question.answer;

    elements.answerOptions.querySelectorAll(".answer-option").forEach(option => {
      option.disabled = true;
      if (option.dataset.answer === question.answer) option.classList.add("correct");
      if (option === button && !correct) option.classList.add("wrong");
    });

    const progress = touchWordProgress(question.word);
    progress.seen = (Number(progress.seen) || 0) + 1;
    progress.lastSeen = new Date().toISOString();
    state.totalAnswered += 1;
    ensureDailyState();
    state.daily.answered += 1;

    if (correct) {
      progress.correct = (Number(progress.correct) || 0) + 1;
      progress.mastery = Math.min(MASTER_LEVEL, (Number(progress.mastery) || 0) + 1);
      progress.due = progress.mastery < MASTER_LEVEL && (Number(progress.wrong) || 0) > 0;
      state.totalCorrect += 1;
      session.score += 1;
      session.combo += 1;
      session.bestCombo = Math.max(session.bestCombo, session.combo);
      session.correctWords.push(question.word.id);

      const hintPenalty = session.hinted ? 3 : 0;
      const itemXp = Math.max(5, 9 + Number(question.word.difficulty) * 2 + Math.min(5, session.combo) - hintPenalty);
      session.xp += itemXp;
      state.totalXp += itemXp;
    } else {
      progress.wrong = (Number(progress.wrong) || 0) + 1;
      progress.mastery = Math.max(0, (Number(progress.mastery) || 0) - 1);
      progress.due = true;
      session.combo = 0;
      session.xp += 2;
      state.totalXp += 2;
      session.mistakes.push({
        wordId: question.word.id,
        word: question.word.word,
        chosen,
        answer: question.answer,
        type: question.type
      });
    }

    elements.answerFeedback.hidden = false;
    elements.answerFeedback.className = `answer-feedback ${correct ? "good" : "bad"}`;
    elements.answerFeedback.innerHTML = feedbackMarkup(question, correct);
    elements.answerFeedback.tabIndex = -1;
    elements.answerFeedback.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 720px)").matches) {
      elements.answerFeedback.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
    }
    elements.nextQuestionButton.disabled = false;
    elements.hintButton.disabled = true;
    elements.liveScore.textContent = session.score;
    elements.comboCount.textContent = session.combo;
    elements.questionProgressBar.style.width = `${((session.index + 1) / session.questions.length) * 100}%`;
    elements.questionProgress.setAttribute("aria-valuenow", String(session.index + 1));
    saveState();
    refreshDashboard();
  }

  function showHint() {
    if (!session || session.answered || session.hinted || resetInProgress) return;
    session.hinted = true;
    const question = session.questions[session.index];
    const word = question.word;
    const hint = question.type === "context"
      ? `The answer is a ${word.partOfSpeech}, begins with “${word.word[0].toUpperCase()},” and means “${word.definition}.”`
      : question.type === "meaning"
        ? `A close synonym is “${word.synonyms[0]}.”`
        : `Think about this definition: ${word.definition}.`;

    elements.answerFeedback.hidden = false;
    elements.answerFeedback.className = "answer-feedback hint";
    elements.answerFeedback.innerHTML = `<strong>Hint:</strong> ${escapeHtml(hint)} <span class="feedback-word">A hinted correct answer earns slightly less XP.</span>`;
    elements.hintButton.disabled = true;
  }

  function nextQuestion() {
    if (!session?.answered || resetInProgress) return;
    session.index += 1;
    if (session.index >= session.questions.length) finishSession();
    else showQuestion();
  }

  function updateStreak() {
    const today = localDateKey();
    if (!state.lastPracticeDate) {
      state.streak = 1;
    } else if (state.lastPracticeDate !== today) {
      const [lastYear, lastMonth, lastDay] = state.lastPracticeDate.split("-").map(Number);
      const [year, month, day] = today.split("-").map(Number);
      const previous = new Date(lastYear, lastMonth - 1, lastDay);
      const current = new Date(year, month - 1, day);
      const difference = Math.round((current - previous) / 86400000);
      state.streak = difference === 1 ? (Number(state.streak) || 0) + 1 : 1;
    }
    state.lastPracticeDate = today;
  }

  function attemptPayload(log) {
    return {
      clientAttemptId: log.clientAttemptId,
      completedAt: log.completedAt,
      quizId: ACTIVITY_ID,
      score: Number(log.score) || 0,
      total: Number(log.total) || 0,
      durationSeconds: Number.isInteger(log.durationSeconds) ? log.durationSeconds : null,
      details: {
        mode: log.mode || "mixed",
        difficulty: log.difficulty || "all",
        xp: Number(log.xp) || 0,
        bestCombo: Number(log.bestCombo) || 0,
        endedEarly: Boolean(log.endedEarly),
        wrongWords: Array.isArray(log.mistakes) ? log.mistakes : []
      }
    };
  }

  async function syncPendingAttempts(expectedGeneration) {
    const store = window.ProgressStore;
    const ownerAtStart = activeOwnerId;
    if (
      expectedGeneration !== syncGeneration ||
      !cloudSyncEnabled ||
      !ownerAtStart ||
      !store ||
      store.currentOwnerId() !== ownerAtStart
    ) return;

    let changed = false;
    for (const log of state.logs.filter(item => !item.cloudSaved && Number(item.total) > 0)) {
      try {
        const result = await store.recordAttempt({ ...attemptPayload(log), expectedUserId: ownerAtStart });
        if (expectedGeneration !== syncGeneration || activeOwnerId !== ownerAtStart) return;
        if (result.saved) {
          log.ownerId = ownerAtStart;
          log.cloudSaved = true;
          changed = true;
        }
        if (result.reason === "owner_changed") break;
      } catch (error) {
        console.warn("An advanced vocabulary score could not be synced yet.", error);
        break;
      }
    }

    if (changed && expectedGeneration === syncGeneration && activeOwnerId === ownerAtStart) {
      saveState();
    }
  }

  function queuePendingAttemptSync() {
    const expectedGeneration = syncGeneration;
    attemptSyncPromise = attemptSyncPromise
      .then(() => syncPendingAttempts(expectedGeneration))
      .catch(error => console.warn("Advanced vocabulary scores could not be synced yet.", error));
    return attemptSyncPromise;
  }

  function endSession() {
    if (!session || resetInProgress) return;
    const answeredCount = session.index + (session.answered ? 1 : 0);
    if (answeredCount === 0) {
      session = null;
      elements.questionPanel.hidden = true;
      elements.setupPanel.hidden = false;
      elements.startSessionButton.focus();
      return;
    }
    session.endedEarly = true;
    finishSession();
  }

  function finishSession() {
    if (!session || resetInProgress) return;
    const answeredCount = Math.min(session.questions.length, session.index + (session.answered ? 1 : 0));
    if (!answeredCount) return endSession();

    const completedAt = new Date().toISOString();
    const clientAttemptId = window.ProgressStore?.createAttemptId?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const durationSeconds = Math.max(0, Math.round((Date.now() - session.startedAt) / 1000));
    const accuracy = Math.round((session.score / answeredCount) * 100);
    const completedSession = session;
    updateStreak();

    state.logs.unshift({
      clientAttemptId,
      ownerId: activeOwnerId || null,
      completedAt,
      date: localDateKey(),
      mode: completedSession.reviewOnly ? "Review" : selectedMode,
      difficulty: elements.difficultyFilter.value,
      score: completedSession.score,
      total: answeredCount,
      plannedTotal: completedSession.questions.length,
      endedEarly: completedSession.endedEarly,
      durationSeconds,
      xp: completedSession.xp,
      bestCombo: completedSession.bestCombo,
      mistakes: completedSession.mistakes
    });
    state.logs = state.logs.slice(0, 100);
    saveState();

    if (activeOwnerId) void queuePendingAttemptSync();

    elements.questionPanel.hidden = true;
    elements.setupPanel.hidden = true;
    elements.resultPanel.hidden = false;
    elements.resultScore.textContent = `${completedSession.score}/${answeredCount}`;
    elements.resultAccuracy.textContent = `${accuracy}%`;
    elements.resultXp.textContent = `+${completedSession.xp}`;

    if (accuracy === 100) {
      elements.resultHeadline.textContent = "Flawless precision.";
      elements.resultSummary.textContent = "Every distinction landed. That is sharp verbal control.";
      elements.resultEmblem.textContent = "◆";
      celebrate();
    } else if (accuracy >= 85) {
      elements.resultHeadline.textContent = "Excellent command.";
      elements.resultSummary.textContent = "Your vocabulary is becoming both broader and more precise. Review the few misses while they are fresh.";
      elements.resultEmblem.textContent = "✦";
    } else if (accuracy >= 65) {
      elements.resultHeadline.textContent = "Strong training session.";
      elements.resultSummary.textContent = "The difficult distinctions are doing useful work. Missed words are now prioritised for review.";
      elements.resultEmblem.textContent = "V";
    } else {
      elements.resultHeadline.textContent = "Challenge accepted.";
      elements.resultSummary.textContent = "These words are meant to stretch you. Your misses have become a focused review set for the next round.";
      elements.resultEmblem.textContent = "↗";
    }

    elements.resultReview.innerHTML = completedSession.mistakes.length
      ? `<h3>Words to revisit</h3><div class="chip-cloud">${completedSession.mistakes.map(item => `<span class="word-chip">${escapeHtml(item.word)}</span>`).join("")}</div>`
      : "<h3>No mistakes this session</h3><p class=\"empty-state\">Choose a harder band when you are ready for the next stretch.</p>";
    elements.reviewMistakesButton.hidden = completedSession.mistakes.length === 0;
    elements.resultPanel.tabIndex = -1;
    elements.resultPanel.focus();
    refreshAll();
  }

  function startMistakeReview() {
    if (!session?.mistakes?.length) return;
    const words = session.mistakes.map(item => BANK.find(word => word.id === item.wordId)).filter(Boolean);
    selectedMode = "mixed";
    updateModeSelection("mixed");
    startSession({ reviewOnly: true, suppliedWords: words });
  }

  function switchScreen(screenName, { focusTab = false } = {}) {
    elements.tabs.forEach(tab => {
      const selected = tab.dataset.screen === screenName;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });
    elements.screens.forEach(screen => { screen.hidden = screen.id !== `${screenName}Screen`; });
    if (screenName === "bank") renderWordBank(true);
    if (screenName === "progress") renderProgress();
  }

  function wordStatus(word) {
    const progress = readWordProgress(word);
    if (progress.mastery >= MASTER_LEVEL) return { label: "Mastered", className: "mastered" };
    if (needsReview(word)) return { label: "Review", className: "review" };
    if (progress.seen) return { label: `Learning ${progress.mastery}/${MASTER_LEVEL}`, className: "" };
    return { label: "New", className: "" };
  }

  function filteredBankWords() {
    const query = elements.bankSearch.value.trim().toLowerCase();
    const difficulty = elements.bankDifficulty.value;
    const mastery = elements.bankMastery.value;
    return BANK.filter(word => {
      const progress = readWordProgress(word);
      const matchesText = !query || [
        word.word,
        word.definition,
        word.partOfSpeech,
        ...word.synonyms,
        ...word.antonyms
      ].some(value => String(value).toLowerCase().includes(query));
      const matchesDifficulty = difficulty === "all" || String(word.difficulty) === difficulty;
      const matchesMastery = mastery === "all" ||
        (mastery === "new" && progress.seen === 0) ||
        (mastery === "review" && needsReview(word)) ||
        (mastery === "mastered" && progress.mastery >= MASTER_LEVEL);
      return matchesText && matchesDifficulty && matchesMastery;
    });
  }

  function renderWordBank(resetCount = false) {
    if (resetCount) bankVisibleCount = 40;
    const matches = filteredBankWords();
    const visible = matches.slice(0, bankVisibleCount);
    elements.bankResultCount.textContent = `${matches.length} ${matches.length === 1 ? "word" : "words"}`;
    elements.wordBankGrid.replaceChildren(...visible.map(word => {
      const status = wordStatus(word);
      const card = document.createElement("article");
      card.className = "word-card";
      card.innerHTML = `
        <div class="word-card-top">
          <div><h3>${escapeHtml(word.word)}</h3><span class="word-pos">${escapeHtml(word.partOfSpeech)} · ${escapeHtml(DIFFICULTY_LABELS[word.difficulty])}</span></div>
          <span class="word-status ${status.className}">${escapeHtml(status.label)}</span>
        </div>
        <p class="word-definition">${escapeHtml(word.definition)}</p>
        <p class="word-relations"><strong>Syn:</strong> ${escapeHtml(word.synonyms.join(", "))}<br><strong>Ant:</strong> ${escapeHtml(word.antonyms.join(", "))}</p>
      `;
      return card;
    }));

    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No words match those filters.";
      elements.wordBankGrid.replaceChildren(empty);
    }
    elements.loadMoreWordsButton.hidden = visible.length >= matches.length;
  }

  function priorityReviewWords() {
    return BANK
      .filter(needsReview)
      .sort((a, b) => {
        const left = readWordProgress(a);
        const right = readWordProgress(b);
        return right.wrong - left.wrong || left.mastery - right.mastery || a.word.localeCompare(b.word);
      });
  }

  function renderProgress() {
    const mastered = BANK.filter(isMastered).length;
    const review = priorityReviewWords();
    const accuracy = state.totalAnswered ? Math.round((state.totalCorrect / state.totalAnswered) * 100) : 0;
    elements.progressMastered.textContent = mastered;
    elements.progressReview.textContent = review.length;
    elements.progressAccuracy.textContent = `${accuracy}%`;
    elements.progressSessions.textContent = state.logs.length;
    elements.startPriorityReviewButton.disabled = !storageReady || !bankValid || review.length === 0;
    elements.priorityWords.innerHTML = review.length
      ? review.slice(0, 30).map(word => `<span class="word-chip" title="${escapeHtml(word.definition)}">${escapeHtml(word.word)}</span>`).join("")
      : '<p class="empty-state">No priority words yet. Start a challenge to build your review queue.</p>';

    elements.sessionHistory.innerHTML = state.logs.length
      ? state.logs.slice(0, 12).map(log => `
          <div class="session-row">
            <span><strong>${escapeHtml(formatDate(log.completedAt || log.date))}</strong><br>${escapeHtml(String(log.mode || "Mixed"))}</span>
            <span>${Number(log.score) || 0}/${Number(log.total) || 0}</span>
            <span>+${Number(log.xp) || 0} XP</span>
          </div>
        `).join("")
      : '<p class="empty-state">Your completed sessions will appear here.</p>';
  }

  function rankForXp(xp) {
    if (xp >= 7000) return "Lexicon Master";
    if (xp >= 3500) return "Verbal Strategist";
    if (xp >= 1500) return "Lexicon Explorer";
    if (xp >= 500) return "Word Builder";
    return "Word Scout";
  }

  function refreshDashboard() {
    ensureDailyState();
    const mastered = BANK.filter(isMastered).length;
    const review = BANK.filter(needsReview).length;
    const accuracy = state.totalAnswered ? Math.round((state.totalCorrect / state.totalAnswered) * 100) : 0;
    const xp = Number(state.totalXp) || 0;
    const dailyAnswered = Math.min(DAILY_GOAL, Number(state.daily.answered) || 0);
    elements.heroWordCount.textContent = BANK.length || "—";
    elements.rankName.textContent = rankForXp(xp);
    elements.levelNumber.textContent = `Level ${Math.floor(xp / 500) + 1}`;
    elements.totalXp.textContent = `${xp.toLocaleString()} XP`;
    elements.sidebarStreak.textContent = Number(state.streak) || 0;
    elements.sidebarAccuracy.textContent = `${accuracy}%`;
    elements.sidebarMastered.textContent = mastered;
    elements.sidebarReview.textContent = review;
    elements.reviewButtonCount.textContent = review;
    elements.reviewSessionButton.disabled = !storageReady || review === 0;
    elements.dailyGoalText.textContent = `${dailyAnswered} / ${DAILY_GOAL}`;
    elements.dailyGoalBar.style.width = `${(dailyAnswered / DAILY_GOAL) * 100}%`;
    elements.dailyGoalTrack.setAttribute("aria-valuenow", String(dailyAnswered));
  }

  function refreshAll() {
    refreshDashboard();
    renderProgress();
    if (!document.getElementById("bankScreen").hidden) renderWordBank();
  }

  function resetOpenSession() {
    session = null;
    elements.questionPanel.hidden = true;
    elements.resultPanel.hidden = true;
    elements.setupPanel.hidden = false;
  }

  function resetCurrentView(ownerId) {
    if ((ownerId || null) !== (activeOwnerId || null)) return;
    const currentKey = activeStorageKey;
    storageActivationVersion += 1;
    syncGeneration += 1;
    window.clearTimeout(cloudSaveTimer);
    resetOpenSession();
    state = createEmptyState();
    state.ownerId = activeOwnerId || null;
    try {
      window.localStorage.setItem(currentKey, JSON.stringify(state));
    } catch (error) {
      console.warn("Vocabulary progress could not be reset in this tab.", error);
    }
    refreshAll();
    switchScreen("progress");
  }

  function announceReset(ownerId) {
    const detail = { ownerId: ownerId || null, sentAt: Date.now() };
    resetChannel?.postMessage(detail);
    try {
      window.localStorage.setItem(`${STORAGE_KEY}:reset-event`, JSON.stringify(detail));
      window.localStorage.removeItem(`${STORAGE_KEY}:reset-event`);
    } catch (error) {
      console.warn("Other trainer tabs could not be notified about the reset.", error);
    }
  }

  async function activateStorage(requestedUserId = undefined, { forceGuest = false } = {}) {
    const version = ++storageActivationVersion;
    syncGeneration += 1;
    cloudSyncEnabled = false;
    pendingOfflineOwnerId = undefined;
    setPracticeReady(false);
    elements.continueOfflineButton.hidden = true;
    elements.setupMessage.textContent = "Loading your saved progress…";
    try {
      const store = window.ProgressStore;
      let userId = requestedUserId;
      if (forceGuest) {
        userId = null;
        offlineGuestMode = true;
      } else if (userId === undefined && store) {
        const authResult = await Promise.race([
          store.getCurrentUserId().then(value => ({ resolved: true, userId: value })),
          new Promise(resolve => window.setTimeout(() => resolve({ resolved: false }), 5000))
        ]);
        if (version !== storageActivationVersion) return;
        if (!authResult.resolved) {
          pendingOfflineOwnerId = null;
          elements.setupMessage.textContent = "Your account check is taking longer than expected. You can wait, reload, or continue offline on this browser.";
          elements.continueOfflineButton.hidden = false;
          return;
        }
        userId = authResult.userId;
        offlineGuestMode = false;
      } else if (userId === undefined) {
        userId = null;
        offlineGuestMode = true;
      } else {
        offlineGuestMode = false;
      }
      if (version !== storageActivationVersion) return;

      if (activeOwnerId !== undefined && activeOwnerId !== userId) resetOpenSession();
      activeOwnerId = userId || null;
      activeStorageKey = activeOwnerId ? `${STORAGE_KEY}:${activeOwnerId}` : STORAGE_KEY;
      let localState = readLocalState(activeStorageKey);

      if (activeOwnerId && store) {
        if (localState.ownerId && localState.ownerId !== activeOwnerId) localState = createEmptyState();
        let remote;
        try {
          remote = await Promise.race([
            store.loadActivityState(ACTIVITY_ID, activeOwnerId),
            new Promise((_, reject) => window.setTimeout(
              () => reject(new Error("Cloud progress took too long to respond.")),
              5000
            ))
          ]);
        } catch (error) {
          if (version !== storageActivationVersion) return;
          console.warn("Cloud vocabulary progress could not be restored yet.", error);
          state = localState;
          state.ownerId = activeOwnerId;
          saveState({ sync: false });
          pendingOfflineOwnerId = activeOwnerId;
          elements.setupMessage.textContent = "Cloud progress is taking longer than expected. You can wait, reload, or continue with this profile's local copy.";
          elements.continueOfflineButton.hidden = false;
          return;
        }
        if (version !== storageActivationVersion) return;
        const localUpdated = Date.parse(localState.localUpdatedAt || "") || 0;
        const remoteUpdated = Date.parse(remote?.updated_at || "") || 0;

        if (remote?.state && (!hasMeaningfulState(localState) || remoteUpdated > localUpdated)) {
          state = mergePendingLogs(normaliseState(remote.state), localState);
        } else {
          state = localState;
        }
        state.ownerId = activeOwnerId;
        cloudSyncEnabled = true;
      } else {
        if (localState.ownerId) localState = createEmptyState();
        state = localState;
        state.ownerId = null;
      }
      saveState({ sync: false });
    } catch (error) {
      if (version !== storageActivationVersion) return;
      console.warn("Cloud vocabulary progress could not be restored.", error);
      activeOwnerId = null;
      activeStorageKey = STORAGE_KEY;
      offlineGuestMode = true;
      cloudSyncEnabled = false;
      state = readLocalState(activeStorageKey);
    }
    if (version !== storageActivationVersion) return;
    setPracticeReady(true);
    elements.setupMessage.textContent = offlineGuestMode
      ? "Offline mode: progress stays on this browser and can be imported from your Account later."
      : "";
    refreshAll();
    if (cloudSyncEnabled && activeOwnerId) void queuePendingAttemptSync();
  }

  function continueOffline() {
    if (pendingOfflineOwnerId === undefined) return;
    if (pendingOfflineOwnerId === null) {
      void activateStorage(null, { forceGuest: true });
      return;
    }

    offlineGuestMode = true;
    cloudSyncEnabled = false;
    pendingOfflineOwnerId = undefined;
    elements.continueOfflineButton.hidden = true;
    state = readLocalState(activeStorageKey);
    state.ownerId = activeOwnerId;
    saveState({ sync: false });
    setPracticeReady(true);
    elements.setupMessage.textContent = "Offline mode: this profile's progress stays on this browser until you reload and reconnect.";
    refreshAll();
  }

  async function resetProgress() {
    if (!storageReady) return;
    if (activeOwnerId && !cloudSyncEnabled) {
      window.alert("Reconnect and reload this trainer before resetting signed-in learning progress.");
      return;
    }
    const confirmed = window.confirm("Reset mastery, XP, streak, review queue, and trainer history for this profile? Completed attempts in My Scores will be kept.");
    if (!confirmed) return;
    const ownerToReset = activeOwnerId;
    const activationAtStart = storageActivationVersion;
    resetInProgress = true;
    resetOpenSession();
    switchScreen("progress");
    elements.tabs.forEach(tab => { tab.disabled = true; });
    setPracticeReady(false);
    elements.setupMessage.textContent = ownerToReset ? "Resetting local and cloud learning progress…" : "Resetting learning progress…";
    window.clearTimeout(cloudSaveTimer);

    try {
      await attemptSyncPromise;
      if (storageActivationVersion !== activationAtStart || activeOwnerId !== ownerToReset) {
        throw new Error("The signed-in account changed before progress could be reset.");
      }
      if (ownerToReset && state.logs.some(log => !log.cloudSaved && Number(log.total) > 0)) {
        throw new Error("Completed scores are still waiting to sync.");
      }
      syncGeneration += 1;
      window.clearTimeout(cloudSaveTimer);
      await cloudSavePromise;

      if (ownerToReset) {
        if (!window.ProgressStore?.deleteActivityState) throw new Error("Cloud progress reset is unavailable.");
        const deletion = await window.ProgressStore.deleteActivityState(ACTIVITY_ID, ownerToReset);
        if (!deletion.deleted) throw new Error("The signed-in account changed before progress could be reset.");
      }
      if (storageActivationVersion !== activationAtStart || activeOwnerId !== ownerToReset) {
        throw new Error("The active profile changed before progress could be reset.");
      }
      window.localStorage.removeItem(activeStorageKey);
      state = createEmptyState();
      state.ownerId = activeOwnerId || null;
      saveState({ sync: false });
      announceReset(ownerToReset);
      refreshAll();
      elements.setupMessage.textContent = "";
    } catch (error) {
      console.warn("Advanced vocabulary progress could not be reset.", error);
      window.alert("Your progress was not reset because the saved account data could not be cleared. Please check your connection and try again.");
      elements.setupMessage.textContent = "Progress was kept. Please try the reset again when you are online.";
    } finally {
      resetInProgress = false;
      elements.tabs.forEach(tab => { tab.disabled = false; });
      if (storageActivationVersion === activationAtStart && activeOwnerId === ownerToReset) {
        setPracticeReady(true);
        refreshAll();
      }
    }
  }

  function celebrate() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    elements.celebrationLayer.replaceChildren(...Array.from({ length: 34 }, (_, index) => {
      const particle = document.createElement("span");
      particle.className = "celebration-particle";
      particle.textContent = ["✦", "◆", "·", "V"][index % 4];
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.color = ["#67e8f9", "#93c5fd", "#c4b5fd", "#fbbf24"][index % 4];
      particle.style.animationDelay = `${Math.random() * 0.5}s`;
      particle.style.fontSize = `${0.7 + Math.random() * 1.2}rem`;
      return particle;
    }));
    window.setTimeout(() => elements.celebrationLayer.replaceChildren(), 2900);
  }

  function attachEvents() {
    elements.modeCards.forEach((card, index) => {
      card.addEventListener("click", () => updateModeSelection(card.dataset.mode));
      card.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (index + 1) % elements.modeCards.length;
        if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (index - 1 + elements.modeCards.length) % elements.modeCards.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = elements.modeCards.length - 1;
        const nextCard = elements.modeCards[nextIndex];
        updateModeSelection(nextCard.dataset.mode);
        nextCard.focus();
      });
    });
    elements.startSessionButton.addEventListener("click", () => startSession());
    elements.reviewSessionButton.addEventListener("click", () => startSession({ reviewOnly: true }));
    elements.continueOfflineButton.addEventListener("click", continueOffline);
    elements.endSessionButton.addEventListener("click", endSession);
    elements.hintButton.addEventListener("click", showHint);
    elements.nextQuestionButton.addEventListener("click", nextQuestion);
    elements.practiceAgainButton.addEventListener("click", () => {
      session = null;
      elements.resultPanel.hidden = true;
      elements.setupPanel.hidden = false;
      elements.startSessionButton.focus();
    });
    elements.reviewMistakesButton.addEventListener("click", startMistakeReview);
    elements.startPriorityReviewButton.addEventListener("click", () => {
      switchScreen("practice");
      startSession({ reviewOnly: true });
    });
    elements.resetProgressButton.addEventListener("click", () => { void resetProgress(); });

    elements.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => switchScreen(tab.dataset.screen));
      tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % elements.tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + elements.tabs.length) % elements.tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = elements.tabs.length - 1;
        switchScreen(elements.tabs[nextIndex].dataset.screen, { focusTab: true });
      });
    });

    [elements.bankSearch, elements.bankDifficulty, elements.bankMastery].forEach(control => {
      control.addEventListener(control === elements.bankSearch ? "input" : "change", () => renderWordBank(true));
    });
    elements.loadMoreWordsButton.addEventListener("click", () => {
      bankVisibleCount += 40;
      renderWordBank();
    });

    document.addEventListener("keydown", event => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))) return;
      if (!session || document.getElementById("practiceScreen").hidden || elements.questionPanel.hidden) return;

      if (/^[1-4]$/.test(event.key) && !session.answered) {
        const option = elements.answerOptions.querySelectorAll(".answer-option")[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          chooseAnswer(option);
        }
      } else if (event.key.toLowerCase() === "h" && !session.answered) {
        event.preventDefault();
        showHint();
      } else if (event.key === "Enter" && session.answered) {
        event.preventDefault();
        nextQuestion();
      } else if (event.key === "Escape") {
        event.preventDefault();
        endSession();
      }
    });

    resetChannel?.addEventListener("message", event => resetCurrentView(event.data?.ownerId));
    window.addEventListener("storage", event => {
      if (event.key !== `${STORAGE_KEY}:reset-event` || !event.newValue) return;
      try {
        resetCurrentView(JSON.parse(event.newValue).ownerId);
      } catch (error) {
        console.warn("A vocabulary reset notice could not be read.", error);
      }
    });
  }

  function validateBankAtRuntime() {
    const ids = new Set();
    const errors = [];
    if (BANK.length !== 300) errors.push(`expected 300 records, found ${BANK.length}`);
    BANK.forEach((word, index) => {
      if (!word?.id || ids.has(word.id)) errors.push(`invalid or duplicate id at record ${index + 1}`);
      ids.add(word?.id);
      if (!word?.word || !word?.definition || !word?.partOfSpeech) errors.push(`missing core field for ${word?.id || index + 1}`);
      if (!Array.isArray(word?.synonyms) || word.synonyms.length < 2) errors.push(`missing synonyms for ${word?.id || index + 1}`);
      if (!Array.isArray(word?.antonyms) || word.antonyms.length < 1) errors.push(`missing antonyms for ${word?.id || index + 1}`);
      if (typeof word?.cloze !== "string" || (word.cloze.match(/_____/g) || []).length !== 1) errors.push(`invalid cloze for ${word?.id || index + 1}`);
    });
    return errors;
  }

  function initialise() {
    const bankErrors = validateBankAtRuntime();
    bankValid = bankErrors.length === 0;
    if (bankErrors.length) {
      console.error("Advanced vocabulary bank validation failed:", bankErrors);
      elements.setupMessage.textContent = "The vocabulary bank could not be validated. Please refresh after checking the data file.";
      elements.startSessionButton.disabled = true;
      elements.reviewSessionButton.disabled = true;
    }

    setPracticeReady(false);
    attachEvents();
    updateModeSelection("mixed");
    switchScreen("practice");
    renderWordBank(true);
    refreshAll();

    if (window.ProgressStore?.subscribeToOwnerChanges) {
      window.ProgressStore.subscribeToOwnerChanges(userId => {
        if (offlineGuestMode) return;
        if (userId === activeOwnerId) return;
        window.setTimeout(() => { void activateStorage(userId); }, 0);
      });
    }
    void activateStorage();
  }

  initialise();
})();
