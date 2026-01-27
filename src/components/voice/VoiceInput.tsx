"use client";

import React, { useEffect, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useVoiceStore } from "@/lib/stores/voiceStore";

interface VoiceInputProps {
  onTranscriptComplete?: (transcript: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceInput({
  onTranscriptComplete,
  disabled = false,
  className,
}: VoiceInputProps) {
  const { status, isSpeaking } = useVoiceStore();

  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    silenceTimeout: 3000,
    maxDuration: 30000,
    onResult: (text) => {
      onTranscriptComplete?.(text);
    },
  });

  // Handle Space key for push-to-talk
  useEffect(() => {
    if (!isSupported || disabled) return;

    let spacePressed = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on Space, not when typing in inputs
      if (
        e.code === "Space" &&
        !spacePressed &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        spacePressed = true;

        // Stop speaking if currently speaking
        if (isSpeaking) {
          window.speechSynthesis?.cancel();
        }

        startListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && spacePressed) {
        spacePressed = false;
        // Let the silence timeout handle stopping, or stop if user releases quickly
        if (isListening && !transcript && !interimTranscript) {
          stopListening();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    isSupported,
    disabled,
    isSpeaking,
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
  ]);

  const handleMicClick = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      // Stop speaking if currently speaking
      if (isSpeaking) {
        window.speechSynthesis?.cancel();
      }
      resetTranscript();
      startListening();
    }
  }, [isListening, isSpeaking, startListening, stopListening, resetTranscript]);

  const getStatusColor = () => {
    if (error) return "bg-red-500";
    if (isListening) return "bg-green-500";
    if (status === "processing") return "bg-yellow-500";
    return "bg-gray-400";
  };

  const getStatusText = () => {
    if (!isSupported) return "Not supported";
    if (error) return "Error";
    if (isListening) return "Listening...";
    if (status === "processing") return "Processing...";
    if (status === "speaking") return "Speaking...";
    return "Ready";
  };

  if (!isSupported) {
    return (
      <div className={cn("flex flex-col items-center gap-4 p-6", className)}>
        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            disabled
            className="h-20 w-20 rounded-full border-2 border-dashed"
          >
            <MicOff className="h-8 w-8 text-muted-foreground" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Speech recognition is not supported in your browser.
          <br />
          Please try Chrome, Edge, or Safari.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      {/* Mic Button */}
      <div className="relative">
        {/* Pulse rings when listening */}
        {isListening && (
          <>
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-ring" />
            <div
              className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-ring"
              style={{ animationDelay: "0.5s" }}
            />
          </>
        )}

        <Button
          onClick={handleMicClick}
          disabled={disabled || status === "processing"}
          variant={isListening ? "default" : "outline"}
          size="icon"
          className={cn(
            "h-20 w-20 rounded-full transition-all duration-200 shadow-lg",
            isListening && "bg-primary hover:bg-primary/90 scale-110",
            !isListening && "hover:scale-105"
          )}
        >
          {status === "processing" ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : isListening ? (
            <Mic className="h-8 w-8 text-primary-foreground animate-pulse" />
          ) : (
            <Mic className="h-8 w-8" />
          )}
        </Button>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full transition-colors",
            getStatusColor()
          )}
        />
        <span className="text-sm text-muted-foreground">{getStatusText()}</span>
      </div>

      {/* Transcript Display */}
      <div className="w-full max-w-md min-h-[60px] p-3 bg-muted/50 rounded-lg">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm font-mono">
            {transcript && (
              <span className="text-foreground">{transcript}</span>
            )}
            {interimTranscript && (
              <span className="text-muted-foreground italic">
                {transcript ? " " : ""}
                {interimTranscript}
              </span>
            )}
            {!transcript && !interimTranscript && !isListening && (
              <span className="text-muted-foreground">
                Press the mic button or hold Space to speak
              </span>
            )}
            {!transcript && !interimTranscript && isListening && (
              <span className="text-muted-foreground animate-pulse">
                Listening for your voice...
              </span>
            )}
          </p>
        )}
      </div>

      {/* Keyboard shortcut hint */}
      <p className="text-xs text-muted-foreground">
        Hold <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Space</kbd>{" "}
        to record
      </p>
    </div>
  );
}

export default VoiceInput;
