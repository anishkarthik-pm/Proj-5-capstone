# Ooty Voice Trip Planner

A voice-powered travel planning application for Ooty, the "Queen of Hill Stations" in Tamil Nadu, India. Plan your perfect Ooty trip using natural voice commands.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 14)                    │
├─────────────────────────────────┬───────────────────────────────┤
│        Itinerary View (70%)     │      Voice Panel (30%)        │
│  ┌─────────────────────────┐    │  ┌─────────────────────────┐  │
│  │      Day Cards          │    │  │    Voice Input          │  │
│  │   ┌──────────────┐      │    │  │    (Web Speech API)     │  │
│  │   │ Time Blocks  │      │    │  └─────────────────────────┘  │
│  │   │ Travel Segs  │      │    │  ┌─────────────────────────┐  │
│  │   └──────────────┘      │    │  │    Voice Output         │  │
│  └─────────────────────────┘    │  │    (TTS)                │  │
├─────────────────────────────────┴───────────────────────────────┤
│                        Sources Panel                             │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLM Orchestration Layer                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │ Intent        │  │ Planning      │  │ Edit          │        │
│  │ Classifier    │  │ Agent         │  │ Agent         │        │
│  └───────────────┘  └───────────────┘  └───────────────┘        │
│  ┌───────────────┐                                               │
│  │ Query         │                                               │
│  │ Agent         │                                               │
│  └───────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Tools & RAG                          │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │ POI Search    │  │ Itinerary     │  │ RAG           │        │
│  │ Tool          │  │ Builder       │  │ Retriever     │        │
│  └───────────────┘  └───────────────┘  └───────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Data Layer                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │ POI Dataset   │  │ Travel Times  │  │ City Guide    │        │
│  │ (28 POIs)     │  │ Matrix        │  │ & Local Tips  │        │
│  └───────────────┘  └───────────────┘  └───────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Voice-First Interface**: Speak naturally to plan your trip
- **Smart Itinerary Generation**: AI-powered scheduling based on your preferences
- **Real-time Modifications**: Edit your itinerary with voice commands
- **Grounded Responses**: All recommendations backed by curated data
- **Feasibility Checks**: Automatic validation of travel times and schedules
- **Source Citations**: Transparent about where information comes from

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand
- **Voice**: Web Speech API (recognition + synthesis)
- **Data**: Static JSON with 28 curated Ooty POIs

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ooty-trip-planner
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env.local
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
/src
  /app                    # Next.js App Router pages
  /components
    /ui                   # shadcn/ui components
    /voice               # Voice input/output components
    /itinerary           # Itinerary display components
  /lib
    /stores              # Zustand stores
    /utils.ts            # Utility functions
    /config.ts           # App configuration
  /services
    /mcp                 # MCP tool implementations
      /poiSearch.ts      # POI search tool
      /itineraryBuilder.ts # Itinerary builder tool
    /rag                 # RAG service
      /vectorStore.ts    # In-memory vector store
      /retriever.ts      # Context retrieval
    /llm                 # LLM orchestration
      /orchestrator.ts   # Main orchestrator
      /intentClassifier.ts
      /planningAgent.ts
      /editAgent.ts
      /queryAgent.ts
    /tts                 # Text-to-speech service
    /eval                # Evaluation system
    /n8n                 # n8n workflow integration
  /data                  # Static data files
    /ooty-pois.json      # POI dataset
    /ooty-travel-times.json
    /ooty-city-guide.json
    /local-tips.md
  /types                 # TypeScript interfaces
  /hooks                 # Custom React hooks
  /test                  # Test utilities
```

## MCP Tools

### POI Search
Searches and ranks Points of Interest based on user preferences.

**Input:**
- `interests`: User interests (nature, food, culture, adventure)
- `pace`: Trip pace (relaxed, moderate, packed)
- `excludeIds`: Already selected POIs to exclude
- `timeSlot`: Preferred time (morning, afternoon, evening)

**Output:**
- Ranked list of matching POIs with reasoning

### Itinerary Builder
Converts ranked POIs into a feasible day-wise schedule.

**Input:**
- `pois`: Ranked POIs from search
- `numDays`: Number of trip days
- `pace`: Schedule density
- `travelTimeMatrix`: Travel times between POIs

**Output:**
- Day-by-day schedule with time blocks
- Feasibility score and warnings

## Data Sources

| Source | Description | POIs |
|--------|-------------|------|
| OpenStreetMap | Coordinates and basic info | 10 |
| Wikivoyage | Detailed descriptions | 8 |
| Local curated | Tips and hidden gems | 10 |

## Voice Commands

### Planning
- "Plan a 3-day trip to Ooty"
- "I want to visit Ooty for 2 days with my family"
- "Help me plan a romantic weekend getaway"

### Editing
- "Make Day 2 more relaxed"
- "Add a tea factory to Day 1"
- "Remove the Botanical Gardens"
- "Swap morning and afternoon activities"

### Queries
- "Why did you pick Doddabetta?"
- "What if it rains on Day 2?"
- "Is this suitable for seniors?"
- "Tell me more about the Toy Train"

## Evaluations

The system includes three types of automatic evaluations:

1. **Feasibility Eval**: Checks time constraints, travel times, overlaps
2. **Edit Correctness Eval**: Verifies only intended changes were made
3. **Grounding Eval**: Ensures all data matches the source dataset

## Environment Variables

```env
# LLM Configuration (optional)
NEXT_PUBLIC_LLM_PROVIDER=openai
NEXT_PUBLIC_LLM_MODEL=gpt-4-turbo

# API Keys (if using external LLM)
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key

# n8n Integration (for email)
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://...
```

## Browser Support

Voice features require:
- Chrome 33+
- Edge 79+
- Safari 14.1+

Firefox does not support the Web Speech API for recognition.

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Lint code
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting and tests
5. Submit a pull request

## License

MIT

---

Built with Next.js, TypeScript, and Tailwind CSS.
