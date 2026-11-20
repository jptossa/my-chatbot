// Splits every document into paragraph-sized chunks, embeds each chunk, and
// stores them in the `chunks` table. Safe to re-run: each document's chunks
// are replaced, and only after its embeddings were generated successfully.
//
//   node --no-warnings scripts/chunk-documents.js

require("dotenv").config();
const { db } = require("../db");
const { EMBEDDING_MODEL, embedTexts, vectorToBlob } = require("../embeddings");

const TARGET_CHARS = 600; // aim for about this much text per chunk
const MAX_CHARS = 1200; // a single paragraph longer than this gets split by sentence

// Splits an over-long paragraph into pieces of about TARGET_CHARS. A list is
// split between its items; anything else is split between sentences.
function splitLongParagraph(paragraph) {
  const items = paragraph.split(/\n(?=(?:[-*+]|\d+\.)\s)/);
  const units = items.length > 1
    ? items.map((item, i) => (i < items.length - 1 ? item + "\n" : item))
    : paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [paragraph];
  const pieces = [];
  let current = "";
  for (const sentence of units) {
    if (current && current.length + sentence.length > TARGET_CHARS) {
      pieces.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

/**
 * Paragraphs (blank-line separated) are packed together until a chunk reaches
 * about TARGET_CHARS. A heading line is never left stranded at the end of a
 * chunk: it always travels with the paragraph that follows it.
 */
function chunkText(text) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > MAX_CHARS ? splitLongParagraph(p) : [p]));

  const isHeading = (p) => /^#{1,6}\s/.test(p) && !p.includes("\n");
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const startsNewChunk =
      current && (current.length + paragraph.length > TARGET_CHARS || isHeading(paragraph));
    if (startsNewChunk && !isHeading(current.split("\n\n").pop())) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function main() {
  const documents = db.prepare("SELECT id, title, content FROM documents ORDER BY id").all();
  if (documents.length === 0) {
    console.error("No documents found. Run scripts/ingest-documents.js first.");
    process.exit(1);
  }

  const deleteChunks = db.prepare("DELETE FROM chunks WHERE document_id = ?");
  const insertChunk = db.prepare(
    `INSERT INTO chunks (document_id, chunk_index, content, embedding, embedding_model)
     VALUES (?, ?, ?, ?, ?)`
  );

  // Embed everything in as few API calls as possible (one, for a small
  // knowledge base), before touching the database: if the API fails, every
  // document keeps its old chunks.
  const allPieces = documents.map((doc) => chunkText(doc.content));
  const allVectors = await embedTexts(allPieces.flat(), "document");

  let totalChunks = 0;
  let offset = 0;
  for (const [n, doc] of documents.entries()) {
    const pieces = allPieces[n];
    const vectors = allVectors.slice(offset, offset + pieces.length);
    offset += pieces.length;

    db.exec("BEGIN");
    try {
      deleteChunks.run(doc.id);
      pieces.forEach((piece, i) =>
        insertChunk.run(doc.id, i, piece, vectorToBlob(vectors[i]), EMBEDDING_MODEL)
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    totalChunks += pieces.length;
    const sizes = pieces.map((p) => p.length);
    console.log(
      `${doc.title}: ${pieces.length} chunks (${Math.min(...sizes)}-${Math.max(...sizes)} chars), ` +
        `${vectors[0].length} dimensions`
    );
  }
  console.log(`Done: ${totalChunks} chunks from ${documents.length} documents, embedded with ${EMBEDDING_MODEL}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
