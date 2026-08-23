const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bankPath = path.join(
  root,
  "assets",
  "data",
  "question_banks",
  "maths_vectors_matrices.json"
);
const enginePath = path.join(root, "js", "maths-vector-quiz.js");
const indexPath = path.join(root, "index.html");
const hubPath = path.join(root, "quizzes", "vectors_skill_builder.html");
const accountPath = path.join(root, "js", "account.js");
const scoresPath = path.join(root, "js", "scores.js");

const expected = [
  {
    file: "vector_addition_quiz_v1.html",
    topicId: "vector-addition",
    quizId: "vector-addition-v1",
    bankSize: 10,
    quizSize: 5
  },
  {
    file: "vector_subtraction_quiz_v1.html",
    topicId: "vector-subtraction",
    quizId: "vector-subtraction-v1",
    bankSize: 10,
    quizSize: 5
  },
  {
    file: "dot_product_quiz_v1.html",
    topicId: "dot-product",
    quizId: "dot-product-v1",
    bankSize: 10,
    quizSize: 5
  },
  {
    file: "determinants_2x2_quiz_v1.html",
    topicId: "determinants",
    quizId: "determinants-2x2-v1",
    bankSize: 10,
    quizSize: 5
  },
  {
    file: "cross_product_quiz_v1.html",
    topicId: "cross-product",
    quizId: "cross-product-v1",
    bankSize: 20,
    quizSize: 10
  },
  {
    file: "vector_resolution_quiz_v1.html",
    topicId: "vector-resolution",
    quizId: "vector-resolution-v1",
    bankSize: 20,
    quizSize: 10
  },
  {
    file: "vector_magnitude_quiz_v1.html",
    topicId: "vector-magnitude",
    quizId: "vector-magnitude-v1",
    bankSize: 20,
    quizSize: 10
  }
];

const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const engine = fs.readFileSync(enginePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const hub = fs.readFileSync(hubPath, "utf8");
const account = fs.readFileSync(accountPath, "utf8");
const scores = fs.readFileSync(scoresPath, "utf8");
const engineIds = [
  ...engine.matchAll(/getElementById\("([^"]+)"\)/g)
].map(match => match[1]);

assert.equal(bank.length, expected.length, "Unexpected number of quiz topics.");
assert.match(
  engine,
  /shuffle\(topic\.questions\)[\s\S]*?slice\(0, topic\.questionCount\)/,
  "Questions must be shuffled before sampling."
);
assert.match(
  engine,
  /options:\s*shuffle\(question\.options\)/,
  "Answer choices must be shuffled for every sampled question."
);
assert.ok(index.includes('href="quizzes/vectors_skill_builder.html"'), "Maths must link to the skill-builder hub.");
assert.ok(hub.includes("Vectors Skill Builder"), "The skill-builder hub is missing its title.");

const questionIds = new Set();
let totalQuestions = 0;

for (const config of expected) {
  const topic = bank.find(item => item.id === config.topicId);
  assert.ok(topic, "Missing topic: " + config.topicId);
  assert.equal(topic.quizId, config.quizId, "Unexpected quiz ID for " + config.topicId);
  assert.equal(topic.questionCount, config.quizSize, "Unexpected quiz size for " + config.topicId);
  assert.equal(topic.questions.length, config.bankSize, "Unexpected bank size for " + config.topicId);

  for (const question of topic.questions) {
    totalQuestions += 1;
    assert.ok(!questionIds.has(question.id), "Duplicate question ID: " + question.id);
    questionIds.add(question.id);
    assert.equal(question.options.length, 4, question.id + " must have four options.");
    assert.equal(new Set(question.options).size, 4, question.id + " has duplicate options.");
    assert.ok(question.options.includes(question.answer), question.id + " answer is not an option.");
    assert.ok(question.explanation, question.id + " is missing an explanation.");
    assert.ok(["easy", "medium", "hard"].includes(question.difficulty), question.id + " has invalid difficulty.");
  }

  const pagePath = path.join(root, "quizzes", config.file);
  const html = fs.readFileSync(pagePath, "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicateIds = ids.filter((id, indexOfId) => ids.indexOf(id) !== indexOfId);
  const missingIds = engineIds.filter(id => !ids.includes(id));

  assert.deepEqual(duplicateIds, [], config.file + " has duplicate HTML IDs.");
  assert.deepEqual(missingIds, [], config.file + " is missing engine IDs.");
  assert.match(
    html,
    new RegExp('data-quiz-topic="' + config.topicId + '"'),
    config.file + " has the wrong topic ID."
  );
  assert.ok(
    html.includes("Question 1 of " + config.quizSize),
    config.file + " has the wrong initial question count."
  );
  assert.ok(
    html.includes("0/" + config.quizSize),
    config.file + " has the wrong initial score count."
  );
  assert.ok(hub.includes('href="' + config.file + '"'), config.file + " is not linked from the hub.");
  assert.ok(html.includes('href="vectors_skill_builder.html"'), config.file + " does not link back to the hub.");
  assert.ok(!html.includes("How it works"), config.file + " still contains explanatory filler.");
  assert.ok(!html.includes("Question bank"), config.file + " still exposes the question bank.");
  assert.ok(account.includes('"' + config.quizId + '"'), config.quizId + " is missing from account labels.");
  assert.ok(scores.includes('"' + config.quizId + '"'), config.quizId + " is missing from score labels.");

  const localAssets = [
    ...html.matchAll(/(?:src|href)="(\.\.\/[^"]+)"/g)
  ]
    .map(match => match[1])
    .filter(reference => !reference.includes("index.html"));

  for (const reference of localAssets) {
    const assetPath = path.resolve(path.dirname(pagePath), reference);
    assert.ok(fs.existsSync(assetPath), config.file + " is missing asset " + reference);
  }
}

assert.equal(totalQuestions, 100, "The combined bank must contain 100 questions.");

const removedConceptPrompts = [
  "Which statement is true for all vectors",
  "Which expression is always equivalent",
  "which conclusion must be true",
  "What does this tell you about the angle",
  "Which matrix is singular",
  "after its two rows are interchanged",
  "When does A =",
  "Which identity correctly states",
  "Which vector is normal to the plane"
];
const serializedBank = JSON.stringify(bank);
for (const prompt of removedConceptPrompts) {
  assert.ok(!serializedBank.includes(prompt), "Concept-only prompt remains: " + prompt);
}

console.log(
  "Maths vector quiz validation passed: 1 hub, 7 pages, 100 direct-practice questions, " +
  engineIds.length +
  " shared DOM bindings, randomized sampling, shuffled options, links, and score labels."
);
