/**
 * Sample voice inputs for testing the trip planner
 */

export const sampleInputs = {
  initialPlanning: [
    "Plan a 3-day trip to Ooty next weekend. I love nature and tea gardens.",
    "I want to visit Ooty for 2 days with my family. We prefer a relaxed pace.",
    "Help me plan a romantic 3-day getaway to Ooty. We enjoy good food and scenic views.",
    "I'm traveling solo to Ooty for 4 days. I want to see as much as possible.",
    "Plan a weekend trip to Ooty for me and my parents. They can't walk too much.",
    "We're a group of friends going to Ooty for 3 days. We love adventure and trying local food.",
  ],

  edits: [
    "Make Day 2 more relaxed",
    "Swap the morning activity on Day 1 with something indoors",
    "Add a famous local restaurant for dinner on Day 2",
    "Remove Pykara Falls, it's too far",
    "Can we do the Toy Train on Day 1 instead?",
    "I don't want to go to the Botanical Gardens, replace it with something else",
    "Add a chocolate shop to Day 1",
    "The first day is too packed, remove one activity",
    "Move the tea factory visit to the morning",
    "Can we add boating to our plan?",
  ],

  queries: [
    "Why did you pick Botanical Gardens?",
    "Is this plan doable for senior citizens?",
    "What if it rains on Day 2?",
    "What's special about the chocolate shop you added?",
    "How long is the Toy Train ride?",
    "Tell me more about Doddabetta Peak",
    "What's the best time to visit the Rose Garden?",
    "Are there any good vegetarian restaurants?",
    "What should I pack for this trip?",
    "Is the itinerary feasible for someone with limited mobility?",
  ],

  confirmations: [
    "Yes, that looks good",
    "Sounds perfect, let's go with this",
    "No, I'd like some changes",
    "Can you email this to me?",
    "Okay, confirmed",
  ],

  unclear: [
    "Um, maybe later",
    "I'm not sure",
    "What do you think?",
    "Tell me something interesting",
    "Hello",
  ],
};

/**
 * Demo sequence for showcasing the app
 */
export const demoSequence = [
  {
    input: "Plan a 3-day trip to Ooty. I love nature and want a moderate pace.",
    expectedIntent: "plan",
    description: "Initial planning request with preferences",
  },
  {
    input: "couple",
    expectedIntent: "plan",
    description: "Answer to clarifying question about travel party",
  },
  {
    input: "Make Day 2 more relaxed, we want to sleep in",
    expectedIntent: "edit",
    description: "Edit request to modify the pace",
  },
  {
    input: "Why did you pick Doddabetta for Day 1?",
    expectedIntent: "query",
    description: "Query about a planning decision",
  },
  {
    input: "What if it rains?",
    expectedIntent: "query",
    description: "Weather contingency query",
  },
  {
    input: "Add a good restaurant for dinner on the last day",
    expectedIntent: "edit",
    description: "Add a food POI",
  },
  {
    input: "That looks perfect, thanks!",
    expectedIntent: "confirm",
    description: "Confirmation of final itinerary",
  },
];

/**
 * Test cases for intent classification
 */
export const intentTestCases = [
  {
    input: "plan a trip to ooty",
    expectedType: "plan",
  },
  {
    input: "remove the morning activity",
    expectedType: "edit",
  },
  {
    input: "why did you choose this place",
    expectedType: "query",
  },
  {
    input: "yes that's good",
    expectedType: "confirm",
  },
  {
    input: "hmm",
    expectedType: "unclear",
  },
];

export default {
  sampleInputs,
  demoSequence,
  intentTestCases,
};
