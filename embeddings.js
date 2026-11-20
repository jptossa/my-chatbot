// Turns text into embedding vectors with Voyage AI, the embeddings provider
// Anthropic recommends (Anthropic itself doesn't offer an embeddings model).
//
// voyage-3.5-lite: 1024 dimensions, strong retrieval quality, low price, and
// Voyage's free tier covers far more than this project's few documents.
// Needs VOYAGE_API_KEY in .env (create one at https://dash.voyageai.com).

const EMBEDDING_MODEL = "voyage-3.5-lite";
const API_URL = process.env.VOYAGE_API_URL || "https://api.voyageai.com/v1/embeddings";
const RETRY_WAIT_MS = Number(process.env.VOYAGE_RETRY_WAIT_MS) || 21000;
const BATCH_SIZE = 64; // texts per request; the API allows up to 1000

/**
 * Embeds an array of texts. `inputType` is "document" for text being stored
 * and "query" for a user's question; Voyage tunes the vector for each.
 * Returns one Float32Array per text, in the same order.
 */
async function embedTexts(texts, inputType = "document", { retries = 3 } = {}) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VOYAGE_API_KEY. Add it to your .env file (see .env.example).");
  }

  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const body = JSON.stringify({
      input: texts.slice(i, i + BATCH_SIZE),
      model: EMBEDDING_MODEL,
      input_type: inputType,
    });
    // Accounts without a payment method are limited to 3 requests a minute,
    // so on a 429 wait and try again a few times before giving up.
    let res;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
      });
      if (res.status !== 429 || attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Voyage embeddings request failed (${res.status}): ${detail}`);
    }
    const { data } = await res.json();
    for (const item of [...data].sort((a, b) => a.index - b.index)) {
      vectors.push(Float32Array.from(item.embedding));
    }
  }
  if (vectors.length !== texts.length) {
    throw new Error(`Expected ${texts.length} embeddings, got ${vectors.length}`);
  }
  return vectors;
}

// SQLite stores a vector as a BLOB of float32 values (4 bytes per dimension).
const vectorToBlob = (vector) => new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
const blobToVector = (blob) =>
  new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength));

module.exports = { EMBEDDING_MODEL, embedTexts, vectorToBlob, blobToVector };
