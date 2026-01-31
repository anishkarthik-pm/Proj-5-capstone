import type { Document, Citation, RetrievalResult } from "@/types";
import { getVectorStore } from "./vectorStore";
import cityGuideData from "@/data/ooty-city-guide.json";
import localTipsContent from "@/data/local-tips.md";

let isInitialized = false;

/**
 * Initialize the RAG system with data sources
 */
export async function initializeRAG(): Promise<void> {
  if (isInitialized) return;

  const vectorStore = getVectorStore();
  const documents: Document[] = [];

  // 1. Ingest city guide data
  documents.push(...ingestCityGuide(cityGuideData));

  // 2. Ingest local tips markdown
  documents.push(...ingestMarkdown(localTipsContent, "Local Tips", "local-tips"));

  // Add all documents to vector store
  vectorStore.addDocuments(documents);
  isInitialized = true;

  console.log(`RAG initialized with ${vectorStore.size} document chunks`);
}

/**
 * Ingest city guide JSON into document chunks
 */
function ingestCityGuide(data: typeof cityGuideData): Document[] {
  const documents: Document[] = [];
  const source = "Ooty City Guide";

  // Weather information
  if (data.weather) {
    documents.push({
      id: "cityguide-weather-overview",
      content: `Weather in Ooty: ${data.weather.overview}`,
      source,
      metadata: { section: "weather" },
    });

    for (const season of data.weather.seasons) {
      documents.push({
        id: `cityguide-weather-${season.name.toLowerCase()}`,
        content: `${season.name} in Ooty (${season.months.join(", ")}): ${season.description} Temperature ranges from ${season.temperature.min}°C to ${season.temperature.max}°C. Tips: ${season.tips.join(". ")}`,
        source,
        metadata: { section: "weather", season: season.name },
      });
    }
  }

  // Best time to visit
  if (data.bestMonthsToVisit) {
    documents.push({
      id: "cityguide-best-time",
      content: `Best time to visit Ooty: Peak season is ${data.bestMonthsToVisit.peak.join(", ")} - ${data.bestMonthsToVisit.notes.peak}. Good months are ${data.bestMonthsToVisit.good.join(", ")} - ${data.bestMonthsToVisit.notes.good}. Off-season is ${data.bestMonthsToVisit.offSeason.join(", ")} - ${data.bestMonthsToVisit.notes.offSeason}`,
      source,
      metadata: { section: "timing" },
    });
  }

  // Local etiquette
  if (data.localEtiquette) {
    for (const item of data.localEtiquette) {
      documents.push({
        id: `cityguide-etiquette-${item.topic.toLowerCase().replace(/\s+/g, "-")}`,
        content: `${item.topic} in Ooty: ${item.advice}`,
        source,
        metadata: { section: "etiquette" },
      });
    }
  }

  // Safety tips
  if (data.safetyTips) {
    for (const category of data.safetyTips) {
      documents.push({
        id: `cityguide-safety-${category.category.toLowerCase().replace(/\s+/g, "-")}`,
        content: `${category.category} tips for Ooty: ${category.tips.join(". ")}`,
        source,
        metadata: { section: "safety" },
      });
    }
  }

  // Transportation
  if (data.transportation) {
    // Getting there
    for (const option of data.transportation.gettingThere) {
      documents.push({
        id: `cityguide-transport-to-${option.mode.toLowerCase()}`,
        content: `Getting to Ooty by ${option.mode}: ${option.details}${option.duration ? ` Duration: ${option.duration}.` : ""}${option.tips ? ` Tips: ${option.tips.join(". ")}` : ""}`,
        source,
        metadata: { section: "transportation" },
      });
    }

    // Getting around
    for (const option of data.transportation.gettingAround) {
      documents.push({
        id: `cityguide-transport-around-${option.mode.toLowerCase().replace(/\s+/g, "-")}`,
        content: `Getting around Ooty by ${option.mode}: ${option.details}${option.cost ? ` Cost: ${option.cost}.` : ""}${option.tips ? ` Tips: ${option.tips.join(". ")}` : ""}`,
        source,
        metadata: { section: "transportation" },
      });
    }
  }

  // Food specialties
  if (data.foodSpecialties) {
    for (const food of data.foodSpecialties) {
      documents.push({
        id: `cityguide-food-${food.name.toLowerCase().replace(/\s+/g, "-")}`,
        content: `${food.name} in Ooty: ${food.description} Where to try: ${food.whereToTry.join(", ")}.`,
        source,
        metadata: { section: "food" },
      });
    }
  }

  // Packing recommendations
  if (data.packingRecommendations) {
    for (const [category, items] of Object.entries(data.packingRecommendations)) {
      documents.push({
        id: `cityguide-packing-${category}`,
        content: `Packing for ${category} in Ooty: ${(items as string[]).join(", ")}.`,
        source,
        metadata: { section: "packing" },
      });
    }
  }

  return documents;
}

