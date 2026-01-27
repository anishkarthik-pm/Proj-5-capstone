"use client";

interface SpeakOptions {
  rate?: number; // 0.1 to 10, default 1
  pitch?: number; // 0 to 2, default 1
  volume?: number; // 0 to 1, default 1
  voice?: SpeechSynthesisVoice;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  onPause?: () => void;
  onResume?: () => void;
}

class TTSService {
  private synthesis: SpeechSynthesis | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private isInitialized = false;
  private isPaused = false;
  private queue: Array<{ text: string; options?: SpeakOptions }> = [];
  private isSpeaking = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.synthesis = window.speechSynthesis;
      this.init();
    }
  }

  private init() {
    if (!this.synthesis) return;

    // Load voices
    const loadVoices = () => {
      this.voices = this.synthesis!.getVoices();
      this.selectPreferredVoice();
      this.isInitialized = true;
    };

    // Voices may be loaded asynchronously
    if (this.synthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      this.synthesis.addEventListener("voiceschanged", loadVoices);
    }
  }

  private selectPreferredVoice() {
    // Prefer Indian English voice
    const indianEnglish = this.voices.find(
      (v) =>
        v.lang === "en-IN" ||
        v.name.toLowerCase().includes("india") ||
        v.name.toLowerCase().includes("indian")
    );

    if (indianEnglish) {
      this.preferredVoice = indianEnglish;
      return;
    }

    // Fallback to any English voice
    const englishVoice = this.voices.find(
      (v) => v.lang.startsWith("en-") && v.localService
    );

    if (englishVoice) {
      this.preferredVoice = englishVoice;
      return;
    }

    // Use default
    this.preferredVoice = this.voices[0] || null;
  }

  /**
   * Get all available voices
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  /**
   * Get voices filtered by language
   */
  getVoicesByLanguage(langCode: string): SpeechSynthesisVoice[] {
    return this.voices.filter((v) => v.lang.startsWith(langCode));
  }

  /**
   * Check if TTS is supported
   */
  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /**
   * Speak text with options
   */
  speak(text: string, options: SpeakOptions = {}): void {
    if (!this.synthesis || !this.isSupported()) {
      options.onError?.("Text-to-speech is not supported in this browser");
      return;
    }

    // Add to queue if currently speaking
    if (this.isSpeaking) {
      this.queue.push({ text, options });
      return;
    }

    this.speakNow(text, options);
  }

  private speakNow(text: string, options: SpeakOptions = {}): void {
    if (!this.synthesis) return;

    // Cancel any current speech
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Set voice
    utterance.voice = options.voice || this.preferredVoice;

    // Set options with defaults
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;

    // Event handlers
    utterance.onstart = () => {
      this.isSpeaking = true;
      this.isPaused = false;
      options.onStart?.();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.isPaused = false;
      options.onEnd?.();
      this.processQueue();
    };

    utterance.onerror = (event) => {
      this.isSpeaking = false;
      this.isPaused = false;
      options.onError?.(event.error || "Speech synthesis error");
      this.processQueue();
    };

    utterance.onpause = () => {
      this.isPaused = true;
      options.onPause?.();
    };

    utterance.onresume = () => {
      this.isPaused = false;
      options.onResume?.();
    };

    this.utterance = utterance;
    this.synthesis.speak(utterance);
  }

  private processQueue(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.speakNow(next.text, next.options);
    }
  }

  /**
   * Stop current speech
   */
  stop(): void {
    if (!this.synthesis) return;

    this.synthesis.cancel();
    this.isSpeaking = false;
    this.isPaused = false;
    this.queue = [];
  }

  /**
   * Pause current speech
   */
  pause(): void {
    if (!this.synthesis || !this.isSpeaking) return;

    this.synthesis.pause();
  }

  /**
   * Resume paused speech
   */
  resume(): void {
    if (!this.synthesis || !this.isPaused) return;

    this.synthesis.resume();
  }

  /**
   * Check if currently speaking
   */
  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Check if paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Clear the speech queue
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Set the preferred voice
   */
  setPreferredVoice(voice: SpeechSynthesisVoice): void {
    this.preferredVoice = voice;
  }
}

// Singleton instance
let ttsService: TTSService | null = null;

export function getTTSService(): TTSService {
  if (!ttsService) {
    ttsService = new TTSService();
  }
  return ttsService;
}

// Convenience functions
export function speak(text: string, options?: SpeakOptions): void {
  getTTSService().speak(text, options);
}

export function stopSpeaking(): void {
  getTTSService().stop();
}

export function pauseSpeaking(): void {
  getTTSService().pause();
}

export function resumeSpeaking(): void {
  getTTSService().resume();
}

export function getVoices(): SpeechSynthesisVoice[] {
  return getTTSService().getVoices();
}

export default TTSService;
