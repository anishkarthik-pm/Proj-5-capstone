import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "@/lib/config";

// Force Node.js runtime - Gemini SDK doesn't work in Edge
export const runtime = "nodejs";

// Types
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RequestBody {
  messages: Message[];
  options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  };
}

// Initialize Gemini client
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  return new GoogleGenerativeAI(apiKey);
}

// Convert messages to Gemini format
function convertMessages(messages: Message[]) {
  let systemPrompt = "";
  const history: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  let lastUserMessage = "";

  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = msg.content;
    } else if (msg.role === "assistant") {
      history.push({
        role: "model",
        parts: [{ text: msg.content }],
      });
    } else if (msg.role === "user") {
      lastUserMessage = msg.content;
      // Add to history for context (except the last one which we'll send)
      if (messages.indexOf(msg) < messages.length - 1) {
        history.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      }
    }
  }

  // Prepend system prompt to user message if exists
  if (systemPrompt) {
    lastUserMessage = `${systemPrompt}\n\n${lastUserMessage}`;
  }

  return { history, userMessage: lastUserMessage };
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { messages, options } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: options?.model || process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_LLM_MODEL || config.llm.model,
    });

    const { history, userMessage } = convertMessages(messages);

    let result;

    if (history.length > 0) {
      // Use chat for multi-turn conversations
      const chat = model.startChat({
        history,
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2048,
        },
      });

      result = await chat.sendMessage(userMessage);
    } else {
      // Single message generation
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2048,
        },
      });
    }

    const response = result.response;
    const text = response.text();

    return NextResponse.json({
      success: true,
      content: text,
      model: options?.model || config.llm.model,
    });
  } catch (error) {
    console.error("LLM API error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Check for specific error types
    if (errorMessage.includes("API key")) {
      return NextResponse.json(
        { error: "API key not configured", details: errorMessage },
        { status: 401 }
      );
    }

    if (errorMessage.includes("quota") || errorMessage.includes("rate")) {
      return NextResponse.json(
        { error: "Rate limit exceeded", details: errorMessage },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate response", details: errorMessage },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  const apiKey = process.env.GOOGLE_API_KEY;

  return NextResponse.json({
    status: apiKey ? "configured" : "not_configured",
    provider: "gemini",
    model: process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_LLM_MODEL || config.llm.model,
  });
}
