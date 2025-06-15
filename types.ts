export interface GroundingChunkWeb {
  uri: string;
  title?: string;
}

export interface GroundingChunk {
  web?: GroundingChunkWeb;
  retrievedContext?: any; // For other types of grounding, not actively used by UI yet
  // API might return other keys, e.g. "source_id"
  [key: string]: any;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'gemini' | 'system';
  text: string;
  timestamp: Date;
  groundingChunks?: GroundingChunk[]; // Added for search grounding results
  isLoading?: boolean; // Added to indicate if this is a temporary loading/generating message
}

export enum AppStatus {
  IDLE = "IDLE", // Not listening, session might be inactive
  BOOTING_SPEECH = "BOOTING_SPEECH", // Initializing speech services
  LISTENING = "LISTENING", // Actively listening for user input
  PROCESSING_COMMAND = "PROCESSING_COMMAND", // User spoke, deciding action
  SENDING_TO_GEMINI = "SENDING_TO_GEMINI", // Waiting for Gemini response
  SPEAKING = "SPEAKING", // App is speaking (e.g., Gemini's response)
  SLEEPING = "SLEEPING", // User explicitly paused listening
  ERROR = "ERROR", // An error occurred
  SESSION_ENDED = "SESSION_ENDED", // Session explicitly ended by user
}

export interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  isSupported: boolean;
}

export interface SpeechSynthesisHook {
  speak: (text: string, onEnd?: () => void) => void;
  cancel: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}