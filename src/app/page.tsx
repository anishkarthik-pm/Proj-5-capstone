"use client";

import React, { useEffect, useCallback, useState } from "react";
import { Mountain, RefreshCw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceInput } from "@/components/voice/VoiceInput";
import { VoiceOutput } from "@/components/voice/VoiceOutput";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { SourcesPanel } from "@/components/itinerary/SourcesPanel";
import { EmailDialog } from "@/components/email/EmailDialog";
import { useTripStore } from "@/lib/stores/tripStore";
import { useVoiceStore } from "@/lib/stores/voiceStore";
import { useConversationStore } from "@/lib/stores/conversationStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { handleVoiceInput, orchestrator } from "@/services/llm/orchestrator";
import { speak, stopSpeaking } from "@/services/tts";
import { initializeRAG } from "@/services/rag";
import type { Itinerary } from "@/types";

export default function Home() {
  const { itinerary, setItinerary, setLoading, isLoading } = useTripStore();
  const { setCurrentResponse, addToHistory, setStatus, isSpeaking } = useVoiceStore();
  const { addMessage, setProcessing, isProcessing } = useConversationStore();
  const { isDemoMode } = useUIStore();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);

  // Initialize RAG on mount
  useEffect(() => {
    initializeRAG().catch(console.error);
  }, []);

  // Handle voice transcript completion
  const handleTranscriptComplete = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return;

      // Stop any current speech
      if (isSpeaking) {
        stopSpeaking();
      }

      // Add user message
      addMessage({ role: "user", content: transcript });
      addToHistory(transcript, true);

      // Set processing state
      setProcessing(true);
      setStatus("processing");
      setLoading(true);

      try {
        // Process with orchestrator
        const response = await handleVoiceInput(transcript);

        // Update conversation
        addMessage({
          role: "assistant",
          content: response.message,
          sources: response.sources,
        });
        addToHistory(response.message, false);

        // Update itinerary if returned
        const data = response.data as { itinerary?: Itinerary } | undefined;
        if (data?.itinerary) {
          setItinerary(data.itinerary);
        }

        // Set response for TTS
        setCurrentResponse(response.message);

        // Speak the response
        if (response.shouldSpeak) {
          speak(response.message);
        }
      } catch (error) {
        console.error("Error processing voice input:", error);
        const errorMessage = "I'm sorry, I had trouble processing that. Please try again.";
        addMessage({ role: "assistant", content: errorMessage });
        setCurrentResponse(errorMessage);
        speak(errorMessage);
      } finally {
        setProcessing(false);
        setStatus("idle");
        setLoading(false);
      }
    },
    [
      isSpeaking,
      addMessage,
      addToHistory,
      setProcessing,
      setStatus,
      setLoading,
      setItinerary,
      setCurrentResponse,
    ]
  );

  // Handle new trip
  const handleNewTrip = useCallback(() => {
    orchestrator.reset();
    setItinerary(null);
    setCurrentResponse("");
    addMessage({
      role: "assistant",
      content: "Let's plan a new trip! Tell me about your Ooty adventure.",
    });
    speak("Let's plan a new trip! Tell me about your Ooty adventure.");
  }, [setItinerary, setCurrentResponse, addMessage]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Mountain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Ooty Trip Planner</h1>
              <p className="text-xs text-muted-foreground">
                Voice-powered travel planning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {itinerary && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewTrip}
                  className="hidden sm:flex"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  New Trip
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex"
                  onClick={() => setIsEmailDialogOpen(true)}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Button>
              </>
            )}
            {isDemoMode && (
              <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full">
                Demo Mode
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Desktop Layout */}
        <div className="hidden md:flex flex-1">
          {/* Itinerary Panel (70%) */}
          <div className="w-[70%] border-r overflow-hidden flex flex-col">
            <ItineraryView className="flex-1" />
          </div>

          {/* Voice Panel (30%) */}
          <div className="w-[30%] flex flex-col bg-muted/20">
            <div className="flex-1 flex flex-col justify-center p-6">
              <VoiceInput
                onTranscriptComplete={handleTranscriptComplete}
                disabled={isProcessing || isLoading}
              />
            </div>
            <div className="border-t p-4">
              <VoiceOutput autoSpeak={false} />
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="flex md:hidden flex-col flex-1">
          {/* Itinerary */}
          <div className="flex-1 overflow-hidden">
            <ItineraryView />
          </div>

          {/* Fixed Voice Panel at Bottom */}
          <div className="flex-shrink-0 border-t bg-background p-4 space-y-4">
            <VoiceOutput autoSpeak={false} className="max-h-24 overflow-y-auto" />
            <VoiceInput
              onTranscriptComplete={handleTranscriptComplete}
              disabled={isProcessing || isLoading}
              className="pb-safe"
            />
          </div>
        </div>
      </main>

      {/* Sources Panel */}
      <SourcesPanel />

      {/* Loading Overlay */}
      {(isProcessing || isLoading) && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg text-center space-y-4">
            <div className="relative w-12 h-12 mx-auto">
              <div className="absolute inset-0 border-4 border-primary/30 rounded-full" />
              <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Creating your itinerary..." : "Processing..."}
            </p>
          </div>
        </div>
      )}

      {/* Email Dialog */}
      {itinerary && (
        <EmailDialog
          open={isEmailDialogOpen}
          onOpenChange={setIsEmailDialogOpen}
          itinerary={itinerary}
        />
      )}
    </div>
  );
}
