"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const bankPath = path.join(root, "assets", "data", "advanced-vocabulary-bank.js");
const source = fs.readFileSync(bankPath, "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: bankPath });

const bank = sandbox.window.PALLADIUM_ADVANCED_VOCABULARY;
const errors = [];
const allowedParts = new Set(["adjective", "noun", "verb", "adverb"]);

if (!Array.isArray(bank)) {
  errors.push("The data file did not expose an array.");
} else {
  if (bank.length !== 300) errors.push(`Expected exactly 300 records; found ${bank.length}.`);

  const ids = new Set();
  const words = new Set();
  const bands = new Map([[1, 0], [2, 0], [3, 0]]);

  bank.forEach((entry, index) => {
    const label = entry?.word || `record ${index + 1}`;
    if (!entry || typeof entry !== "object") {
      errors.push(`Record ${index + 1} is not an object.`);
      return;
    }

    if (!entry.id || ids.has(entry.id)) errors.push(`${label}: missing or duplicate id.`);
    ids.add(entry.id);

    const normalisedWord = String(entry.word || "").trim().toLowerCase();
    if (!normalisedWord || words.has(normalisedWord)) errors.push(`${label}: missing or duplicate word.`);
    words.add(normalisedWord);

    if (!allowedParts.has(entry.partOfSpeech)) errors.push(`${label}: invalid part of speech.`);
    if (!bands.has(entry.difficulty)) errors.push(`${label}: difficulty must be 1, 2, or 3.`);
    else bands.set(entry.difficulty, bands.get(entry.difficulty) + 1);

    if (typeof entry.definition !== "string" || entry.definition.trim().length < 8) {
      errors.push(`${label}: definition is missing or too short.`);
    }

    for (const field of ["synonyms", "antonyms"]) {
      const values = entry[field];
      if (!Array.isArray(values) || values.length < (field === "synonyms" ? 2 : 1)) {
        errors.push(`${label}: ${field} is incomplete.`);
        continue;
      }
      const uniqueValues = new Set(values.map(value => String(value).trim().toLowerCase()));
      if (uniqueValues.size !== values.length || uniqueValues.has(normalisedWord)) {
        errors.push(`${label}: ${field} contains duplicates or the target word.`);
      }
    }

    if (typeof entry.example !== "string" || !entry.example.toLowerCase().includes(normalisedWord)) {
      errors.push(`${label}: example must contain the exact lemma.`);
    }

    const clozeMarkers = typeof entry.cloze === "string" ? (entry.cloze.match(/_____/g) || []).length : 0;
    if (clozeMarkers !== 1) errors.push(`${label}: cloze must contain exactly one _____ marker.`);
    if (typeof entry.cloze === "string" && entry.cloze.toLowerCase().includes(normalisedWord)) {
      errors.push(`${label}: cloze still exposes the target word.`);
    }
  });

  for (const [difficulty, count] of bands) {
    if (count !== 100) errors.push(`Difficulty ${difficulty} must contain 100 words; found ${count}.`);
  }

  function distractors(target, selector, exclusions = []) {
    const forbidden = new Set(
      [selector(target), ...exclusions].filter(Boolean).map(value => String(value).trim().toLowerCase())
    );
    const candidates = [
      ...bank.filter(candidate => (
      candidate.id !== target.id &&
      (!target.confusableGroup || candidate.confusableGroup !== target.confusableGroup) &&
      candidate.partOfSpeech === target.partOfSpeech &&
        Math.abs(candidate.difficulty - target.difficulty) <= 1
      )),
      ...bank.filter(candidate => (
        candidate.id !== target.id &&
        (!target.confusableGroup || candidate.confusableGroup !== target.confusableGroup)
      ))
    ];
    const result = [];
    for (const candidate of candidates) {
      const value = selector(candidate);
      const normalised = String(value || "").trim().toLowerCase();
      if (!normalised || forbidden.has(normalised)) continue;
      forbidden.add(normalised);
      result.push(value);
      if (result.length === 3) break;
    }
    return result;
  }

  bank.forEach(word => {
    const overlap = word.synonyms.filter(synonym => (
      word.antonyms.some(antonym => antonym.toLowerCase() === synonym.toLowerCase())
    ));
    if (overlap.length) errors.push(`${word.word}: synonym and antonym overlap.`);

    const questionTypes = [
      ["meaning", word.definition, candidate => candidate.definition, []],
      ["synonym", word.synonyms[0], candidate => candidate.synonyms[0], [...word.synonyms, ...word.antonyms, word.word]],
      ["context", word.word, candidate => candidate.word, [...word.synonyms, ...word.antonyms]]
    ];
    if (word.antonymEligible !== false) {
      questionTypes.push(["antonym", word.antonyms[0], candidate => candidate.antonyms[0], [...word.synonyms, ...word.antonyms, word.word]]);
    }

    questionTypes.forEach(([type, answer, selector, exclusions]) => {
      const choices = [answer, ...distractors(word, selector, exclusions)];
      const uniqueChoices = new Set(choices.map(choice => String(choice).trim().toLowerCase()));
      if (choices.length !== 4 || uniqueChoices.size !== 4) {
        errors.push(`${word.word}: ${type} cannot produce four unique choices.`);
      }
    });
  });
}

if (errors.length) {
  console.error(`Advanced vocabulary bank validation failed with ${errors.length} issue(s):`);
  errors.slice(0, 50).forEach(error => console.error(`- ${error}`));
  if (errors.length > 50) console.error(`- …and ${errors.length - 50} more.`);
  process.exit(1);
}

const distribution = bank.reduce((result, entry) => {
  result[entry.partOfSpeech] = (result[entry.partOfSpeech] || 0) + 1;
  return result;
}, {});

console.log(`Advanced vocabulary bank valid: ${bank.length} unique words; 100 per difficulty band.`);
console.log(`Parts of speech: ${Object.entries(distribution).map(([part, count]) => `${part}=${count}`).join(", ")}.`);
