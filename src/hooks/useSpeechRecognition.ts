"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useVoiceStore } from "@/lib/stores/voiceStore";

interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  silenceTimeout?: number;
  maxDuration?: number;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

// Extend Window interface for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const {
    continuous = false,
    silenceTimeout = 3000,
    maxDuration = 30000,
    onResult,
    onError,
  } = options;

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const {
    setIsListening,
    setTranscript,
    setInterimTranscript,
    setError,
    isListening,
    transcript,
    interimTranscript,
    error,
  } = useVoiceStore();

  // Check browser support
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setError("Speech recognition is not supported in this browser");
    }
  }, [setError]);

  // Initialize recognition
  const initRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = "en-IN"; // Indian English

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setTranscript("");
      setInterimTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Reset silence timer on any result
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      let finalTranscript = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript);
        setInterimTranscript("");
        onResult?.(finalTranscript);
      } else {
        setInterimTranscript(interimText);
      }

      // Set silence timer
      if (!continuous) {
        silenceTimerRef.current = setTimeout(() => {
          stopListening();
        }, silenceTimeout);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessage = getErrorMessage(event.error);
      setError(errorMessage);
      setIsListening(false);
      onError?.(errorMessage);
    };

    recognition.onend = () => {
      setIsListening(false);
      clearTimers();
    };

    return recognition;
  }, [
    continuous,
    silenceTimeout,
    setIsListening,
    setError,
    setTranscript,
    setInterimTranscript,
    onResult,
    onError,
  ]);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition is not supported");
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = initRecognition();
    if (!recognition) {
      setError("Failed to initialize speech recognition");
      return;
    }

    recognitionRef.current = recognition;

    try {
      recognition.start();

      // Set max duration timer
      maxDurationTimerRef.current = setTimeout(() => {
        stopListening();
      }, maxDuration);
    } catch (err) {
      setError("Failed to start speech recognition");
      console.error("Speech recognition start error:", err);
    }
  }, [isSupported, initRecognition, maxDuration, setError]);

  const stopListening = useCallback(() => {
    clearTimers();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // Recognition might already be stopped
        console.warn("Stop recognition warning:", err);
      }
    }

    setIsListening(false);
  }, [clearTimers, setIsListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, [setTranscript, setInterimTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [clearTimers]);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}

function getErrorMessage(error: string): string {
  switch (error) {
    case "no-speech":
      return "No speech was detected. Please try again.";
    case "audio-capture":
      return "No microphone was found or microphone access was denied.";
    case "not-allowed":
      return "Microphone permission was denied. Please allow microphone access.";
    case "network":
      return "Network error occurred. Please check your connection.";
    case "aborted":
      return "Speech recognition was aborted.";
    case "service-not-allowed":
      return "Speech recognition service is not allowed.";
    default:
      return `Speech recognition error: ${error}`;
  }
}

export default useSpeechRecognition;
