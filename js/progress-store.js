(() => {
  "use strict";

  const MULTIPLICATION_KEY = "multiplication_practice_history_v1";
  const OXIDATION_KEY = "oxidation_numbers_quiz_history_v1";
  const VOCABULARY_KEY = "sat_vocab_daily_quiz_v1";
  const ADVANCED_VOCABULARY_KEY = "gre_vocabulary_trainer_v1";
  let cachedUserId = null;

  function client() {
    if (!window.supabaseClient) {
      throw new Error("Supabase is not configured or could not be loaded.");
    }
    return window.supabaseClient;
  }

  function createAttemptId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();

    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function currentUser() {
    const { data, error } = await client().auth.getSession();
    if (error) throw error;
    cachedUserId = data.session?.user?.id || null;
    return data.session?.user || null;
  }

  function currentOwnerId() {
    return cachedUserId;
  }

  async function getCurrentUserId() {
    const user = await currentUser();
    return user?.id || null;
  }

  async function requireUser() {
    const user = await currentUser();
    if (!user) throw new Error("Sign in before saving progress to the cloud.");
    return user;
  }

  async function requireExpectedUser(expectedUserId) {
    const user = await requireUser();
    if (expectedUserId && user.id !== expectedUserId) {
      throw new Error("The signed-in account changed while progress was syncing.");
    }
    return user;
  }

  function boundedInteger(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return minimum;
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
  }

  function validIsoTimestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
  }

  function dateOnlyTimestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const timestamp = new Date(`${value}T12:00:00.000Z`);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
  }

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function hasMeaningfulVocabularyState(value) {
    return Boolean(
      value && (
        (Array.isArray(value.logs) && value.logs.length) ||
        Object.keys(value.progress || {}).length ||
        value.totalXP ||
        value.totalXp ||
        value.totalAnswered
      )
    );
  }

  function readLocalJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`Could not read ${key} from localStorage.`, error);
      return fallback;
    }
  }

  function writeLocalJson(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function claimLocalAttempt(clientAttemptId, userId) {
    if (!clientAttemptId || !userId) return;

    for (const key of [MULTIPLICATION_KEY, OXIDATION_KEY]) {
      const history = readLocalJson(key, []);
      if (!Array.isArray(history)) continue;

      let changed = false;
      history.forEach(entry => {
        if (
          entry.clientAttemptId === clientAttemptId &&
          (!entry.ownerId || entry.ownerId === userId) &&
          entry.ownerId !== userId
        ) {
          entry.ownerId = userId;
          changed = true;
        }
      });
      if (changed) writeLocalJson(key, history);
    }

    for (const key of [
      VOCABULARY_KEY,
      `${VOCABULARY_KEY}:${userId}`,
      ADVANCED_VOCABULARY_KEY,
      `${ADVANCED_VOCABULARY_KEY}:${userId}`
    ]) {
      const vocabulary = readLocalJson(key, null);
      if (!vocabulary || !Array.isArray(vocabulary.logs)) continue;

      const matchingLog = vocabulary.logs.find(log => log.clientAttemptId === clientAttemptId);
      if (matchingLog && (!matchingLog.ownerId || matchingLog.ownerId === userId)) {
        matchingLog.ownerId = userId;
        if (key.startsWith(ADVANCED_VOCABULARY_KEY)) matchingLog.cloudSaved = true;
        if (!vocabulary.ownerId || vocabulary.ownerId === userId) vocabulary.ownerId = userId;
        writeLocalJson(key, vocabulary);
      }
    }
  }

  async function recordAttempt({
    clientAttemptId = createAttemptId(),
    quizId,
    score,
    total,
    durationSeconds = null,
    details = {},
    completedAt = null,
    expectedUserId = null
  }) {
    if (!quizId || typeof quizId !== "string") throw new Error("A quizId is required.");
    if (!Number.isInteger(score) || !Number.isInteger(total) || total <= 0 || score < 0 || score > total) {
      throw new Error("Attempt scores must be whole numbers with 0 <= score <= total.");
    }

    let user;
    try {
      user = await currentUser();
    } catch (error) {
      console.warn("Cloud progress is unavailable.", error);
      return { saved: false, reason: "unavailable", clientAttemptId };
    }

    if (!user) return { saved: false, reason: "signed_out", clientAttemptId };
    if (expectedUserId && user.id !== expectedUserId) {
      return { saved: false, reason: "owner_changed", clientAttemptId };
    }

    const row = {
      client_attempt_id: clientAttemptId,
      user_id: user.id,
      quiz_id: quizId,
      score,
      total,
      duration_seconds: Number.isInteger(durationSeconds) && durationSeconds >= 0 ? durationSeconds : null,
      details: plainObject(details)
    };

    const timestamp = validIsoTimestamp(completedAt);
    if (timestamp) row.completed_at = timestamp;

    const { data, error } = await client()
      .from("quiz_attempts")
      .upsert(row, {
        onConflict: "user_id,client_attempt_id",
        ignoreDuplicates: true
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    if (expectedUserId) await requireExpectedUser(expectedUserId);
    claimLocalAttempt(clientAttemptId, user.id);
    return { saved: true, attempt: data, clientAttemptId, userId: user.id };
  }

  async function listAttempts({ quizId = null, limit = 20 } = {}) {
    const user = await currentUser();
    if (!user) return [];

    let query = client()
      .from("quiz_attempts")
      .select("id, quiz_id, score, total, duration_seconds, details, completed_at")
      .order("completed_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, Number(limit) || 20)));

    if (quizId) query = query.eq("quiz_id", quizId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function saveActivityState(activityId, state, expectedUserId = null) {
    const user = await currentUser();
    if (!user) return { saved: false, reason: "signed_out" };
    if (expectedUserId && user.id !== expectedUserId) return { saved: false, reason: "owner_changed" };

    const { error } = await client()
      .from("activity_state")
      .upsert(
        {
          user_id: user.id,
          activity_id: activityId,
          state: plainObject(state)
        },
        { onConflict: "user_id,activity_id" }
      );

    if (error) throw error;
    if (expectedUserId) await requireExpectedUser(expectedUserId);
    return { saved: true, userId: user.id };
  }

  async function loadActivityState(activityId, expectedUserId = null) {
    const user = await currentUser();
    if (!user) return null;
    if (expectedUserId && user.id !== expectedUserId) throw new Error("The signed-in account changed while progress was loading.");

    const { data, error } = await client()
      .from("activity_state")
      .select("state, updated_at")
      .eq("user_id", user.id)
      .eq("activity_id", activityId)
      .maybeSingle();

    if (error) throw error;
    if (expectedUserId) await requireExpectedUser(expectedUserId);
    return data ? { ...data, userId: user.id } : null;
  }

  async function deleteActivityState(activityId, expectedUserId = null) {
    if (!activityId || typeof activityId !== "string") throw new Error("An activityId is required.");
    const user = await requireUser();
    if (expectedUserId && user.id !== expectedUserId) return { deleted: false, reason: "owner_changed" };

    const { error: stateError } = await client()
      .from("activity_state")
      .delete()
      .eq("user_id", user.id)
      .eq("activity_id", activityId);
    if (stateError) throw stateError;

    if (expectedUserId) {
      const userAfterDelete = await currentUser();
      if (!userAfterDelete || userAfterDelete.id !== expectedUserId) {
        return { deleted: false, reason: "owner_changed" };
      }
    }

    return { deleted: true, userId: user.id };
  }

  function belongsToUserOrGuest(entry, userId) {
    return !entry.ownerId || entry.ownerId === userId;
  }

  function visibleLocalEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return cachedUserId
      ? entries.filter(entry => belongsToUserOrGuest(entry, cachedUserId))
      : entries.filter(entry => !entry.ownerId);
  }

  function otherOwnerEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return cachedUserId
      ? entries.filter(entry => entry.ownerId && entry.ownerId !== cachedUserId)
      : entries.filter(entry => Boolean(entry.ownerId));
  }

  function multiplicationRows(history, userId) {
    return history.filter(entry => belongsToUserOrGuest(entry, userId)).flatMap(entry => {
      const total = boundedInteger(entry.count, 0, 10000);
      if (!total) return [];

      entry.clientAttemptId ||= createAttemptId();
      entry.completedAt = validIsoTimestamp(entry.completedAt) || new Date().toISOString();
      const accuracy = Math.min(100, Math.max(0, Number(entry.accuracy) || 0));
      const row = {
        client_attempt_id: entry.clientAttemptId,
        user_id: userId,
        quiz_id: "multiplication-practice-v1",
        score: boundedInteger((accuracy / 100) * total, 0, total),
        total,
        duration_seconds: null,
        completed_at: entry.completedAt,
        details: {
          averageSeconds: Number(entry.speed) || null,
          accuracyPercent: accuracy,
          bestStreak: boundedInteger(entry.bestStreak, 0, 10000),
          originalLocalDate: entry.date || null,
          importedFromLocalStorage: true
        }
      };

      return [row];
    });
  }

  function oxidationRows(history, userId) {
    return history.filter(entry => belongsToUserOrGuest(entry, userId)).flatMap(entry => {
      const total = boundedInteger(entry.total, 0, 10000);
      if (!total) return [];

      entry.clientAttemptId ||= createAttemptId();
      entry.completedAt = validIsoTimestamp(entry.completedAt) || new Date().toISOString();
      const row = {
        client_attempt_id: entry.clientAttemptId,
        user_id: userId,
        quiz_id: "oxidation-numbers-v1",
        score: boundedInteger(entry.score, 0, total),
        total,
        duration_seconds: null,
        completed_at: entry.completedAt,
        details: {
          percent: boundedInteger(entry.percent, 0, 100),
          difficulty: entry.filter || "all",
          originalLocalDate: entry.date || null,
          importedFromLocalStorage: true
        }
      };

      return [row];
    });
  }

  function vocabularyRows(state, userId) {
    if (state.ownerId && state.ownerId !== userId) return [];
    if (!Array.isArray(state.logs)) return [];

    return state.logs.filter(log => belongsToUserOrGuest(log, userId)).flatMap(log => {
      const total = boundedInteger(log.total, 0, 10000);
      if (!total) return [];

      log.clientAttemptId ||= createAttemptId();
      log.completedAt = validIsoTimestamp(log.completedAt) || dateOnlyTimestamp(log.date) || new Date().toISOString();
      const row = {
        client_attempt_id: log.clientAttemptId,
        user_id: userId,
        quiz_id: "vocabulary-daily-v1",
        score: boundedInteger(log.score, 0, total),
        total,
        duration_seconds: null,
        completed_at: log.completedAt,
        details: {
          mode: log.mode || "Daily",
          xp: boundedInteger(log.xp, 0, 1000000),
          answeredCount: boundedInteger(log.answeredCount ?? log.total, 0, total),
          endedEarly: Boolean(log.endedEarly),
          wrongWords: Array.isArray(log.wrong) ? log.wrong : [],
          importedFromLocalStorage: true
        }
      };

      return [row];
    });
  }

  function advancedVocabularyRows(state, userId) {
    if (state.ownerId && state.ownerId !== userId) return [];
    if (!Array.isArray(state.logs)) return [];

    return state.logs.filter(log => belongsToUserOrGuest(log, userId)).flatMap(log => {
      const total = boundedInteger(log.total, 0, 10000);
      if (!total) return [];

      log.clientAttemptId ||= createAttemptId();
      log.completedAt = validIsoTimestamp(log.completedAt) || dateOnlyTimestamp(log.date) || new Date().toISOString();
      return [{
        client_attempt_id: log.clientAttemptId,
        user_id: userId,
        quiz_id: "gre-vocabulary-v1",
        score: boundedInteger(log.score, 0, total),
        total,
        duration_seconds: boundedInteger(log.durationSeconds, 0, 86400) || null,
        completed_at: log.completedAt,
        details: {
          mode: log.mode || "mixed",
          xp: boundedInteger(log.xp, 0, 1000000),
          bestCombo: boundedInteger(log.bestCombo, 0, 10000),
          endedEarly: Boolean(log.endedEarly),
          wrongWords: Array.isArray(log.mistakes) ? log.mistakes : [],
          importedFromLocalStorage: true
        }
      }];
    });
  }

  async function mergeAdditionalVocabularyState({ localKey, activityId, rawState, userId }) {
    const localState = plainObject(rawState);
    const belongsToUser = !localState.ownerId || localState.ownerId === userId;
    const perUserKey = `${localKey}:${userId}`;
    const existingUserState = plainObject(readLocalJson(perUserKey, null));
    const hasExistingUserState = hasMeaningfulVocabularyState(existingUserState);
    const hasGuestState = belongsToUser && hasMeaningfulVocabularyState(localState);

    if (!hasExistingUserState && !hasGuestState) {
      if (rawState && typeof rawState === "object") writeLocalJson(localKey, localState);
      return { stateCount: 0, stateSkipped: 0 };
    }

    const remote = await loadActivityState(activityId, userId);
    const remoteUpdatedAt = Date.parse(remote?.updated_at || "") || 0;
    const existingUpdatedAt = Date.parse(existingUserState.localUpdatedAt || "") || 0;
    let stateForUser = null;
    let stateCount = 0;
    let stateSkipped = 0;

    if (hasExistingUserState) {
      existingUserState.ownerId = userId;
      if (!remote) {
        const result = await saveActivityState(activityId, existingUserState, userId);
        stateCount = result.saved ? 1 : 0;
        stateForUser = existingUserState;
      } else if (!existingUpdatedAt) {
        stateForUser = existingUserState;
        stateSkipped = 1;
      } else if (existingUpdatedAt > remoteUpdatedAt) {
        const result = await saveActivityState(activityId, existingUserState, userId);
        stateCount = result.saved ? 1 : 0;
        stateForUser = existingUserState;
      } else {
        stateForUser = {
          ...remote.state,
          ownerId: userId,
          localUpdatedAt: remote.state.localUpdatedAt || remote.updated_at
        };
      }
      if (hasGuestState) stateSkipped = 1;
    } else if (remote) {
      stateForUser = {
        ...remote.state,
        ownerId: userId,
        localUpdatedAt: remote.state.localUpdatedAt || remote.updated_at
      };
      stateSkipped = 1;
    } else {
      localState.ownerId = userId;
      const result = await saveActivityState(activityId, localState, userId);
      stateCount = result.saved ? 1 : 0;
      stateForUser = localState;
    }

    if (stateForUser) {
      await requireExpectedUser(userId);
      writeLocalJson(perUserKey, stateForUser);
      if (hasGuestState && stateSkipped) writeLocalJson(`${localKey}:guest-imported:${userId}`, localState);
      if (belongsToUser) window.localStorage.removeItem(localKey);
    }

    return { stateCount, stateSkipped };
  }

  async function importLocalProgress() {
    const user = await requireUser();
    const multiplication = readLocalJson(MULTIPLICATION_KEY, []);
    const oxidation = readLocalJson(OXIDATION_KEY, []);
    const vocabulary = readLocalJson(VOCABULARY_KEY, null);
    const advancedVocabulary = readLocalJson(ADVANCED_VOCABULARY_KEY, null);
    const advancedUserKey = `${ADVANCED_VOCABULARY_KEY}:${user.id}`;
    const advancedUserVocabulary = readLocalJson(advancedUserKey, null);

    const multiplicationHistory = Array.isArray(multiplication) ? multiplication : [];
    const oxidationHistory = Array.isArray(oxidation) ? oxidation : [];
    const vocabularyState = plainObject(vocabulary);
    const advancedVocabularyState = plainObject(advancedVocabulary);
    const advancedUserVocabularyState = plainObject(advancedUserVocabulary);
    const vocabularyBelongsToUser = !vocabularyState.ownerId || vocabularyState.ownerId === user.id;
    const advancedVocabularyBelongsToUser = !advancedVocabularyState.ownerId || advancedVocabularyState.ownerId === user.id;

    const candidateAttempts = [
      ...multiplicationRows(multiplicationHistory, user.id),
      ...oxidationRows(oxidationHistory, user.id),
      ...vocabularyRows(vocabularyState, user.id),
      ...advancedVocabularyRows(advancedVocabularyState, user.id),
      ...advancedVocabularyRows(advancedUserVocabularyState, user.id)
    ];
    const attempts = [...new Map(candidateAttempts.map(row => [row.client_attempt_id, row])).values()];

    writeLocalJson(MULTIPLICATION_KEY, multiplicationHistory);
    writeLocalJson(OXIDATION_KEY, oxidationHistory);
    if (vocabulary && typeof vocabulary === "object") writeLocalJson(VOCABULARY_KEY, vocabularyState);
    if (advancedVocabulary && typeof advancedVocabulary === "object") writeLocalJson(ADVANCED_VOCABULARY_KEY, advancedVocabularyState);

    if (attempts.length) {
      const { error } = await client()
        .from("quiz_attempts")
        .upsert(attempts, {
          onConflict: "user_id,client_attempt_id",
          ignoreDuplicates: true
        });
      if (error) throw error;
      await requireExpectedUser(user.id);

      multiplicationHistory
        .filter(entry => belongsToUserOrGuest(entry, user.id))
        .forEach(entry => { entry.ownerId = user.id; });
      oxidationHistory
        .filter(entry => belongsToUserOrGuest(entry, user.id))
        .forEach(entry => { entry.ownerId = user.id; });
      if (vocabularyBelongsToUser && Array.isArray(vocabularyState.logs)) {
        vocabularyState.logs
          .filter(log => belongsToUserOrGuest(log, user.id))
          .forEach(log => { log.ownerId = user.id; });
      }
      if (advancedVocabularyBelongsToUser && Array.isArray(advancedVocabularyState.logs)) {
        advancedVocabularyState.logs
          .filter(log => belongsToUserOrGuest(log, user.id))
          .forEach(log => { log.ownerId = user.id; log.cloudSaved = true; });
      }
      if (Array.isArray(advancedUserVocabularyState.logs)) {
        advancedUserVocabularyState.logs
          .filter(log => belongsToUserOrGuest(log, user.id))
          .forEach(log => { log.ownerId = user.id; log.cloudSaved = true; });
        writeLocalJson(advancedUserKey, advancedUserVocabularyState);
      }
    }

    let stateCount = 0;
    let stateSkipped = 0;
    let vocabularyStateForUser = null;
    const perUserKey = `${VOCABULARY_KEY}:${user.id}`;
    const existingUserState = plainObject(readLocalJson(perUserKey, null));
    const hasExistingUserState = hasMeaningfulVocabularyState(existingUserState);
    const hasGuestState = vocabularyBelongsToUser && hasMeaningfulVocabularyState(vocabularyState);

    if (hasExistingUserState || hasGuestState) {
      const remote = await loadActivityState("vocabulary-daily-v1", user.id);
      const remoteUpdatedAt = Date.parse(remote?.updated_at || "") || 0;
      const existingUpdatedAt = Date.parse(existingUserState.localUpdatedAt || "") || 0;

      if (hasExistingUserState) {
        existingUserState.ownerId = user.id;

        if (!remote) {
          const result = await saveActivityState("vocabulary-daily-v1", existingUserState, user.id);
          stateCount = result.saved ? 1 : 0;
          vocabularyStateForUser = existingUserState;
        } else if (!existingUpdatedAt) {
          // An undated local state cannot be compared safely. Preserve it
          // locally and leave the remote state unchanged.
          vocabularyStateForUser = existingUserState;
          stateSkipped = 1;
        } else if (existingUpdatedAt > remoteUpdatedAt) {
          const result = await saveActivityState("vocabulary-daily-v1", existingUserState, user.id);
          stateCount = result.saved ? 1 : 0;
          vocabularyStateForUser = existingUserState;
        } else {
          vocabularyStateForUser = {
            ...remote.state,
            ownerId: user.id,
            localUpdatedAt: remote.state.localUpdatedAt || remote.updated_at
          };
        }

        if (hasGuestState) stateSkipped = 1;
      } else if (remote) {
        vocabularyStateForUser = {
          ...remote.state,
          ownerId: user.id,
          localUpdatedAt: remote.state.localUpdatedAt || remote.updated_at
        };
        stateSkipped = 1;
      } else {
        vocabularyState.ownerId = user.id;
        const result = await saveActivityState("vocabulary-daily-v1", vocabularyState, user.id);
        stateCount = result.saved ? 1 : 0;
        vocabularyStateForUser = vocabularyState;
      }
    }

    await requireExpectedUser(user.id);
    writeLocalJson(MULTIPLICATION_KEY, multiplicationHistory);
    writeLocalJson(OXIDATION_KEY, oxidationHistory);
    if (vocabularyStateForUser) {
      writeLocalJson(perUserKey, vocabularyStateForUser);
      if (hasGuestState && stateSkipped) {
        writeLocalJson(`${VOCABULARY_KEY}:guest-imported:${user.id}`, vocabularyState);
      }
      if (vocabularyBelongsToUser) window.localStorage.removeItem(VOCABULARY_KEY);
    } else if (vocabulary && typeof vocabulary === "object") {
      writeLocalJson(VOCABULARY_KEY, vocabularyState);
    }

    const advancedMerge = await mergeAdditionalVocabularyState({
      localKey: ADVANCED_VOCABULARY_KEY,
      activityId: "gre-vocabulary-v1",
      rawState: advancedVocabulary,
      userId: user.id
    });
    stateCount += advancedMerge.stateCount;
    stateSkipped += advancedMerge.stateSkipped;

    await requireExpectedUser(user.id);
    return { attemptCount: attempts.length, stateCount, stateSkipped };
  }

  function subscribeToOwnerChanges(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("An owner-change callback is required.");
    }
    if (!window.supabaseClient?.auth?.onAuthStateChange) return () => {};

    const { data } = client().auth.onAuthStateChange((event, session) => {
      cachedUserId = session?.user?.id || null;
      callback(cachedUserId, event);
    });

    return () => data?.subscription?.unsubscribe();
  }

  if (window.supabaseClient) {
    void window.supabaseClient.auth.getSession().then(({ data }) => {
      cachedUserId = data.session?.user?.id || null;
    }).catch(() => {
      cachedUserId = null;
    });
    window.supabaseClient.auth.onAuthStateChange((_event, session) => {
      cachedUserId = session?.user?.id || null;
    });
  }

  window.ProgressStore = Object.freeze({
    createAttemptId,
    currentOwnerId,
    getCurrentUserId,
    visibleLocalEntries,
    otherOwnerEntries,
    recordAttempt,
    listAttempts,
    saveActivityState,
    loadActivityState,
    deleteActivityState,
    importLocalProgress,
    subscribeToOwnerChanges
  });
})();
