/**
 * Hotel Calculator MCP Tool
 * Handles hotel recommendations and cost calculations
 */

import hotelsData from "@/data/ooty-hotels.json";

export type HotelCategory = "3-star" | "4-star" | "5-star";
export type RoomType = "single" | "double" | "triple" | "family";

export interface Hotel {
  id: string;
  name: string;
  category: HotelCategory;
  pricePerNight: Record<RoomType, number>;
  amenities: string[];
  rating: number;
  location: string;
  description: string;
}

export interface HotelRecommendation {
  hotel: Hotel;
  roomType: RoomType;
  pricePerNight: number;
  totalNights: number;
  basePrice: number;
  gstAmount: number;
  totalPrice: number;
}

const GST_RATE = 0.12; // 12% GST on hotels

/**
 * Get room type based on group size
 */
export function getRoomType(groupSize: number): RoomType {
  if (groupSize <= 1) return "single";
  if (groupSize <= 2) return "double";
  if (groupSize <= 4) return "triple";
  return "family";
}

/**
 * Get hotels by category
 */
export function getHotelsByCategory(category: HotelCategory): Hotel[] {
  return (hotelsData.hotels as Hotel[]).filter(h => h.category === category);
}

/**
 * Get all available categories
 */
export function getAvailableCategories(): HotelCategory[] {
  return ["3-star", "4-star", "5-star"];
}

/**
 * Get hotel options for a trip
 */
export function getHotelOptions(params: {
  groupSize: number;
  numNights: number;
  preferredCategory?: HotelCategory;
}): HotelRecommendation[] {
  const { groupSize, numNights, preferredCategory } = params;
  const roomType = getRoomType(groupSize);

  let hotels = hotelsData.hotels as Hotel[];

  // Filter by category if specified
  if (preferredCategory) {
    hotels = hotels.filter(h => h.category === preferredCategory);
  }

  // Sort by rating
  hotels.sort((a, b) => b.rating - a.rating);

  return hotels.map(hotel => {
    const pricePerNight = hotel.pricePerNight[roomType];
    const basePrice = pricePerNight * numNights;
    const gstAmount = Math.round(basePrice * GST_RATE);
    const totalPrice = basePrice + gstAmount;

    return {
      hotel,
      roomType,
      pricePerNight,
      totalNights: numNights,
      basePrice,
      gstAmount,
      totalPrice,
    };
  });
}

/**
 * Get recommended hotel for a budget level
 */
export function getRecommendedHotel(params: {
  groupSize: number;
  numNights: number;
  budget: "budget" | "moderate" | "luxury";
}): HotelRecommendation | null {
  const { groupSize, numNights, budget } = params;

  const categoryMap: Record<string, HotelCategory> = {
    budget: "3-star",
    moderate: "4-star",
    luxury: "5-star",
  };

  const category = categoryMap[budget];
  const options = getHotelOptions({ groupSize, numNights, preferredCategory: category });

  if (options.length === 0) return null;

  // Return highest rated in category
  return options[0];
}

/**
 * Calculate hotel cost breakdown
 */
export function calculateHotelCost(params: {
  hotelId: string;
  groupSize: number;
  numNights: number;
}): HotelRecommendation | null {
  const { hotelId, groupSize, numNights } = params;

  const hotel = (hotelsData.hotels as Hotel[]).find(h => h.id === hotelId);
  if (!hotel) return null;

  const roomType = getRoomType(groupSize);
  const pricePerNight = hotel.pricePerNight[roomType];
  const basePrice = pricePerNight * numNights;
  const gstAmount = Math.round(basePrice * GST_RATE);
  const totalPrice = basePrice + gstAmount;

  return {
    hotel,
    roomType,
    pricePerNight,
    totalNights: numNights,
    basePrice,
    gstAmount,
    totalPrice,
  };
}

/**
 * Format hotel cost for display
 */
export function formatHotelCost(recommendation: HotelRecommendation): string {
  const { hotel, roomType, pricePerNight, totalNights, totalPrice } = recommendation;
  return `${hotel.name} (${hotel.category}, ${roomType} room): ₹${pricePerNight.toLocaleString("en-IN")}/night × ${totalNights} nights = ₹${totalPrice.toLocaleString("en-IN")} (incl. GST)`;
}

/**
 * Get hotel category display name
 */
export function getCategoryDisplayName(category: HotelCategory): string {
  const names: Record<HotelCategory, string> = {
    "3-star": "Budget (3-Star)",
    "4-star": "Comfort (4-Star)",
    "5-star": "Luxury (5-Star)",
  };
  return names[category];
}

const hotelCalculator = {
  getRoomType,
  getHotelsByCategory,
  getAvailableCategories,
  getHotelOptions,
  getRecommendedHotel,
  calculateHotelCost,
  formatHotelCost,
  getCategoryDisplayName,
  GST_RATE,
};

export default hotelCalculator;
