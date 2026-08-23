(() => {
  "use strict";

  const DATA_URL = "../assets/data/question_banks/maths_vectors_matrices.json";
  const optionLetters = ["A", "B", "C", "D"];

  const elements = {
    quizScreen: document.getElementById("quizScreen"),
    resultScreen: document.getElementById("resultScreen"),
    againBtn: document.getElementById("againBtn"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    submitBtn: document.getElementById("submitBtn"),
    progress: document.getElementById("progress"),
    timer: document.getElementById("timer"),
    progressBar: document.getElementById("progressBar"),
    question: document.getElementById("question"),
    options: document.getElementById("options"),
    quizStatus: document.getElementById("quizStatus"),
    finalScore: document.getElementById("finalScore"),
    finalPercent: document.getElementById("finalPercent"),
    finalTime: document.getElementById("finalTime"),
    resultTitle: document.getElementById("resultTitle"),
    reviewList: document.getElementById("reviewList"),
    loadStatus: document.getElementById("loadStatus"),
    loadError: document.getElementById("loadError")
  };

  let topic = null;
  let quiz = [];
  let current = 0;
  let answers = [];
  let timerInterval = null;
  let startedAt = 0;
  let elapsedSeconds = 0;
  let cloudAttemptId = null;

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function currentElapsedSeconds() {
    if (!startedAt) return elapsedSeconds;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }

  function startTimer() {
    clearInterval(timerInterval);
    startedAt = Date.now();
    elapsedSeconds = 0;
    elements.timer.textContent = "00:00";
    timerInterval = window.setInterval(() => {
      elapsedSeconds = currentElapsedSeconds();
      elements.timer.textContent = formatTime(elapsedSeconds);
    }, 1000);
  }

  function stopTimer() {
    elapsedSeconds = currentElapsedSeconds();
    startedAt = 0;
    clearInterval(timerInterval);
    timerInterval = null;
    elements.timer.textContent = formatTime(elapsedSeconds);
  }

  function createOptionButton(option, index, selectedAnswer) {
    const button = document.createElement("button");
    const letter = document.createElement("span");
    const text = document.createElement("span");

    button.type = "button";
    button.className = "option" + (selectedAnswer === option ? " is-selected" : "");
    button.setAttribute("aria-pressed", selectedAnswer === option ? "true" : "false");
    button.setAttribute("aria-label", "Option " + optionLetters[index] + ": " + option);

    letter.className = "option-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = optionLetters[index];

    text.textContent = option;
    button.append(letter, text);
    button.addEventListener("click", () => selectAnswer(option));
    return button;
  }

  function updateStatus() {
    const answered = answers.filter(Boolean).length;
    elements.progress.textContent =
      "Question " + String(current + 1) + " of " + String(quiz.length);
    elements.progressBar.style.width = String(((current + 1) / quiz.length) * 100) + "%";
    elements.submitBtn.disabled = answered !== quiz.length;
    elements.quizStatus.textContent =
      "Answered " + String(answered) + " of " + String(quiz.length) + ".";
  }

  function renderQuestion() {
    const item = quiz[current];
    const selectedAnswer = answers[current];

    elements.question.textContent = item.prompt;
    elements.options.replaceChildren(
      ...item.options.map((option, index) => createOptionButton(option, index, selectedAnswer))
    );

    elements.prevBtn.disabled = current === 0;
    elements.nextBtn.hidden = current === quiz.length - 1;
    elements.submitBtn.hidden = current !== quiz.length - 1;
    updateStatus();
  }

  function selectAnswer(option) {
    answers[current] = option;
    renderQuestion();
    elements.options.querySelector(".option.is-selected")?.focus({ preventScroll: true });
  }

  function startQuiz() {
    if (!topic) return;

    quiz = shuffle(topic.questions)
      .slice(0, topic.questionCount)
      .map(question => ({ ...question, options: shuffle(question.options) }));
    current = 0;
    answers = Array(quiz.length).fill(null);
    cloudAttemptId = window.ProgressStore?.createAttemptId?.() || null;

    elements.resultScreen.hidden = true;
    elements.quizScreen.hidden = false;
    startTimer();
    renderQuestion();
    elements.question.focus();
  }

  function nextQuestion() {
    if (current >= quiz.length - 1) return;
    current += 1;
    renderQuestion();
    elements.question.focus();
  }

  function previousQuestion() {
    if (current <= 0) return;
    current -= 1;
    renderQuestion();
    elements.question.focus();
  }

  function createReviewItem(item, answer, index) {
    const isCorrect = answer === item.answer;
    const container = document.createElement("article");
    const heading = document.createElement("strong");
    const userLine = document.createElement("span");
    const correctLine = document.createElement("span");

    container.className = "review-item " + (isCorrect ? "is-correct" : "is-wrong");
    heading.textContent = String(index + 1) + ". " + item.prompt;
    userLine.textContent = "Your answer: " + (answer || "Not answered");
    correctLine.textContent = "Correct answer: " + item.answer;
    container.append(heading, userLine, correctLine);
    return container;
  }

  function submitQuiz() {
    if (answers.some(answer => !answer)) {
      elements.quizStatus.textContent = "Answer every question before submitting.";
      return;
    }

    stopTimer();
    const score = quiz.reduce(
      (total, item, index) => total + (answers[index] === item.answer ? 1 : 0),
      0
    );
    const percent = Math.round((score / quiz.length) * 100);

    elements.finalScore.textContent = String(score) + "/" + String(quiz.length);
    elements.finalPercent.textContent = String(percent) + "%";
    elements.finalTime.textContent = formatTime(elapsedSeconds);
    elements.reviewList.replaceChildren(
      ...quiz.map((item, index) => createReviewItem(item, answers[index], index))
    );
    elements.quizScreen.hidden = true;
    elements.resultScreen.hidden = false;
    elements.resultTitle.focus();

    if (window.ProgressStore && cloudAttemptId) {
      void window.ProgressStore.recordAttempt({
        clientAttemptId: cloudAttemptId,
        quizId: topic.quizId,
        score,
        total: quiz.length,
        durationSeconds: elapsedSeconds,
        details: {
          percent,
          topicId: topic.id,
          questionIds: quiz.map(item => item.id)
        }
      }).catch(error => {
        console.warn("Cloud progress could not be saved.", error);
      });
    }
  }

  async function loadTopic() {
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("Question bank request failed.");

      const topics = await response.json();
      topic = topics.find(item => item.id === document.body.dataset.quizTopic);
      if (!topic || topic.questions.length < topic.questionCount) {
        throw new Error("This quiz is not configured correctly.");
      }

      elements.loadStatus.hidden = true;
      startQuiz();
    } catch (error) {
      console.error(error);
      elements.loadStatus.hidden = true;
      elements.loadError.hidden = false;
      elements.loadError.textContent = "The quiz could not be loaded. Refresh the page and try again.";
    }
  }

  elements.againBtn.addEventListener("click", startQuiz);
  elements.prevBtn.addEventListener("click", previousQuestion);
  elements.nextBtn.addEventListener("click", nextQuestion);
  elements.submitBtn.addEventListener("click", submitQuiz);
  window.addEventListener("beforeunload", () => clearInterval(timerInterval));

  void loadTopic();
})();
