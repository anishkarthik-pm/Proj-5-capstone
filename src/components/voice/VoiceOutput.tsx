"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Play, Pause, Square, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useVoiceStore } from "@/lib/stores/voiceStore";
import { speak, stopSpeaking, pauseSpeaking, resumeSpeaking } from "@/services/tts";

interface VoiceOutputProps {
  text?: string;
  autoSpeak?: boolean;
  className?: string;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
}

export function VoiceOutput({
  text,
  autoSpeak = true,
  className,
  onSpeakStart,
  onSpeakEnd,
}: VoiceOutputProps) {
  const { isSpeaking, setIsSpeaking, currentResponse, speakingRate, setSpeakingRate, isMuted, setIsMuted } =
    useVoiceStore();
  const [isPaused, setIsPaused] = useState(false);
  const [displayText, setDisplayText] = useState("");

  const textToSpeak = text || currentResponse;

  // Auto-speak when new response arrives (only if not muted)
  useEffect(() => {
    if (autoSpeak && !isMuted && textToSpeak && textToSpeak !== displayText) {
      setDisplayText(textToSpeak);
      handleSpeak(textToSpeak);
    } else if (textToSpeak && textToSpeak !== displayText) {
      setDisplayText(textToSpeak);
    }
  }, [textToSpeak, autoSpeak, isMuted]);

  const handleSpeak = useCallback(
    (content: string) => {
      if (!content || isMuted) return;

      speak(content, {
        rate: speakingRate,
        onStart: () => {
          setIsSpeaking(true);
          setIsPaused(false);
          onSpeakStart?.();
        },
        onEnd: () => {
          setIsSpeaking(false);
          setIsPaused(false);
          onSpeakEnd?.();
        },
        onError: (error) => {
          console.error("TTS Error:", error);
          setIsSpeaking(false);
          setIsPaused(false);
        },
        onPause: () => setIsPaused(true),
        onResume: () => setIsPaused(false),
      });
    },
    [speakingRate, setIsSpeaking, onSpeakStart, onSpeakEnd, isMuted]
  );

  const handlePlayPause = useCallback(() => {
    if (isSpeaking && !isPaused) {
      pauseSpeaking();
    } else if (isPaused) {
      resumeSpeaking();
    } else if (textToSpeak) {
      handleSpeak(textToSpeak);
    }
  }, [isSpeaking, isPaused, textToSpeak, handleSpeak]);

  const handleStop = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
    setIsPaused(false);
  }, [setIsSpeaking]);

  const handleRateChange = useCallback(
    (value: number[]) => {
      const newRate = value[0];
      setSpeakingRate(newRate);

      // If currently speaking, restart with new rate
      if (isSpeaking && textToSpeak) {
        stopSpeaking();
        setTimeout(() => handleSpeak(textToSpeak), 100);
      }
    },
    [setSpeakingRate, isSpeaking, textToSpeak, handleSpeak]
  );

  const getRateLabel = (rate: number) => {
    if (rate <= 0.5) return "0.5x";
    if (rate <= 0.75) return "0.75x";
    if (rate >= 1.5) return "1.5x";
    if (rate >= 1.25) return "1.25x";
    return "1x";
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Response Text Display */}
      <div className="relative min-h-[80px] p-4 bg-muted/30 rounded-lg border">
        {/* Speaking Indicator */}
        {isSpeaking && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <div className="flex items-end gap-0.5 h-4">
              <div
                className="w-1 bg-primary rounded-full animate-speaking"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="w-1 bg-primary rounded-full animate-speaking"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="w-1 bg-primary rounded-full animate-speaking"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          </div>
        )}

        {textToSpeak ? (
          <p className="text-sm text-foreground leading-relaxed pr-8">
            {textToSpeak}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            AI response will appear here...
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Play/Pause Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={handlePlayPause}
          disabled={!textToSpeak}
          className="h-9 w-9"
        >
          {isSpeaking && !isPaused ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        {/* Stop Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={handleStop}
          disabled={!isSpeaking && !isPaused}
          className="h-9 w-9"
        >
          <Square className="h-4 w-4" />
        </Button>

        {/* Mute/Unmute Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setIsMuted(!isMuted);
            if (isMuted && textToSpeak) {
              handleSpeak(textToSpeak);
            } else if (!isMuted && isSpeaking) {
              stopSpeaking();
            }
          }}
          className="h-9 w-9"
          title={isMuted ? "Unmute audio" : "Mute audio"}
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>

        {/* Speed Control */}
        <div className="flex items-center gap-2 flex-1">
          <Slider
            value={[speakingRate]}
            onValueChange={handleRateChange}
            min={0.5}
            max={1.5}
            step={0.25}
            className="flex-1 max-w-[100px]"
            disabled={isMuted}
          />
          <span className="text-xs text-muted-foreground w-10">
            {getRateLabel(speakingRate)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default VoiceOutput;
