import type { Itinerary } from "@/types";
import { VEHICLE_RATES } from "@/services/mcp/travelCostCalculator";

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
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Get arrival point display text
 */
function getArrivalPointText(arrivalPoint?: string): string {
  switch (arrivalPoint) {
    case "airport": return "Coimbatore Airport";
    case "railway": return "Mettupalayam/Coimbatore Railway";
    case "bus": return "Bus Stand";
    case "self-drive": return "Self-drive";
    default: return "-";
  }
}

/**
 * Generate HTML content for PDF export
 */
export function generatePdfHtml(itinerary: Itinerary): string {
  const { preferences, days, sources } = itinerary;

  // Separate tourist spots and restaurants for each day
  const activitiesHtml = days
    .map((day) => {
      const touristSpots = day.blocks.filter(
        (b) => !b.poi.category.some((c) => c.toLowerCase().includes("food") || c.toLowerCase().includes("restaurant") || c.toLowerCase().includes("cafe"))
      );
      const restaurants = day.blocks.filter(
        (b) => b.poi.category.some((c) => c.toLowerCase().includes("food") || c.toLowerCase().includes("restaurant") || c.toLowerCase().includes("cafe"))
      );

      return `
    <div class="day-section">
      <h2>Day ${day.dayNumber} ${day.theme ? `- ${day.theme}` : ""}</h2>
      <p class="date">${formatDate(day.date)}</p>
      ${day.weather ? `<p class="weather">🌤 ${day.weather.condition}, ${day.weather.temperature.min}°-${day.weather.temperature.max}°C</p>` : ""}

      ${touristSpots.length > 0 ? `
      <div class="section-header">🏔️ Tourist Spots</div>
      <div class="activities">
        ${touristSpots
          .map(
            (block, index) => `
          ${
            index > 0 && block.travelTimeFromPrev > 0
              ? `<div class="travel-time">🚗 ${block.travelTimeFromPrev} mins travel</div>`
              : ""
          }
          <div class="activity tourist">
            <div class="time">${formatTime(block.startTime)} - ${formatTime(block.endTime)}</div>
            <div class="activity-content">
              <h3>${block.poi.name}</h3>
              <p class="duration">Duration: ${block.poi.estimated_duration_mins} mins | Cost: ₹${block.poi.cost_inr}</p>
              <p class="description">${block.poi.description}</p>
              ${block.poi.tips && block.poi.tips.length > 0 ? `<p class="tip">💡 ${block.poi.tips[0]}</p>` : ""}
              ${block.reasoning ? `<p class="reasoning">📍 ${block.reasoning}</p>` : ""}
            </div>
          </div>
        `
          )
          .join("")}
      </div>` : ""}

      ${restaurants.length > 0 ? `
      <div class="section-header">🍽️ Restaurants & Cafes</div>
      <div class="activities">
        ${restaurants
          .map(
            (block) => `
          <div class="activity food">
            <div class="time">${formatTime(block.startTime)} - ${formatTime(block.endTime)}</div>
            <div class="activity-content">
              <h3>${block.poi.name}</h3>
              <p class="duration">Duration: ${block.poi.estimated_duration_mins} mins | ${block.poi.dietary === "veg" ? "🥬 Pure Veg" : "🍗 Veg & Non-veg"}</p>
              <p class="description">${block.poi.description}</p>
              ${block.poi.tips && block.poi.tips.length > 0 ? `<p class="tip">💡 ${block.poi.tips[0]}</p>` : ""}
            </div>
          </div>
        `
          )
          .join("")}
      </div>` : ""}
    </div>
  `;
    })
    .join("");

  const sourcesHtml = sources
    .map((s) => `<li>${s.source}${s.url ? ` - <a href="${s.url}">${s.url}</a>` : ""}</li>`)
    .join("");

  // Calculate costs
  const totalActivityCost = days.reduce(
    (sum, day) => sum + day.blocks.reduce((daySum, block) => daySum + block.poi.cost_inr, 0),
    0
  );

  // Travel costs
  const totalDistanceKm = days.reduce((sum, d) => sum + (d.totalDistanceKm || 0), 0);
  const vehicleType = preferences.vehicleType || "sedan";
  const vehicleInfo = VEHICLE_RATES[vehicleType as keyof typeof VEHICLE_RATES];
  const travelCost = Math.round(totalDistanceKm * vehicleInfo.perKmRate);

  // Hotel costs (estimate)
  const roomsNeeded = preferences.roomsNeeded || Math.ceil((preferences.groupSize || 2) / 2);
  const hotelRatePerNight = preferences.hotelCategory === "5-star" ? 8000 :
                            preferences.hotelCategory === "3-star" ? 2500 : 4500;
  const hotelCost = roomsNeeded * hotelRatePerNight * preferences.numDays;
  const hotelGst = Math.round(hotelCost * 0.12);

  const grandTotal = totalActivityCost + travelCost + hotelCost + hotelGst;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ooty Itinerary - ${preferences.numDays} Days</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }

    .header {
      text-align: center;
      padding: 30px 0;
      border-bottom: 2px solid #10b981;
      margin-bottom: 30px;
    }

    .header h1 {
      color: #10b981;
      font-size: 28px;
      margin-bottom: 10px;
    }

    .header .subtitle {
      color: #666;
      font-size: 14px;
    }

    .summary {
      background: #f0fdf4;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }

    .summary h2 {
      font-size: 16px;
      color: #10b981;
      margin-bottom: 10px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .summary-item {
      font-size: 14px;
    }

    .summary-item span {
      font-weight: 600;
    }

    .day-section {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }

    .day-section h2 {
      color: #10b981;
      font-size: 20px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
      margin-bottom: 5px;
    }

    .day-section .date {
      color: #666;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .activities {
      padding-left: 10px;
    }

    .activity {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
      padding: 15px;
      background: #fafafa;
      border-radius: 8px;
      border-left: 3px solid #10b981;
    }

    .activity .time {
      min-width: 130px;
      font-weight: 600;
      color: #10b981;
      font-size: 14px;
    }

    .activity-content h3 {
      font-size: 16px;
      margin-bottom: 5px;
    }

    .activity-content .duration {
      font-size: 12px;
      color: #666;
      margin-bottom: 8px;
    }

    .activity-content .description {
      font-size: 14px;
      color: #444;
      margin-bottom: 8px;
    }

    .activity-content .tip {
      font-size: 13px;
      color: #059669;
      font-style: italic;
    }

    .activity-content .reasoning {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }

    .travel-time {
      text-align: center;
      color: #666;
      font-size: 13px;
      padding: 10px 0;
    }

    .cost-summary {
      background: #fef3c7;
      padding: 20px;
      border-radius: 8px;
      margin: 30px 0;
    }

    .cost-summary h2 {
      font-size: 16px;
      color: #92400e;
      margin-bottom: 15px;
    }

    .cost-table {
      width: 100%;
      border-collapse: collapse;
    }

    .cost-table td {
      padding: 8px 0;
      border-bottom: 1px solid #fcd34d;
    }

    .cost-table td:last-child {
      text-align: right;
      font-weight: 500;
    }

    .cost-table .total td {
      border-top: 2px solid #92400e;
      border-bottom: none;
      padding-top: 12px;
    }

    .cost-note {
      font-size: 12px;
      color: #92400e;
      margin-top: 10px;
      font-style: italic;
    }

    .section-header {
      font-size: 14px;
      font-weight: 600;
      color: #10b981;
      margin: 20px 0 10px 0;
      padding-bottom: 5px;
      border-bottom: 1px dashed #d1d5db;
    }

    .activity.tourist {
      border-left-color: #10b981;
    }

    .activity.food {
      border-left-color: #f59e0b;
      background: #fffbeb;
    }

    .weather {
      font-size: 13px;
      color: #0369a1;
      margin-bottom: 15px;
    }

    .sources {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }

    .sources h2 {
      font-size: 16px;
      color: #666;
      margin-bottom: 10px;
    }

    .sources ul {
      font-size: 12px;
      color: #666;
      padding-left: 20px;
    }

    .footer {
      margin-top: 40px;
      text-align: center;
      color: #999;
      font-size: 12px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }

    @media print {
      body {
        padding: 0;
      }

      .day-section {
        page-break-inside: avoid;
      }

      .activity {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏔️ Your ${preferences.numDays}-Day Ooty Itinerary</h1>
    <p class="subtitle">Queen of Hill Stations, Tamil Nadu, India</p>
  </div>

  <div class="summary">
    <h2>Trip Details</h2>
    <div class="summary-grid">
      <div class="summary-item"><span>Travel Date:</span> ${formatDate(preferences.startDate)}</div>
      <div class="summary-item"><span>Duration:</span> ${preferences.numDays} days</div>
      <div class="summary-item"><span>Travelers:</span> ${preferences.groupSize || 2} people</div>
      <div class="summary-item"><span>Rooms:</span> ${roomsNeeded} ${preferences.hotelCategory || "4-star"} room${roomsNeeded > 1 ? "s" : ""}</div>
      <div class="summary-item"><span>Vehicle:</span> ${vehicleInfo.name}</div>
      <div class="summary-item"><span>Arrival:</span> ${getArrivalPointText(preferences.arrivalPoint)}</div>
      <div class="summary-item"><span>Pickup/Drop:</span> ${preferences.needsPickupDrop ? "Yes" : "No"}</div>
      <div class="summary-item"><span>Dining:</span> ${preferences.dietaryPreference === "veg" ? "Pure Vegetarian" : "Veg & Non-veg"}</div>
      <div class="summary-item"><span>Interests:</span> ${preferences.interests?.join(", ") || "Nature, Food"}</div>
      <div class="summary-item"><span>Pace:</span> ${preferences.pace || "Moderate"}</div>
      <div class="summary-item"><span>Total Activities:</span> ${days.reduce((sum, d) => sum + d.blocks.length, 0)}</div>
      <div class="summary-item"><span>Total Distance:</span> ${totalDistanceKm} km</div>
    </div>
  </div>

  ${activitiesHtml}

  <div class="cost-summary">
    <h2>💰 Estimated Cost Breakdown</h2>
    <table class="cost-table">
      <tr><td>Entry/Activity Fees</td><td>₹${totalActivityCost.toLocaleString("en-IN")}</td></tr>
      <tr><td>Transport (${vehicleInfo.name}, ${totalDistanceKm} km)</td><td>₹${travelCost.toLocaleString("en-IN")}</td></tr>
      <tr><td>Hotel (${roomsNeeded} ${preferences.hotelCategory || "4-star"} room${roomsNeeded > 1 ? "s" : ""} × ${preferences.numDays} nights)</td><td>₹${hotelCost.toLocaleString("en-IN")}</td></tr>
      <tr><td>Hotel GST (12%)</td><td>₹${hotelGst.toLocaleString("en-IN")}</td></tr>
      <tr class="total"><td><strong>Estimated Total</strong></td><td><strong>₹${grandTotal.toLocaleString("en-IN")}</strong></td></tr>
    </table>
    <p class="cost-note">* Food and miscellaneous expenses not included</p>
  </div>

  <div class="sources">
    <h2>📚 Sources</h2>
    <ul>
      ${sourcesHtml}
    </ul>
  </div>

  <div class="footer">
    <p>Generated by Ooty Voice Trip Planner</p>
    <p>Generated on: ${new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}</p>
  </div>
</body>
</html>
  `;
}

/**
 * Export itinerary as PDF by opening print dialog
 */
export function exportToPdf(itinerary: Itinerary): void {
  const html = generatePdfHtml(itinerary);

  // Create a new window with the HTML content
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to export as PDF");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to load then trigger print
  printWindow.onload = () => {
    printWindow.print();
  };
}

/**
 * Download itinerary as HTML file
 */
export function downloadAsHtml(itinerary: Itinerary): void {
  const html = generatePdfHtml(itinerary);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `ooty-itinerary-${itinerary.preferences.numDays}days.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default exportToPdf;
