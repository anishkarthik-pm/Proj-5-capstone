import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "@/lib/config";

// Force Node.js runtime
export const runtime = "nodejs";
// Prevent static generation during build
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.GOOGLE_API_KEY;
  const model = process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_LLM_MODEL || config.llm.model;

  // Check if key exists
  if (!apiKey) {
    return NextResponse.json({
      valid: false,
      message: "GOOGLE_API_KEY not configured in environment",
      model,
    });
  }

  try {
    // Try to make a simple request to validate the key
    const client = new GoogleGenerativeAI(apiKey);
    const genModel = client.getGenerativeModel({ model });

    const result = await genModel.generateContent({
      contents: [{ role: "user", parts: [{ text: "Say 'API key valid' in exactly 3 words." }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 20,
      },
    });

    const response = result.response.text();

    return NextResponse.json({
      valid: true,
      message: "API key is working",
      model,
      testResponse: response.slice(0, 50),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    console.error("API key validation error:", errorMessage);

    // Check if model is not found - try fallback model
    if (errorMessage.includes("404") && errorMessage.includes("not found")) {
      // Try with available models in order of preference
      const fallbackModels = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

      for (const fallbackModel of fallbackModels) {
        try {
          const client = new GoogleGenerativeAI(apiKey);
          const genModel = client.getGenerativeModel({ model: fallbackModel });
          const result = await genModel.generateContent({
            contents: [{ role: "user", parts: [{ text: "Say 'API key valid' in exactly 3 words." }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 20,
            },
          });
          const response = result.response.text();
          return NextResponse.json({
            valid: true,
            message: "API key is working (using fallback model)",
            model: fallbackModel,
            originalModel: model,
            testResponse: response.slice(0, 50),
          });
        } catch {
          continue; // Try next fallback model
        }
      }

      // All fallbacks failed, return original error
      return NextResponse.json({
        valid: false,
        message: `Model '${model}' not found. Available models: gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro`,
        model,
        error: errorMessage.slice(0, 100),
      });
    }

    // Determine specific error type
    if (errorMessage.includes("API_KEY") || errorMessage.includes("401") || errorMessage.includes("403")) {
      return NextResponse.json({
        valid: false,
        message: "Invalid API key",
        model,
        error: errorMessage.slice(0, 100),
      });
    }

    if (errorMessage.includes("quota") || errorMessage.includes("rate")) {
      return NextResponse.json({
        valid: true, // Key is valid, just rate limited
        message: "API key valid but rate limited",
        model,
        error: errorMessage.slice(0, 100),
      });
    }

    return NextResponse.json({
      valid: false,
      message: `API error: ${errorMessage.slice(0, 100)}`,
      model,
    });
  }
}
