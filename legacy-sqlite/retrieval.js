// Simple vector-similarity retrieval over the `documents` table.
//
// Each text is turned into a sparse TF-IDF vector (one dimension per word);
// the document whose vector points in the most similar direction to the
// query's (cosine similarity) is the best match. No external services needed.

const { db } = require("./db");
const { EMBEDDING_MODEL, embedTexts, blobToVector } = require("./embeddings");

const STOPWORDS = new Set(
  ("a an and are as at be but by can do does for from has have how i if in is it its " +
    "me my of on or our so that the their them then there these they this to us was we " +
    "much many what when where which who why will with would you your").split(" ")
);

// Word vectors only match identical words, so everyday wording like "cost"
// would never find a document that says "premium". This small map folds a few
// common synonyms together. Real embeddings would remove the need for it.
const SYNONYMS = {
  cost: "premium", price: "premium", pricing: "premium", fee: "premium",
  pay: "premium", charge: "premium", plan: "tier",
};

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((word) => !STOPWORDS.has(word))
    .map((word) => SYNONYMS[word] ?? word)
    // Crude plural folding so "claims" matches "claim", "gnomes" matches "gnome".
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

function termCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function cosine(a, b) {
  let dot = 0;
  for (const [term, weight] of a) {
    const other = b.get(term);
    if (other) dot += weight * other;
  }
  const norm = (v) => Math.sqrt([...v.values()].reduce((sum, w) => sum + w * w, 0));
  const denominator = norm(a) * norm(b);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Returns the most relevant document for `query` as
 * { id, title, content, score }, or null if nothing shares any meaningful
 * words with the query.
 *
 * The index is rebuilt on every call: with a handful of documents this is
 * instantaneous and means re-running the ingest script takes effect at once.
 */
function findMostRelevantDocument(query) {
  const docs = db.prepare("SELECT id, title, content FROM documents").all();
  if (docs.length === 0) return null;

  const docTerms = docs.map((doc) => termCounts(tokenize(`${doc.title} ${doc.content}`)));

  // Inverse document frequency: words that appear in fewer documents count more.
  const idf = new Map();
  for (const terms of docTerms) {
    for (const term of terms.keys()) idf.set(term, (idf.get(term) || 0) + 1);
  }
  for (const [term, df] of idf) idf.set(term, Math.log((1 + docs.length) / (1 + df)) + 1);

  const toVector = (counts) =>
    new Map([...counts].map(([term, tf]) => [term, tf * (idf.get(term) ?? 0)]));

  const queryVector = toVector(termCounts(tokenize(query)));

  let best = null;
  docs.forEach((doc, i) => {
    const score = cosine(queryVector, toVector(docTerms[i]));
    if (score > 0 && (!best || score > best.score)) best = { ...doc, score };
  });
  return best;
}

/**
 * Like findMostRelevantDocument, but aware of the conversation so far.
 * Returns up to two documents (best first, no duplicates).
 *
 * A follow-up such as "what about vandalism?" or "how much is it per year?"
 * may be about a new topic or about the one just discussed, and a keyword
 * search can't tell which. So both readings are searched:
 *   1. the new message on its own (covers a change of topic), and
 *   2. the new message plus the user's last two earlier questions (covers a
 *      follow-up that leans on the earlier topic).
 * Claude is given both documents and works out which applies.
 */
function findRelevantDocuments(message, history = []) {
  const found = [];
  const direct = findMostRelevantDocument(message);
  if (direct) found.push(direct);

  const earlierQuestions = history
    .filter((m) => m.role === "user")
    .slice(-2)
    .map((m) => m.content);
  if (earlierQuestions.length > 0) {
    const withContext = findMostRelevantDocument([message, ...earlierQuestions].join("\n"));
    if (withContext && !found.some((doc) => doc.id === withContext.id)) found.push(withContext);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Embedding retrieval over the `chunks` table (used by /api/chat).
// ---------------------------------------------------------------------------

const TOP_CHUNKS = 4; // how many chunks are handed to Claude
// Cosine scores here: on-topic questions score 0.6-0.7 for their best chunks,
// an off-topic one ("capital of France") about 0.35. Below the floor = noise.
const MIN_SIMILARITY = 0.45;

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function normalize(vector) {
  const length = Math.sqrt(dot(vector, vector)) || 1;
  return vector.map((x) => x / length);
}

/**
 * Finds the chunks closest in meaning to `message`, best first, as
 * [{ title, content, score }] (title is the chunk's document).
 *
 * The message is embedded and compared with every stored chunk vector by
 * cosine similarity. As with the keyword search, a follow-up may lean on the
 * earlier topic, so the message is also searched together with the user's last
 * two earlier questions; each chunk keeps the better of its two scores. Both
 * queries go out in a single API request.
 *
 * Throws if the embedding API fails; the caller decides how to cope.
 */
async function findRelevantChunks(message, history = []) {
  return (await searchKnowledgeBase(message, history)).chunks;
}

// How many of the user's earlier questions are compared when checking whether
// they are asking the same thing again.
const REPEAT_WINDOW = 6;

/**
 * findRelevantChunks plus two signals the escalation checks need:
 *   chunks            the closest chunks, as above
 *   bestScore         similarity of the closest chunk, counting the better of the
 *                     message alone and message-plus-earlier-questions (0 if none
 *                     was close enough)
 *   aloneScore        similarity of the closest chunk to the message ALONE. For a
 *                     self-contained question this is the honest confidence: the
 *                     earlier-questions query can make an unanswerable question
 *                     look well matched just because the topic is the same.
 *   repeatSimilarity  how similar the message is to the most similar of the
 *                     user's earlier questions in this conversation (0 if none)
 * The earlier questions are embedded in the same single API request as the
 * search queries, so the repeat check costs no extra call.
 */
async function searchKnowledgeBase(message, history = []) {
  const userQuestions = history.filter((m) => m.role === "user").map((m) => m.content);
  const earlierQuestions = userQuestions.slice(-2);
  const queries = [message];
  if (earlierQuestions.length > 0) queries.push([message, ...earlierQuestions].join("\n"));
  const compareWith = userQuestions.slice(-REPEAT_WINDOW);

  // retries: 0 so a rate-limited chat request fails fast instead of waiting.
  const vectors = (await embedTexts([...queries, ...compareWith], "query", { retries: 0 })).map(normalize);
  const queryVectors = vectors.slice(0, queries.length);
  const earlierVectors = vectors.slice(queries.length);
  const repeatSimilarity = earlierVectors.length
    ? Math.max(...earlierVectors.map((v) => dot(queryVectors[0], v)))
    : 0;

  const rows = db
    .prepare(
      `SELECT c.content, c.embedding, d.title
       FROM chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.embedding_model = ?
       ORDER BY c.document_id, c.chunk_index`
    )
    .all(EMBEDDING_MODEL);

  let aloneScore = 0;
  const chunks = rows
    .map((row) => {
      const vector = normalize(blobToVector(row.embedding));
      aloneScore = Math.max(aloneScore, dot(queryVectors[0], vector));
      const score = Math.max(...queryVectors.map((q) => dot(q, vector)));
      return { title: row.title, content: row.content, score };
    })
    .filter((chunk) => chunk.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_CHUNKS);

  return {
    chunks,
    bestScore: chunks.length ? chunks[0].score : 0,
    aloneScore,
    repeatSimilarity,
  };
}

module.exports = {
  findMostRelevantDocument, findRelevantDocuments, findRelevantChunks, searchKnowledgeBase,
};
