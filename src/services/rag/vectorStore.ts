import type { Document, SearchResult } from "@/types";

/**
 * Simple in-memory vector store for RAG
 *
 * Uses TF-IDF-like scoring for simplicity (no external embeddings required)
 * In production, this would use actual vector embeddings
 */

interface StoredDocument {
  document: Document;
  tokens: string[];
  tokenFrequency: Map<string, number>;
}

class VectorStore {
  private documents: StoredDocument[] = [];
  private idfCache: Map<string, number> = new Map();
  private isInitialized = false;

  /**
   * Add documents to the store
   */
  addDocuments(docs: Document[]): void {
    for (const doc of docs) {
      const tokens = this.tokenize(doc.content);
      const tokenFrequency = this.calculateTermFrequency(tokens);

      this.documents.push({
        document: doc,
        tokens,
        tokenFrequency,
      });
    }

    // Recalculate IDF after adding documents
    this.calculateIDF();
    this.isInitialized = true;
  }

  /**
   * Search for similar documents
   */
  search(query: string, k: number = 5): SearchResult[] {
    if (!this.isInitialized || this.documents.length === 0) {
      return [];
    }

    const queryTokens = this.tokenize(query);
    const queryTF = this.calculateTermFrequency(queryTokens);

    // Calculate TF-IDF similarity for each document
    const scores: Array<{ doc: StoredDocument; score: number }> = [];

    for (const storedDoc of this.documents) {
      const score = this.calculateSimilarity(queryTF, storedDoc);
      if (score > 0) {
        scores.push({ doc: storedDoc, score });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Return top k results
    return scores.slice(0, k).map(({ doc, score }) => ({
      document: doc.document,
      score,
      highlights: this.extractHighlights(doc.document.content, queryTokens),
    }));
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents = [];
    this.idfCache.clear();
    this.isInitialized = false;
  }

  /**
   * Get document count
   */
  get size(): number {
    return this.documents.length;
  }

  /**
   * Tokenize text into normalized tokens
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  }

  /**
   * Calculate term frequency for tokens
   */
  private calculateTermFrequency(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Normalize by document length
    const maxFreq = Math.max(...tf.values(), 1);
    for (const [token, freq] of tf) {
      tf.set(token, freq / maxFreq);
    }

    return tf;
  }

  /**
   * Calculate IDF for all terms
   */
  private calculateIDF(): void {
    this.idfCache.clear();
    const N = this.documents.length;

    // Count document frequency for each term
    const df = new Map<string, number>();
    for (const doc of this.documents) {
      const uniqueTokens = new Set(doc.tokens);
      for (const token of uniqueTokens) {
        df.set(token, (df.get(token) || 0) + 1);
      }
    }

    // Calculate IDF
    for (const [token, freq] of df) {
      this.idfCache.set(token, Math.log((N + 1) / (freq + 1)) + 1);
    }
  }

  /**
   * Calculate TF-IDF cosine similarity
   */
  private calculateSimilarity(
    queryTF: Map<string, number>,
    doc: StoredDocument
  ): number {
    let dotProduct = 0;
    let queryMagnitude = 0;
    let docMagnitude = 0;

    // Calculate dot product and query magnitude
    for (const [token, tf] of queryTF) {
      const idf = this.idfCache.get(token) || 0;
      const queryTFIDF = tf * idf;
      queryMagnitude += queryTFIDF * queryTFIDF;

      const docTF = doc.tokenFrequency.get(token) || 0;
      const docTFIDF = docTF * idf;
      dotProduct += queryTFIDF * docTFIDF;
    }

    // Calculate document magnitude
    for (const [token, tf] of doc.tokenFrequency) {
      const idf = this.idfCache.get(token) || 0;
      const docTFIDF = tf * idf;
      docMagnitude += docTFIDF * docTFIDF;
    }

    // Cosine similarity
    const magnitude = Math.sqrt(queryMagnitude) * Math.sqrt(docMagnitude);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Extract relevant highlights from content
   */
  private extractHighlights(content: string, queryTokens: string[]): string[] {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const highlights: Array<{ sentence: string; score: number }> = [];

    for (const sentence of sentences) {
      const sentenceTokens = new Set(this.tokenize(sentence));
      let matchCount = 0;

      for (const queryToken of queryTokens) {
        if (sentenceTokens.has(queryToken)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        highlights.push({
          sentence: sentence.trim(),
          score: matchCount / queryTokens.length,
        });
      }
    }

    // Return top 3 most relevant sentences
    return highlights
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((h) => h.sentence);
  }
}

// Common English stop words to filter out
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
  "used", "this", "that", "these", "those", "i", "you", "he", "she", "it",
  "we", "they", "what", "which", "who", "whom", "whose", "where", "when",
  "why", "how", "all", "each", "every", "both", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "also", "now", "here", "there",
]);

// Singleton instance
let vectorStoreInstance: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore();
  }
  return vectorStoreInstance;
}

export default VectorStore;
