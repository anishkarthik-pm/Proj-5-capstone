import { NextRequest, NextResponse } from "next/server";
import { orchestrator } from "@/services/llm/orchestrator";
import { config } from "@/lib/config";

// Force Node.js runtime - LLM services don't work in Edge
export const runtime = "nodejs";

// Add debug logging for deployment troubleshooting
function logRuntime() {
  console.log("Orchestrator Runtime Check", {
    hasGoogleKey: !!process.env.GOOGLE_API_KEY,
    runtime: process.env.NEXT_RUNTIME || "nodejs",
    node: process.version,
  });
}

export async function POST(request: NextRequest) {
  try {
    logRuntime();

    const body = await request.json();
    const { action, transcript, itinerary } = body;

    switch (action) {
      case "process": {
        if (!transcript) {
          return NextResponse.json(
            { error: "Transcript is required" },
            { status: 400 }
          );
        }

        const response = await orchestrator.handleVoiceInput(transcript);

        return NextResponse.json({
          success: true,
          response,
          itinerary: orchestrator.getItinerary(),
        });
      }

      case "reset": {
        orchestrator.reset();
        return NextResponse.json({
          success: true,
          message: "Orchestrator reset",
        });
      }

      case "setItinerary": {
        if (!itinerary) {
          return NextResponse.json(
            { error: "Itinerary is required" },
            { status: 400 }
          );
        }
        orchestrator.setItinerary(itinerary);
        return NextResponse.json({
          success: true,
          message: "Itinerary set",
        });
      }

      case "getContext": {
        return NextResponse.json({
          success: true,
          context: orchestrator.getContext(),
          itinerary: orchestrator.getItinerary(),
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Orchestrator API error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Check for API key issues
    if (errorMessage.includes("API") || errorMessage.includes("key") || errorMessage.includes("configured")) {
      return NextResponse.json(
        { error: "LLM API not configured", details: errorMessage },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to process request", details: errorMessage },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  logRuntime();

  return NextResponse.json({
    status: "ok",
    hasApiKey: !!process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_LLM_MODEL || config.llm.model,
    runtime: "nodejs",
  });
}
