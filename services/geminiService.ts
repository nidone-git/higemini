// services/geminiService.ts
import { 
  GoogleGenAI, 
  Chat, 
  GenerateContentResponse,
  // HarmCategory, // Not used yet, but good to be aware of
  // HarmBlockThreshold // Not used yet
} from "@google/genai";
import { GEMINI_MODEL_NAME } from "../constants";
import { GroundingChunk } from "../types";

let ai: GoogleGenAI;
let currentChat: Chat | null = null;
let isApiKeyMissingError = false;

try {
    const apiKey = process.env.API_KEY; // Use environment variable for API key
    if (!apiKey) { // Check if the API key is not set
        console.error("API_KEY is not set in environment variables. Gemini Service will not be available.");
        isApiKeyMissingError = true;
    } else {
        ai = new GoogleGenAI({ apiKey });
    }
} catch (error) {
    console.error("Failed to initialize GoogleGenAI. Gemini Service will not be available.", error);
    isApiKeyMissingError = true; // Treat initialization failure same as missing key for availability
}

export function isGeminiAvailable(): boolean {
  return !isApiKeyMissingError && !!ai;
}

export async function startNewChatSession(systemInstruction?: string) {
  if (!isGeminiAvailable()) {
    console.error("Gemini AI is not available (API key issue or initialization failed). Cannot start new chat session.");
    return;
  }
  try {
    const chatCreationConfig: { model: string; config?: { systemInstruction: string } } = {
        model: GEMINI_MODEL_NAME,
    };
    if (systemInstruction) {
        chatCreationConfig.config = { systemInstruction };
    }
    currentChat = ai.chats.create(chatCreationConfig);
    console.log("New chat session started with model:", GEMINI_MODEL_NAME);
  } catch (error) {
    console.error("Error starting new chat session:", error);
    currentChat = null; 
  }
}

export function endChatSession() {
  currentChat = null;
  console.log("Chat session ended.");
}

export async function sendMessageToGeminiStream(
  prompt: string,
  onChunk: (text: string) => void, // This will now be called once with the full text
  onError: (error: any) => void,
  onComplete: (fullText: string, groundingChunks?: GroundingChunk[]) => void, // Added fullText parameter
  shouldUseGoogleSearch?: boolean
) {
  if (!currentChat) {
    onError(new Error("Chat session is not active. Please start a new session."));
    return;
  }

  try {
    const messageSendingConfig: { tools?: any[]; responseMimeType?: string } = {}; 
    
    if (shouldUseGoogleSearch) {
      messageSendingConfig.tools = [{ googleSearch: {} }];
    }
    
    // Use sendMessage (non-streaming) instead of sendMessageStream
    const result: GenerateContentResponse = await currentChat.sendMessage({
        message: prompt,
        config: Object.keys(messageSendingConfig).length > 0 ? messageSendingConfig : undefined,
    });

    const responseText = result.text || ""; // Ensure responseText is a string, defaulting to empty
    // Though onChunk might seem redundant if onComplete gets the full text,
    // keeping it for now in case future logic wants to differentiate partial vs full.
    // For current non-streaming behavior, it's effectively called once.
    if (responseText) { 
      onChunk(responseText); 
    }
    
    let finalGroundingChunks: GroundingChunk[] | undefined;
    if (result.candidates && result.candidates[0] && result.candidates[0].groundingMetadata && result.candidates[0].groundingMetadata.groundingChunks) {
      finalGroundingChunks = result.candidates[0].groundingMetadata.groundingChunks as GroundingChunk[];
    }
    
    onComplete(responseText, finalGroundingChunks); // Pass responseText to onComplete

  } catch (error) {
    console.error("Error sending message to Gemini:", error);
    onError(error);
  }
}