/**
 * Ingest markdown content into document chunks
 */
function ingestMarkdown(
  content: string,
  sourceName: string,
  sourceId: string
): Document[] {
  const documents: Document[] = [];

  // Split by headers
  const sections = content.split(/^##\s+/m);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    // Get section title from first line
    const lines = section.split("\n");
    const title = lines[0].replace(/^#+\s*/, "").trim();
    const body = lines.slice(1).join("\n").trim();

    if (body.length > 50) {
      // Split large sections into smaller chunks
      const chunks = chunkText(body, 500);

      for (let j = 0; j < chunks.length; j++) {
        documents.push({
          id: `${sourceId}-${i}-${j}`,
          content: `${title}: ${chunks[j]}`,
          source: sourceName,
          metadata: { section: title },
        });
      }
    }
  }

  return documents;
}

/**
 * Split text into chunks of approximately maxLength tokens
 */
function chunkText(text: string, maxLength: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Retrieve relevant context for a query
 */
export async function retrieve(query: string): Promise<RetrievalResult> {
  // Ensure RAG is initialized
  if (!isInitialized) {
    await initializeRAG();
  }

  const vectorStore = getVectorStore();
  const results = vectorStore.search(query, 5);

  if (results.length === 0) {
    return {
      context: "",
      sources: [],
    };
  }

  // Combine top results into context
  const contextParts: string[] = [];
  const sources: Citation[] = [];

  for (const result of results) {
    if (result.score > 0.1) {
      // Only include relevant results
      contextParts.push(result.document.content);

      // Add source citation
      sources.push({
        text: result.document.content.slice(0, 100) + "...",
        source: result.document.source,
        relevanceScore: result.score,
      });
    }
  }

  // Generate a coherent context from the results
  const context = contextParts.join(" ").slice(0, 800);

  return {
    context,
    sources,
  };
}

/**
 * Get a specific answer for common questions
 */
export async function getAnswer(question: string): Promise<string | null> {
  const lowerQuestion = question.toLowerCase();

  // Direct answers for common questions
  if (lowerQuestion.includes("best time") && lowerQuestion.includes("visit")) {
    return "The best time to visit Ooty is from March to June for pleasant weather and clear skies. September to November offers beautiful post-monsoon greenery. Avoid July-August if you dislike rain.";
  }

  if (lowerQuestion.includes("rain") || lowerQuestion.includes("monsoon")) {
    return "If it rains in Ooty, indoor attractions like the Tribal Museum, Thread Garden, Wax World, and chocolate factories make great alternatives. Tea houses and cafes are also perfect for rainy afternoons.";
  }

  if (lowerQuestion.includes("toy train") && lowerQuestion.includes("book")) {
    return "Book Toy Train tickets in advance through IRCTC website. The journey from Ooty to Coonoor takes about 1 hour, while the full journey to Mettupalayam takes 5 hours. First class offers better views.";
  }

  // Use RAG for other questions
  const result = await retrieve(question);
  return result.context || null;
}

const retriever = { retrieve, initializeRAG, getAnswer };
export default retriever;
