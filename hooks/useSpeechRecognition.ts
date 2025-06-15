import { useState, useEffect, useCallback, useRef } from 'react';
import { SpeechRecognitionHook } from '../types';

// Minimal type definitions for Web Speech API to satisfy TypeScript
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface CustomSpeechRecognitionEvent extends Event { // Renamed to avoid conflict if global types exist
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface CustomSpeechRecognitionErrorEvent extends Event { // Renamed and simplified
  readonly error: string; 
  // readonly message: string; // Not strictly needed by current code
}

// Interface for the SpeechRecognition instance itself
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((this: ISpeechRecognition, ev: CustomSpeechRecognitionEvent) => any) | null;
  onerror: ((this: ISpeechRecognition, ev: CustomSpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => any) | null; // onend takes a basic Event
  start(): void;
  stop(): void;
  abort(): void; // Added abort as it might be called by effect cleanup
}


const useSpeechRecognition = (): SpeechRecognitionHook => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const isListeningRef = useRef(isListening); // Ref to track isListening state for onend

  // Keep isListeningRef in sync with isListening state
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn("SpeechRecognition API not supported.");
      setIsSupported(false);
      setError("SpeechRecognition API not supported in this browser.");
      return;
    }

    recognitionRef.current = new SpeechRecognitionAPI() as ISpeechRecognition;
    const recognition = recognitionRef.current;
    
    recognition.continuous = true; 
    recognition.interimResults = true; 
    recognition.lang = 'ja-JP'; // Changed from 'en-US' to 'ja-JP'

    recognition.onresult = (event: CustomSpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const resultItem = event.results.item(i); // Use item() for safety
        if (resultItem.isFinal) {
          finalTranscript += resultItem.item(0).transcript;
        } else {
          interimTranscript += resultItem.item(0).transcript;
        }
      }
      setTranscript(finalTranscript.trim() || interimTranscript.trim()); 
    };

    recognition.onerror = (event: CustomSpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      let errorMessage = `音声認識エラー: ${event.error}`; // Translated error message prefix
      if (event.error === 'no-speech') {
        errorMessage = '音声が検出されませんでした。もう一度お試しください。'; // Translated
      } else if (event.error === 'audio-capture') {
        errorMessage = '音声キャプチャに失敗しました。マイクが接続され、許可されていますか？'; // Translated
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { // Added 'service-not-allowed' for broader coverage
        errorMessage = 'マイクへのアクセスが拒否されました。マイクの権限を有効にしてください。'; // Translated
      }
      setError(errorMessage);
      setIsListening(false); 
    };

    recognition.onend = () => {
      // If recognition stops and the app thought it was listening, update the state.
      // This handles cases where recognition stops automatically (e.g., after long silence).
      if (isListeningRef.current) {
        setIsListening(false);
        // console.log("Speech recognition ended unexpectedly, setting isListening to false.");
      } else {
        // console.log("Speech recognition ended (expectedly).");
      }
    };
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        try {
            recognitionRef.current.abort(); 
        } catch (e) {
            console.warn("Error aborting speech recognition:", e);
            try {
                recognitionRef.current.stop();
            } catch (stopError) {
                console.warn("Error stopping speech recognition:", stopError);
            }
        }
      }
    };
  }, []); // Empty dependency array, runs once on mount

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListeningRef.current) return; // Use ref for current check
    try {
      setTranscript('');
      setError(null);
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      console.error("Error starting speech recognition:", e);
      setError("聞き取りの開始に失敗しました。マイクが利用可能であることを確認してください。"); // Translated
      setIsListening(false);
    }
  }, []); // Removed isListening from dependency array, using ref

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListeningRef.current) return; // Use ref for current check
    try {
        recognitionRef.current.stop();
    } catch (e) {
        console.warn("Error stopping speech recognition during explicit stop:", e);
    }
    // Note: setIsListening(false) will be called by the onend handler
    // if recognition.stop() successfully triggers it.
    // If onend is not reliably triggered by stop(), then setIsListening(false) should be here.
    // For now, relying on onend.
    // setIsListening(false); // Can be added here for immediate state update if onend is slow/unreliable.
  }, []); // Removed isListening from dependency array, using ref

  return { isListening, transcript, error, startListening, stopListening, isSupported };
};

export default useSpeechRecognition;