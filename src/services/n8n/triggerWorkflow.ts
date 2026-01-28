import type { Itinerary, FormattedItinerary, FormattedDay, FormattedActivity } from "@/types";
import { useDebugStore } from "@/lib/stores/debugStore";

interface EmailWorkflowPayload {
  itinerary: FormattedItinerary;
  email: string;
  name: string;
  generatedAt: string;
}

interface WorkflowResponse {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Trigger n8n workflow to generate PDF and send email
 */
export async function triggerPdfWorkflow(data: {
  itinerary: Itinerary;
  userEmail: string;
  userName: string;
}): Promise<WorkflowResponse> {
  const { logInfo, logSuccess, logError, logWarning, logApi } = useDebugStore.getState();
  const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    logWarning("n8n", "n8n webhook URL not configured");
    return {
      success: false,
      message: "Email service not configured",
      error: "N8N_WEBHOOK_URL not set",
    };
  }

  logInfo("n8n", `Triggering email workflow for ${data.userEmail}`);
  const startTime = Date.now();

  try {
    const formattedItinerary = formatItineraryForPdf(data.itinerary);

    const payload: EmailWorkflowPayload = {
      itinerary: formattedItinerary,
      email: data.userEmail,
      name: data.userName,
      generatedAt: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const duration = Date.now() - startTime;
    logApi(webhookUrl, "POST", response.status, duration);

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    const result = await response.json();

    logSuccess("n8n", `Email sent to ${data.userEmail}`, { response: result });

    return {
      success: true,
      message: result.message || "Email sent successfully",
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logError("n8n", "Failed to trigger n8n workflow", error);
    logApi(webhookUrl, "POST", 0, duration, { error: error instanceof Error ? error.message : "Unknown" });

    return {
      success: false,
      message: "Failed to send email",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Format itinerary for PDF generation
 */
export function formatItineraryForPdf(itinerary: Itinerary): FormattedItinerary {
  const { preferences, days, sources } = itinerary;

  const startDate = new Date(preferences.startDate);
  const endDate = new Date(preferences.endDate);

  const formattedDays: FormattedDay[] = days.map((day) => {
    const dayDate = new Date(day.date);

    const activities: FormattedActivity[] = day.blocks.map((block, index) => {
      const activity: FormattedActivity = {
        time: `${formatTime(block.startTime)} - ${formatTime(block.endTime)}`,
        name: block.poi.name,
        duration: `${block.poi.estimated_duration_mins} mins`,
        description: block.poi.description,
        tips: block.poi.tips || [],
      };

      if (index > 0 && block.travelTimeFromPrev > 0) {
        activity.travelTime = `${block.travelTimeFromPrev} mins travel`;
      }

      return activity;
    });

    return {
      dayNumber: day.dayNumber,
      date: dayDate.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      activities,
    };
  });

  // Generate summary
  const totalActivities = days.reduce((sum, d) => sum + d.blocks.length, 0);
  const interests = preferences.interests.join(", ");

  return {
    title: `Your ${preferences.numDays}-Day Ooty Itinerary`,
    tripDates: `${startDate.toLocaleDateString("en-IN")} - ${endDate.toLocaleDateString("en-IN")}`,
    summary: `A ${preferences.pace} paced trip with ${totalActivities} activities, focused on ${interests}.`,
    days: formattedDays,
    sources: sources.map((s) => s.source),
  };
}

/**
 * Format time from 24h to 12h format
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Generate plain text version of itinerary
 */
export function formatItineraryAsText(itinerary: Itinerary): string {
  const formatted = formatItineraryForPdf(itinerary);
  const lines: string[] = [];

  lines.push(formatted.title);
  lines.push("=".repeat(formatted.title.length));
  lines.push("");
  lines.push(`Dates: ${formatted.tripDates}`);
  lines.push(formatted.summary);
  lines.push("");

  for (const day of formatted.days) {
    lines.push(`--- Day ${day.dayNumber} (${day.date}) ---`);
    lines.push("");

    for (const activity of day.activities) {
      if (activity.travelTime) {
        lines.push(`  [${activity.travelTime}]`);
      }
      lines.push(`${activity.time}`);
      lines.push(`  ${activity.name}`);
      lines.push(`  Duration: ${activity.duration}`);
      lines.push(`  ${activity.description.slice(0, 100)}...`);
      if (activity.tips.length > 0) {
        lines.push(`  Tip: ${activity.tips[0]}`);
      }
      lines.push("");
    }
  }

  lines.push("--- Sources ---");
  for (const source of formatted.sources) {
    lines.push(`- ${source}`);
  }

  return lines.join("\n");
}

export default triggerPdfWorkflow;
