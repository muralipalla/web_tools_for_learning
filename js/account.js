(() => {
  "use strict";

  const client = window.supabaseClient;
  const progressStore = window.ProgressStore;
  const configured = Boolean(window.supabaseConfig?.isConfigured && client);

  const elements = {
    configurationNotice: document.getElementById("configurationNotice"),
    authLoading: document.getElementById("authLoading"),
    signedOutView: document.getElementById("signedOutView"),
    recoveryView: document.getElementById("recoveryView"),
    signedInView: document.getElementById("signedInView"),
    authForm: document.getElementById("authForm"),
    recoveryForm: document.getElementById("recoveryForm"),
    displayNameGroup: document.getElementById("displayNameGroup"),
    displayName: document.getElementById("displayName"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    confirmPasswordGroup: document.getElementById("confirmPasswordGroup"),
    confirmPassword: document.getElementById("confirmPassword"),
    forgotPasswordButton: document.getElementById("forgotPasswordButton"),
    emailSubmitButton: document.getElementById("emailSubmitButton"),
    googleButton: document.getElementById("googleButton"),
    signOutButton: document.getElementById("signOutButton"),
    syncProgressButton: document.getElementById("syncProgressButton"),
    refreshProgressButton: document.getElementById("refreshProgressButton"),
    profileAvatar: document.getElementById("profileAvatar"),
    profileName: document.getElementById("profileName"),
    profileEmail: document.getElementById("profileEmail"),
    progressList: document.getElementById("progressList"),
    progressEmpty: document.getElementById("progressEmpty"),
    cardTitle: document.getElementById("card-title"),
    cardSubtitle: document.getElementById("cardSubtitle"),
    message: document.getElementById("accountMessage"),
    modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
    authActions: Array.from(document.querySelectorAll("[data-auth-action]"))
  };

  let mode = "signin";
  let recoveryMode = false;
  let progressRequest = 0;

  const quizLabels = {
    "general-chemistry-v1": "Custom Chemistry Quiz",
    "ionic-formula-v1": "Ionic Formula Quiz",
    "multiplication-practice-v1": "Multiplication Practice",
    "oxidation-numbers-v1": "Oxidation Numbers",
    "trig-angles-v1": "Trigonometric Angles",
    "units-and-dimensions-v1": "Units and Dimensions",
    "vocabulary-daily-v1": "Daily Vocabulary",
    "gre-vocabulary-v1": "Advanced Vocabulary"
  };

  function accountUrl() {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";
    return url.href;
  }

  function cleanAuthUrl() {
    if (!window.location.hash && !window.location.search) return;
    window.history.replaceState({}, document.title, accountUrl());
  }

  function setMessage(text = "", type = "info") {
    elements.message.textContent = text;
    elements.message.className = `account-message ${text ? type : ""}`.trim();
  }

  function setBusy(busy) {
    elements.authActions.forEach(button => {
      button.disabled = busy;
    });
  }

  function setMode(nextMode) {
    mode = nextMode === "signup" ? "signup" : "signin";
    const signingUp = mode === "signup";

    elements.modeButtons.forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    elements.displayNameGroup.hidden = !signingUp;
    elements.confirmPasswordGroup.hidden = !signingUp;
    elements.forgotPasswordButton.hidden = signingUp;
    elements.cardTitle.textContent = signingUp ? "Create your account" : "Welcome back";
    elements.cardSubtitle.textContent = signingUp
      ? "Save your learning progress and continue on another device."
      : "Sign in to load your saved learning progress.";
    elements.emailSubmitButton.textContent = signingUp ? "Create account" : "Sign in";
    elements.password.autocomplete = signingUp ? "new-password" : "current-password";
    elements.confirmPassword.required = signingUp;
    setMessage();
  }

  function userDisplayName(user) {
    const metadata = user?.user_metadata || {};
    return metadata.display_name || metadata.full_name || metadata.name || user?.email?.split("@")[0] || "Learner";
  }

  function showSignedOut() {
    recoveryMode = false;
    elements.authLoading.hidden = true;
    elements.recoveryView.hidden = true;
    elements.signedInView.hidden = true;
    elements.signedOutView.hidden = false;
  }

  function showRecovery() {
    recoveryMode = true;
    elements.authLoading.hidden = true;
    elements.signedOutView.hidden = true;
    elements.signedInView.hidden = true;
    elements.recoveryView.hidden = false;
    setMessage("Your recovery link is valid. Choose a new password.", "info");
  }

  function showSignedIn(user) {
    if (recoveryMode) return;

    const name = userDisplayName(user);
    elements.authLoading.hidden = true;
    elements.signedOutView.hidden = true;
    elements.recoveryView.hidden = true;
    elements.signedInView.hidden = false;
    elements.profileName.textContent = name;
    elements.profileEmail.textContent = user.email || "Google account";
    elements.profileAvatar.textContent = name.trim().charAt(0).toUpperCase() || "L";
    void refreshProgress();
  }

  function renderSession(session) {
    if (session?.user) showSignedIn(session.user);
    else showSignedOut();
  }

  function authValues() {
    return {
      displayName: elements.displayName.value.trim(),
      email: elements.email.value.trim(),
      password: elements.password.value,
      confirmPassword: elements.confirmPassword.value
    };
  }

  function validateEmailPassword(email, password) {
    if (!email || !elements.email.validity.valid) {
      setMessage("Enter a valid email address.", "error");
      elements.email.focus();
      return false;
    }

    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.", "error");
      elements.password.focus();
      return false;
    }

    return true;
  }

  async function submitEmailAuth(event) {
    event.preventDefault();
    const { displayName, email, password, confirmPassword } = authValues();
    if (!validateEmailPassword(email, password)) return;

    if (mode === "signup" && password !== confirmPassword) {
      setMessage("The two passwords do not match.", "error");
      elements.confirmPassword.focus();
      return;
    }

    setBusy(true);
    setMessage(mode === "signup" ? "Creating your account..." : "Signing you in...", "info");

    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: accountUrl()
          }
        });

        if (error) throw error;

        if (data.session) {
          setMessage("Your account is ready and you are signed in.", "success");
        } else {
          setMessage("Check your email and click the confirmation link to finish creating your account.", "success");
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage("Signed in successfully.", "success");
      }
    } catch (error) {
      setMessage(error?.message || "Could not complete the account request.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setMessage("Opening Google sign-in...", "info");

    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: accountUrl() }
    });

    if (error) {
      setBusy(false);
      setMessage(error.message, "error");
    }
  }

  async function requestPasswordReset() {
    const email = elements.email.value.trim();
    if (!email || !elements.email.validity.valid) {
      setMessage("Enter your email address first.", "error");
      elements.email.focus();
      return;
    }

    setBusy(true);
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: accountUrl()
      });
      if (error) throw error;
      setMessage("If an account exists for that address, a password reset email has been sent.", "success");
    } catch (error) {
      setMessage(error?.message || "Could not send the password reset email.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    const password = document.getElementById("newPassword").value;
    const confirmation = document.getElementById("newPasswordConfirm").value;

    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.", "error");
      return;
    }

    if (password !== confirmation) {
      setMessage("The two passwords do not match.", "error");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await client.auth.updateUser({ password });
      if (error) throw error;
      recoveryMode = false;
      showSignedIn(data.user);
      cleanAuthUrl();
      setMessage("Your password has been updated.", "success");
    } catch (error) {
      setMessage(error?.message || "Could not update your password.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setMessage("You are signed out.", "success");
    } catch (error) {
      setMessage(error?.message || "Could not sign out.", "error");
    } finally {
      setBusy(false);
    }
  }

  function createProgressItem(attempt) {
    const item = document.createElement("li");
    item.className = "progress-item";

    const title = document.createElement("strong");
    title.textContent = quizLabels[attempt.quiz_id] || attempt.quiz_id;

    const score = document.createElement("span");
    score.className = "progress-score";
    score.textContent = `${attempt.score}/${attempt.total}`;

    const date = document.createElement("span");
    date.className = "progress-date";
    date.textContent = new Date(attempt.completed_at).toLocaleString();

    item.append(title, score, date);
    return item;
  }

  async function refreshProgress() {
    if (!progressStore) return;
    const requestId = ++progressRequest;

    try {
      const attempts = await progressStore.listAttempts({ limit: 8 });
      if (requestId !== progressRequest) return;

      elements.progressList.replaceChildren(...attempts.map(createProgressItem));
      elements.progressList.hidden = attempts.length === 0;
      elements.progressEmpty.hidden = attempts.length > 0;
    } catch (error) {
      if (requestId === progressRequest) {
        setMessage(error?.message || "Could not load recent progress.", "error");
      }
    }
  }

  async function syncLocalProgress() {
    if (!progressStore) return;
    setBusy(true);
    setMessage("Syncing progress saved in this browser...", "info");

    try {
      const result = await progressStore.importLocalProgress();
      await refreshProgress();
      const stateNote = result.stateSkipped
        ? " Existing vocabulary mastery was preserved instead of overwriting a conflicting copy."
        : "";
      setMessage(
        `Sync complete. ${result.attemptCount} local attempt${result.attemptCount === 1 ? "" : "s"} processed and ${result.stateCount} activity state${result.stateCount === 1 ? "" : "s"} uploaded.${stateNote}`,
        "success"
      );
    } catch (error) {
      setMessage(error?.message || "Could not sync local progress.", "error");
    } finally {
      setBusy(false);
    }
  }

  function wireEvents() {
    elements.modeButtons.forEach(button => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    elements.authForm.addEventListener("submit", submitEmailAuth);
    elements.recoveryForm.addEventListener("submit", updatePassword);
    elements.googleButton.addEventListener("click", signInWithGoogle);
    elements.forgotPasswordButton.addEventListener("click", requestPasswordReset);
    elements.signOutButton.addEventListener("click", signOut);
    elements.syncProgressButton.addEventListener("click", syncLocalProgress);
    elements.refreshProgressButton.addEventListener("click", refreshProgress);
  }

  function showUrlError() {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const description = hashParams.get("error_description") || queryParams.get("error_description");
    if (description) setMessage(description, "error");
  }

  async function initialize() {
    wireEvents();
    setMode("signin");

    if (!configured) {
      elements.configurationNotice.hidden = false;
      elements.authLoading.hidden = true;
      elements.signedOutView.hidden = false;
      setBusy(true);
      setMessage("Add the Supabase Project URL and publishable key before testing sign-in.", "error");
      return;
    }

    showUrlError();

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") showRecovery();
      else renderSession(session);

      if (["INITIAL_SESSION", "SIGNED_IN", "PASSWORD_RECOVERY"].includes(event)) {
        window.setTimeout(cleanAuthUrl, 0);
      }
    });

    const { data, error } = await client.auth.getSession();
    if (error) {
      elements.authLoading.hidden = true;
      showSignedOut();
      setMessage(error.message, "error");
      return;
    }

    renderSession(data.session);
  }

  void initialize();
})();
