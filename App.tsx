import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage, AppStatus, GroundingChunk } from './types';
import useSpeechRecognition from './hooks/useSpeechRecognition';
import useSpeechSynthesis from './hooks/useSpeechSynthesis';
import { 
  sendMessageToGeminiStream, 
  startNewChatSession, 
  endChatSession,
  isGeminiAvailable 
} from './services/geminiService';
import {
  VOICE_COMMAND_WAKE_UP,
  VOICE_COMMAND_SLEEP,
  VOICE_COMMAND_SLEEP_ALT,
  VOICE_COMMAND_REPEAT,
  VOICE_COMMAND_REPEAT_ALT,
  VOICE_COMMAND_END_SESSION,
  VOICE_COMMAND_END_SESSION_ALT,
  SYSTEM_MESSAGE_WELCOME,
  SYSTEM_MESSAGE_MIC_ON, 
  SYSTEM_MESSAGE_SLEEPING,
  SYSTEM_MESSAGE_SLEEP_CONFIRMATION,
  SYSTEM_MESSAGE_SESSION_ENDED,
  SYSTEM_MESSAGE_PROCESSING,
  SYSTEM_MESSAGE_PROCESSING_SR,
  SYSTEM_MESSAGE_GEMINI_ERROR,
  SYSTEM_MESSAGE_SPEECH_UNSUPPORTED,
  SYSTEM_MESSAGE_MICROPHONE_ERROR,
  SYSTEM_MESSAGE_NO_API_KEY,
  JA_STATUS_AI_SPEAKING,
  JA_BUTTON_TEXT_START,
  JA_BUTTON_TEXT_SEND,
  JA_BUTTON_TEXT_STOP_SPEAKING,
  JA_BUTTON_TEXT_RETRY,
  JA_BUTTON_ARIA_TAP_TO_START_CONVERSATION,
  JA_BUTTON_ARIA_SPEAKING_TAP_TO_SEND,
  JA_BUTTON_ARIA_STOP_SPEAKING,
  DEBOUNCE_TIME_MS,
  JA_SYSTEM_MESSAGE_GEMINI_NO_RESPONSE,
  JA_SYSTEM_MESSAGE_GEMINI_EMPTY_RESPONSE_FOR_CHAT,
  JA_GEMINI_GENERATING_MESSAGE
} from './constants';
import Spinner from './components/Spinner';

const JA_GEMINI_SYSTEM_INSTRUCTION = "あなたは視覚に障がいのあるユーザーのための、親切で忍耐強いAIアシスタントです。回答は簡潔かつ明確に、日本語でお願いします。ユーザーが「今日のニュース」や特定のトピックに関する最新情報など、リアルタイムの情報や具体的な事実を尋ねた場合、単に質問の形式を繰り返すのではなく、実際に情報を検索し、具体的な内容を要約して提供してください。例えば、「今日のニュースは〇〇です」のようなプレースホルダーやテンプレートではなく、実際のニュースのヘッドラインや概要を述べるようにしてください。";
const JA_NOTHING_TO_REPEAT = "繰り返す内容がありません。";
const JA_STATUS_LABEL = "ステータス:";
const JA_SENDER_USER = "ユーザー";
const JA_SENDER_GEMINI = "Gemini";
const JA_SENDER_SYSTEM = "システム";
const JA_ERROR_TITLE = "⚠ アプリケーションエラー";
const JA_FOOTER_BEST_EXPERIENCE = "最適な体験のためには、マイクアクセスを有効にしたChromeなどの最新ブラウザをご利用ください。";

interface AddMessageOptions {
  id?: string;
  isLoading?: boolean;
  groundingChunks?: GroundingChunk[];
}

const SimpleErrorDisplay: React.FC<{ title: string; message: string; footer?: string }> = ({ title, message, footer }) => (
  <div className="flex flex-col min-h-screen text-gray-100 p-4 items-center justify-center font-sans bg-indigo-900">
    <div className="w-full max-w-md bg-red-700 border border-red-800 text-white p-6 rounded-lg shadow-xl text-center">
      <h2 className="font-bold text-xl mb-3">{title}</h2>
      <p className="text-md">{message}</p>
    </div>
    {footer && <p className="mt-6 text-center text-sm text-gray-400">{footer}</p>}
  </div>
);


const App: React.FC = () => {
  const geminiIsReady = isGeminiAvailable();

  if (!geminiIsReady) {
    console.error("App.tsx: Gemini API key is not available. Rendering API key error message.");
    return (
      <SimpleErrorDisplay 
        title={JA_ERROR_TITLE}
        message={SYSTEM_MESSAGE_NO_API_KEY}
      />
    );
  }

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [appStatus, setAppStatus] = useState<AppStatus>(AppStatus.BOOTING_SPEECH);
  const [statusMessage, setStatusMessage] = useState<string>("初期化中...");

  const speechRecognition = useSpeechRecognition();
  const speechSynthesis = useSpeechSynthesis();
  const transcriptProcessingTimeoutRef = useRef<number | null>(null);
  const lastSpokenMessageRef = useRef<string | null>(null);
  const lastProcessedRawTranscriptRef = useRef<string | null>(null);
  const finalTranscriptForProcessingRef = useRef<string>(''); 
  const appStatusRef = useRef(appStatus);
  const interruptSpeechRef = useRef(false); 

  useEffect(() => {
    appStatusRef.current = appStatus;
  }, [appStatus]);

  const addMessage = useCallback((
    sender: ChatMessage['sender'], 
    text: string, 
    options?: AddMessageOptions
  ): string => { 
    const newId = options?.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newIsLoading = options?.isLoading || false;
    const newGroundingChunks = options?.groundingChunks;
  
    setChatMessages(prev => [
      ...prev, 
      { 
        id: newId, 
        sender, 
        text, 
        timestamp: new Date(), 
        groundingChunks: newGroundingChunks,
        isLoading: newIsLoading 
      }
    ]);
    return newId; 
  }, []);

  const speakAndSetStatus = useCallback((
    text: string, 
    newStatusAfterSpeaking?: AppStatus, 
    newStatusMessageAfterSpeaking?: string
  ) => {
    interruptSpeechRef.current = false; 
    const textToSpeak = text.trim();
    
    if (speechRecognition.isListening) {
      speechRecognition.stopListening();
    }

    if (textToSpeak) {
      setStatusMessage(appStatusRef.current === AppStatus.SPEAKING ? JA_STATUS_AI_SPEAKING : textToSpeak);
    } else if (newStatusMessageAfterSpeaking) {
      setStatusMessage(newStatusMessageAfterSpeaking);
    }

    const onSpeechEnd = () => {
      if (interruptSpeechRef.current) {
        if (speechRecognition.isListening) {
           speechRecognition.stopListening();
        }
        return; 
      }

      const finalStatusToSet = newStatusAfterSpeaking !== undefined ? newStatusAfterSpeaking : appStatusRef.current;
      const finalStatusMessage = newStatusMessageAfterSpeaking !== undefined ? newStatusMessageAfterSpeaking : 
                                 (finalStatusToSet === AppStatus.SPEAKING ? JA_STATUS_AI_SPEAKING : statusMessage); 

      setAppStatus(finalStatusToSet);
      setStatusMessage(finalStatusMessage); 

      if (finalStatusToSet === AppStatus.LISTENING) {
        if (speechRecognition.isSupported && !speechRecognition.isListening) { 
          // console.log("[speakAndSetStatus onEnd] Setting to LISTENING, attempting to start recognition. Current speechRecognition.isListening:", speechRecognition.isListening);
          // Add a small delay to ensure any previous stopListening has fully processed
          setTimeout(() => {
            if (appStatusRef.current === AppStatus.LISTENING && !speechRecognition.isListening) {
                 speechRecognition.startListening();
            }
          }, 150);
        } else if (!speechRecognition.isSupported) {
           console.warn("[speakAndSetStatus onEnd] Setting to LISTENING, but speech recognition not supported.");
        }
      } else { 
        if (speechRecognition.isListening) {
          // console.log("[speakAndSetStatus onEnd] Status is NOT LISTENING, stopping recognition if active.");
          speechRecognition.stopListening();
        }
      }
    };

    if (textToSpeak) {
      lastSpokenMessageRef.current = textToSpeak;
      setAppStatus(AppStatus.SPEAKING); 
      setStatusMessage(JA_STATUS_AI_SPEAKING); 
      speechSynthesis.speak(textToSpeak, onSpeechEnd);
    } else {
      onSpeechEnd();
    }
  }, [speechSynthesis, speechRecognition, setStatusMessage, setAppStatus, statusMessage]);


  useEffect(() => {
    // Attempt to unregister any service workers.
    // This is a workaround for environments that might auto-register them.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        if (registrations.length > 0) {
          console.log('[App.tsx] Found active service workers, attempting to unregister them.');
          for (let registration of registrations) {
            registration.unregister()
              .then(unregistered => {
                if (unregistered) {
                  console.log('[App.tsx] Service Worker unregistered successfully. Please reload the page.');
                  // Optionally, inform the user or prompt for a reload
                  // alert("Service Worker unregistered. Please reload the page for changes to take effect.");
                } else {
                  console.log('[App.tsx] Service Worker unregistration failed for one registration.');
                }
              })
              .catch(error => {
                console.error('[App.tsx] Error unregistering Service Worker:', error);
              });
          }
        } else {
          console.log('[App.tsx] No active service workers found to unregister.');
        }
      }).catch(error => {
        console.error('[App.tsx] Error getting Service Worker registrations:', error);
      });
    }

    if (!speechRecognition.isSupported || !speechSynthesis.isSupported) {
      console.warn("App.tsx useEffect init: Speech recognition or synthesis not supported.");
      setStatusMessage(SYSTEM_MESSAGE_SPEECH_UNSUPPORTED);
      setAppStatus(AppStatus.ERROR);
      return; 
    }

    console.log("App.tsx useEffect init: API key and speech support OK. Initializing chat session and setting welcome state.");
    startNewChatSession(JA_GEMINI_SYSTEM_INSTRUCTION);
    setStatusMessage(SYSTEM_MESSAGE_WELCOME);
    setAppStatus(AppStatus.IDLE);
    lastProcessedRawTranscriptRef.current = null;
    
  }, [speechRecognition.isSupported, speechSynthesis.isSupported]);

  // Bfcache handling
  useEffect(() => {
    const handlePageHide = () => {
      console.log('Page is being hidden (pagehide event). Cleaning up for bfcache.');
      interruptSpeechRef.current = true; // Signal to interrupt any ongoing/pending speech

      if (speechRecognition.isListening) {
        speechRecognition.stopListening();
      }
      if (speechSynthesis.isSpeaking) {
        speechSynthesis.cancel();
      }
      if (transcriptProcessingTimeoutRef.current) {
        clearTimeout(transcriptProcessingTimeoutRef.current);
      }
      // Set a state that's safe if the page is never restored
      // or if it's restored from bfcache (pageshow will handle it).
      // Setting to SLEEPING to prevent auto-listening if restored.
      setAppStatus(AppStatus.SLEEPING); 
      setStatusMessage(SYSTEM_MESSAGE_SLEEPING);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        console.log('Page has been restored from back/forward cache (pageshow event).');
        interruptSpeechRef.current = false; // Reset interrupt flag

        // Re-evaluate current state. If an error state, keep it.
        if (appStatusRef.current === AppStatus.ERROR) {
            // Keep error state and message
            // speechRecognition.error or no API key would already be handled
             if (statusMessage !== SYSTEM_MESSAGE_NO_API_KEY && statusMessage !== SYSTEM_MESSAGE_SPEECH_UNSUPPORTED && statusMessage !== SYSTEM_MESSAGE_MICROPHONE_ERROR) {
                // If it was a generic error, perhaps reset to welcome
                 setStatusMessage(SYSTEM_MESSAGE_WELCOME);
                 setAppStatus(AppStatus.IDLE);
             }
        } else if(appStatusRef.current === AppStatus.SESSION_ENDED){
             setStatusMessage(SYSTEM_MESSAGE_SESSION_ENDED);
             setAppStatus(AppStatus.SESSION_ENDED); // Stay in session ended
        } else {
             // For other states (IDLE, LISTENING, SPEAKING, SENDING_TO_GEMINI, SLEEPING),
             // it's generally safest to reset to a known, stable state.
             // SLEEPING is a good default as it requires user action to restart.
             setStatusMessage(SYSTEM_MESSAGE_SLEEPING);
             setAppStatus(AppStatus.SLEEPING);
        }
        // If speech was unsupported, it will still be an error (handled by initial checks).
      } else {
        console.log('Page is being shown (pageshow event, not from bfcache).');
        // This is a normal page load, no special action needed here as other useEffects will run.
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      if (transcriptProcessingTimeoutRef.current) {
        clearTimeout(transcriptProcessingTimeoutRef.current);
      }
    };
  }, []); // Empty dependency array: runs once on mount and cleans up on unmount


  const handleUserQuery = useCallback((query: string) => {
    if (!query.trim()) return;

    addMessage('user', query);
    setAppStatus(AppStatus.SENDING_TO_GEMINI); 
    setStatusMessage(SYSTEM_MESSAGE_PROCESSING_SR); 
    
    const geminiLoadingMessageId = addMessage('gemini', JA_GEMINI_GENERATING_MESSAGE, { isLoading: true });

    const shouldUseGoogleSearch = true; 

    sendMessageToGeminiStream(
      query,
      () => { /* onChunk no longer used for partial display */ },
      (error) => {
        console.error("Gemini stream error:", error);
        setChatMessages(prevMessages =>
            prevMessages.map(msg =>
              msg.id === geminiLoadingMessageId
                ? { ...msg, text: SYSTEM_MESSAGE_GEMINI_ERROR, isLoading: false, sender: 'system', timestamp: new Date() }
                : msg
            )
          );
        speakAndSetStatus(SYSTEM_MESSAGE_GEMINI_ERROR, AppStatus.SLEEPING, SYSTEM_MESSAGE_SLEEPING);
      },
      (fullTextFromOnComplete, finalGroundingChunks) => { 
        const fullResponse = fullTextFromOnComplete.trim();
        if (fullResponse) {
            setChatMessages(prevMessages =>
              prevMessages.map(msg =>
                msg.id === geminiLoadingMessageId
                  ? { ...msg, text: fullResponse, isLoading: false, groundingChunks: finalGroundingChunks, timestamp: new Date() }
                  : msg
              )
            );
            speakAndSetStatus(fullResponse, AppStatus.SLEEPING, SYSTEM_MESSAGE_SLEEPING);
        } else {
            setChatMessages(prevMessages =>
              prevMessages.map(msg =>
                msg.id === geminiLoadingMessageId
                  ? { ...msg, text: JA_SYSTEM_MESSAGE_GEMINI_EMPTY_RESPONSE_FOR_CHAT, isLoading: false, sender: 'system', groundingChunks: finalGroundingChunks, timestamp: new Date() }
                  : msg
              )
            );
            speakAndSetStatus(JA_SYSTEM_MESSAGE_GEMINI_NO_RESPONSE, AppStatus.SLEEPING, SYSTEM_MESSAGE_SLEEPING); 
        }
      },
      shouldUseGoogleSearch
    );
  }, [addMessage, speakAndSetStatus]);

  const processVoiceCommand = useCallback((transcript: string) => {
    const lowerTranscript = transcript.toLowerCase().trim();
    if (!lowerTranscript) return false;

    if (lowerTranscript.includes(VOICE_COMMAND_SLEEP) || lowerTranscript.includes(VOICE_COMMAND_SLEEP_ALT)) {
        const wasSpeaking = speechSynthesis.isSpeaking || appStatusRef.current === AppStatus.SPEAKING;
        if (wasSpeaking) {
            interruptSpeechRef.current = true;
            speechSynthesis.cancel(); 
        }
        if (transcriptProcessingTimeoutRef.current) {
            clearTimeout(transcriptProcessingTimeoutRef.current);
        }
        lastProcessedRawTranscriptRef.current = "__INTERRUPTED_SLEEP_CMD__" + Date.now();
        finalTranscriptForProcessingRef.current = '';

        if (!wasSpeaking) { 
            setAppStatus(AppStatus.SLEEPING);
            setStatusMessage(SYSTEM_MESSAGE_SLEEPING); 
            speakAndSetStatus(SYSTEM_MESSAGE_SLEEP_CONFIRMATION, AppStatus.SLEEPING, SYSTEM_MESSAGE_SLEEPING);
        } else {
            setAppStatus(AppStatus.SLEEPING);
            setStatusMessage(SYSTEM_MESSAGE_SLEEPING);
        }
        return true; 
    }
    if (lowerTranscript.includes(VOICE_COMMAND_END_SESSION) || lowerTranscript.includes(VOICE_COMMAND_END_SESSION_ALT)) {
        const wasSpeaking = speechSynthesis.isSpeaking || appStatusRef.current === AppStatus.SPEAKING;
        if (wasSpeaking) {
            interruptSpeechRef.current = true;
            speechSynthesis.cancel();
        }
        if (transcriptProcessingTimeoutRef.current) {
            clearTimeout(transcriptProcessingTimeoutRef.current);
        }
        
        endChatSession();
        lastProcessedRawTranscriptRef.current = "__INTERRUPTED_END_CMD__" + Date.now();
        finalTranscriptForProcessingRef.current = '';
        setChatMessages([]); 

        if (!wasSpeaking) {
            setAppStatus(AppStatus.SESSION_ENDED);
            setStatusMessage(SYSTEM_MESSAGE_SESSION_ENDED);
            speakAndSetStatus(SYSTEM_MESSAGE_SESSION_ENDED, AppStatus.SESSION_ENDED, SYSTEM_MESSAGE_SESSION_ENDED);
        } else {
            setAppStatus(AppStatus.SESSION_ENDED);
            setStatusMessage(SYSTEM_MESSAGE_SESSION_ENDED);
        }
        return true; 
    }

    if (appStatusRef.current === AppStatus.SENDING_TO_GEMINI || appStatusRef.current === AppStatus.PROCESSING_COMMAND) {
        return false; 
    }
    
    if (appStatusRef.current === AppStatus.IDLE || appStatusRef.current === AppStatus.SESSION_ENDED || appStatusRef.current === AppStatus.SLEEPING || appStatusRef.current === AppStatus.ERROR) {
      if (lowerTranscript.includes(VOICE_COMMAND_WAKE_UP)) {
        lastProcessedRawTranscriptRef.current = null; 
        finalTranscriptForProcessingRef.current = '';
        startNewChatSession(JA_GEMINI_SYSTEM_INSTRUCTION); 
        setChatMessages([]); 
        speakAndSetStatus(SYSTEM_MESSAGE_MIC_ON, AppStatus.LISTENING, SYSTEM_MESSAGE_MIC_ON); 
        return true;
      }
    } else if (appStatusRef.current === AppStatus.LISTENING || appStatusRef.current === AppStatus.SPEAKING) { 
      if (lowerTranscript.includes(VOICE_COMMAND_REPEAT) || lowerTranscript.includes(VOICE_COMMAND_REPEAT_ALT)) {
        if (speechSynthesis.isSpeaking || appStatusRef.current === AppStatus.SPEAKING) {
            interruptSpeechRef.current = true;
            speechSynthesis.cancel(); 
        }
        
        const messageToRepeat = lastSpokenMessageRef.current || JA_NOTHING_TO_REPEAT;
        speakAndSetStatus(messageToRepeat, AppStatus.SLEEPING, SYSTEM_MESSAGE_SLEEPING); 
        return true;
      }
    }
    return false; 
  }, [speechSynthesis, speakAndSetStatus, setChatMessages, appStatusRef, setStatusMessage, setAppStatus]); 

 useEffect(() => {
    const transcript = speechRecognition.transcript;

    if (appStatusRef.current === AppStatus.SPEAKING && interruptSpeechRef.current) {
        return;
    }

    if (transcript && transcript !== lastProcessedRawTranscriptRef.current) {
        if (transcriptProcessingTimeoutRef.current) {
            clearTimeout(transcriptProcessingTimeoutRef.current);
        }
        
        transcriptProcessingTimeoutRef.current = window.setTimeout(() => {
            if (appStatusRef.current === AppStatus.SPEAKING && interruptSpeechRef.current) {
                return;
            }

            const currentTranscriptAfterDebounce = speechRecognition.transcript; 
            
            if (currentTranscriptAfterDebounce.trim() && currentTranscriptAfterDebounce !== lastProcessedRawTranscriptRef.current) {
               const commandProcessed = processVoiceCommand(currentTranscriptAfterDebounce);
                if (!commandProcessed || 
                    (!currentTranscriptAfterDebounce.toLowerCase().includes(VOICE_COMMAND_SLEEP) &&
                     !currentTranscriptAfterDebounce.toLowerCase().includes(VOICE_COMMAND_SLEEP_ALT) &&
                     !currentTranscriptAfterDebounce.toLowerCase().includes(VOICE_COMMAND_END_SESSION) &&
                     !currentTranscriptAfterDebounce.toLowerCase().includes(VOICE_COMMAND_END_SESSION_ALT) &&
                     !currentTranscriptAfterDebounce.toLowerCase().includes(VOICE_COMMAND_WAKE_UP) 
                    )) {
                    lastProcessedRawTranscriptRef.current = currentTranscriptAfterDebounce;
                }
            }
        }, DEBOUNCE_TIME_MS);
    }

    return () => {
        if (transcriptProcessingTimeoutRef.current) {
            clearTimeout(transcriptProcessingTimeoutRef.current);
        }
    };
  }, [speechRecognition.transcript, processVoiceCommand]);


  useEffect(() => {
    if (
      appStatus === AppStatus.LISTENING &&
      !speechRecognition.isListening && 
      !speechSynthesis.isSpeaking && 
      finalTranscriptForProcessingRef.current === '' && 
      !interruptSpeechRef.current 
    ) {
        if (!lastProcessedRawTranscriptRef.current?.startsWith("__INTERRUPTED") && 
            !lastProcessedRawTranscriptRef.current?.startsWith("__TAP_EMPTY_TRANSCRIPT__")) {
            setAppStatus(AppStatus.SLEEPING);
            setStatusMessage(SYSTEM_MESSAGE_SLEEPING); 
        }
    }
  }, [appStatus, speechRecognition.isListening, speechSynthesis.isSpeaking]);


  useEffect(() => {
    if (speechRecognition.error) {
      if (speechRecognition.error.includes("microphone") || 
          speechRecognition.error.includes("マイク") || // Japanese keyword for microphone
          speechRecognition.error.includes("audio-capture") || 
          speechRecognition.error.includes("音声キャプチャ") || // Japanese keyword for audio-capture
          speechRecognition.error.includes("denied") ||
          speechRecognition.error.includes("拒否") || // Japanese keyword for denied
          speechRecognition.error.includes("not-allowed") ||
          speechRecognition.error.includes("許可されていません") // Japanese keyword for not-allowed
          ) {
          if (appStatus !== AppStatus.ERROR || (statusMessage !== SYSTEM_MESSAGE_NO_API_KEY && statusMessage !== SYSTEM_MESSAGE_SPEECH_UNSUPPORTED)) {
            speakAndSetStatus(SYSTEM_MESSAGE_MICROPHONE_ERROR, AppStatus.ERROR, SYSTEM_MESSAGE_MICROPHONE_ERROR);
          } else {
            setStatusMessage(SYSTEM_MESSAGE_MICROPHONE_ERROR);
            setAppStatus(AppStatus.ERROR);
          }
      }
    }
  }, [speechRecognition.error, speakAndSetStatus, statusMessage, appStatus]); 

  const handleNewInteractionStart = () => {
    lastProcessedRawTranscriptRef.current = null;
    finalTranscriptForProcessingRef.current = '';
    interruptSpeechRef.current = false;

    if (appStatus === AppStatus.IDLE || appStatus === AppStatus.SESSION_ENDED || appStatus === AppStatus.ERROR) {
      if (!geminiIsReady) { 
        setStatusMessage(SYSTEM_MESSAGE_NO_API_KEY);
        setAppStatus(AppStatus.ERROR);
        return;
      }
       if (!speechRecognition.isSupported || !speechSynthesis.isSupported) { 
        setStatusMessage(SYSTEM_MESSAGE_SPEECH_UNSUPPORTED);
        setAppStatus(AppStatus.ERROR);
        return;
      }
      startNewChatSession(JA_GEMINI_SYSTEM_INSTRUCTION);
      setChatMessages([]); 
    }
    
    speakAndSetStatus(SYSTEM_MESSAGE_MIC_ON, AppStatus.LISTENING, SYSTEM_MESSAGE_MIC_ON); 
  };
  
  const handleTap = () => {
    if (speechSynthesis.isSpeaking || appStatusRef.current === AppStatus.SPEAKING) {
        interruptSpeechRef.current = true; 
        speechSynthesis.cancel(); 
        
        if (speechRecognition.isListening) {
            speechRecognition.stopListening();
        }
        if (transcriptProcessingTimeoutRef.current) {
            clearTimeout(transcriptProcessingTimeoutRef.current);
        }
        
        setAppStatus(AppStatus.SLEEPING); 
        setStatusMessage(SYSTEM_MESSAGE_SLEEPING); 
        lastProcessedRawTranscriptRef.current = "__INTERRUPTED_TAP__" + Date.now(); 
        finalTranscriptForProcessingRef.current = '';
        return; 
    }

    if (appStatusRef.current === AppStatus.LISTENING) {
      finalTranscriptForProcessingRef.current = speechRecognition.transcript.trim();
      
      if (speechRecognition.isListening) { 
           speechRecognition.stopListening();
      }

      if (finalTranscriptForProcessingRef.current) {
        lastProcessedRawTranscriptRef.current = finalTranscriptForProcessingRef.current; 
        handleUserQuery(finalTranscriptForProcessingRef.current);
      } else {
        setAppStatus(AppStatus.SLEEPING);
        setStatusMessage(SYSTEM_MESSAGE_SLEEPING); 
        lastProcessedRawTranscriptRef.current = "__TAP_EMPTY_TRANSCRIPT__" + Date.now();
        finalTranscriptForProcessingRef.current = ''; 
      }
    } else if (appStatusRef.current === AppStatus.IDLE || 
               appStatusRef.current === AppStatus.SESSION_ENDED || 
               appStatusRef.current === AppStatus.SLEEPING || 
               appStatusRef.current === AppStatus.ERROR || 
               appStatusRef.current === AppStatus.BOOTING_SPEECH) { 
      handleNewInteractionStart(); 
    } else if (appStatusRef.current === AppStatus.SENDING_TO_GEMINI || 
               appStatusRef.current === AppStatus.PROCESSING_COMMAND) {
      if(speechRecognition.isListening) speechRecognition.stopListening();
      if (transcriptProcessingTimeoutRef.current) {
            clearTimeout(transcriptProcessingTimeoutRef.current);
      }
      setAppStatus(AppStatus.SLEEPING);
      setStatusMessage(SYSTEM_MESSAGE_SLEEPING); 
      lastProcessedRawTranscriptRef.current = "__INTERRUPTED_BUSY_STATE_TAP__" + Date.now();
      finalTranscriptForProcessingRef.current = '';
    }
  };

  const StatusDisplayComponent: React.FC<{ status: AppStatus; message: string; speechErr: string | null }> = ({ status, message }) => {
    let displayMessage = message;

    if (status === AppStatus.SPEAKING) {
      displayMessage = JA_STATUS_AI_SPEAKING; 
    }
    
    return (
      <div className="w-full max-w-md text-center p-3 mb-4 bg-indigo-800 rounded-lg shadow-md" aria-live="polite">
        <p className="text-sm text-indigo-300 uppercase tracking-wider mb-1">{JA_STATUS_LABEL}</p>
        <div className="flex items-center justify-center min-h-[40px]">
          {(status === AppStatus.SENDING_TO_GEMINI || status === AppStatus.PROCESSING_COMMAND || status === AppStatus.BOOTING_SPEECH) && 
            <Spinner size="sm" color="text-pink-400" /> } 
          <p className={`text-lg ml-2 ${status === AppStatus.ERROR ? 'text-red-400' : 'text-indigo-100'}`}>
            {displayMessage}
          </p>
        </div>
      </div>
    );
  };

  const ActionButtonComponent: React.FC = () => {
    let buttonText = JA_BUTTON_TEXT_START; 
    let ariaLabel = JA_BUTTON_ARIA_TAP_TO_START_CONVERSATION;
    let bgColor = "bg-orange-500 hover:bg-orange-600"; 
    let isDisabled = false;
    const buttonSizeClasses = "w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full text-2xl text-center p-4";

    if (appStatus === AppStatus.LISTENING) {
        buttonText = JA_BUTTON_TEXT_SEND;
        ariaLabel = JA_BUTTON_ARIA_SPEAKING_TAP_TO_SEND; 
        bgColor = "bg-green-600 hover:bg-green-700"; 
    } else if (appStatus === AppStatus.SPEAKING) {
        buttonText = JA_BUTTON_TEXT_STOP_SPEAKING;
        ariaLabel = JA_BUTTON_ARIA_STOP_SPEAKING;
        bgColor = "bg-red-600 hover:bg-red-700";
        isDisabled = false; 
    } else if (appStatus === AppStatus.SLEEPING || appStatus === AppStatus.SESSION_ENDED || appStatus === AppStatus.IDLE) {
      buttonText = JA_BUTTON_TEXT_START; 
      ariaLabel = JA_BUTTON_ARIA_TAP_TO_START_CONVERSATION;
      bgColor = "bg-orange-500 hover:bg-orange-600";
    } else if (appStatus === AppStatus.ERROR) {
        buttonText = JA_BUTTON_TEXT_RETRY;
        ariaLabel = JA_BUTTON_ARIA_TAP_TO_START_CONVERSATION; 
        bgColor = "bg-yellow-500 hover:bg-yellow-600 text-gray-900";
    } else if (appStatus === AppStatus.SENDING_TO_GEMINI || appStatus === AppStatus.PROCESSING_COMMAND || appStatus === AppStatus.BOOTING_SPEECH) {
        buttonText = SYSTEM_MESSAGE_PROCESSING; 
        isDisabled = true; 
        bgColor = "bg-gray-500 cursor-not-allowed";
    }
    
    return (
      <button
        onClick={handleTap}
        disabled={isDisabled}
        className={`${buttonSizeClasses} text-white font-semibold shadow-xl transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-indigo-900 focus:ring-white flex items-center justify-center ${
          isDisabled ? 'bg-gray-500 cursor-not-allowed' : bgColor
        }`}
        aria-label={ariaLabel}
      >
        {isDisabled && (appStatus === AppStatus.SENDING_TO_GEMINI || appStatus === AppStatus.PROCESSING_COMMAND || appStatus === AppStatus.BOOTING_SPEECH) ? <Spinner size="md" color="text-pink-300" /> : buttonText}
      </button>
    );
  };

  interface ChatLogComponentProps {
    messages: ChatMessage[];
  }
  const ChatLogComponent: React.FC<ChatLogComponentProps> = (props) => {
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }, [props.messages.length]); 
    
    const formatSender = (sender: ChatMessage['sender']): string => {
        if (sender === 'user') return JA_SENDER_USER;
        if (sender === 'gemini') return JA_SENDER_GEMINI;
        return JA_SENDER_SYSTEM;
    }

    const renderMessageContent = (text: string, isLoading?: boolean): JSX.Element[] => {
      try {
        const lines = text.split('\n');
        const elements: JSX.Element[] = [];
        let currentListItems: JSX.Element[] = [];
    
        const flushList = (listKey: string) => {
            if (currentListItems.length > 0) {
                elements.push(<ul key={listKey} className="list-disc list-inside pl-4 my-1 text-left">{currentListItems}</ul>);
                currentListItems = [];
            }
        };
    
        lines.forEach((line, index) => {
            const listItemMatch = line.match(/^(\*|-|\d+\.)\s+(.*)/);
            if (listItemMatch) {
                currentListItems.push(<li key={`li-${index}`}>{listItemMatch[2]}</li>);
            } else {
                flushList(`ul-${elements.length}-${index}`); 
                if (line.trim()) { 
                     elements.push(<p key={`p-${index}`} className="my-1">{line}</p>);
                }
            }
        });
    
        flushList(`ul-end-${elements.length}`); 

        if (isLoading) {
            const loadingIndicator = <span key="loading-pulse" className="inline-block animate-pulse">...</span>;
            if (elements.length > 0 && elements[elements.length -1].type === 'p') {
                 const lastP = elements[elements.length -1];
                 elements[elements.length -1] = React.cloneElement(lastP, {children: [lastP.props.children, " ", loadingIndicator]});

            } else if (text.trim() && elements.length === 0) {
                 elements.push(<p key="single-p-loading">{text}{loadingIndicator}</p>);
            }
             else {
                elements.push(<p key="loading-p-indicator">{loadingIndicator}</p>);
            }
        }
    
        if (elements.length === 0 && text.trim() && !isLoading) { 
            return [<p key="single-p">{text}</p>];
        }
        return elements;
      } catch (e) {
        console.error("Error rendering message content:", e);
        return [<p key="render-error" className="text-red-400">メッセージの表示中にエラーが発生しました。</p>];
      }
    };

    return (
      <div className="w-full max-w-md bg-indigo-800 rounded-lg shadow-inner overflow-y-auto h-60 p-2">
        {props.messages.map((msg) => (
          <div key={msg.id} className={`mb-3 p-2 rounded-lg shadow text-sm ${
            msg.sender === 'user' ? 'bg-blue-600 ml-auto max-w-[85%] text-right' : 
            msg.sender === 'gemini' ? 'bg-green-600 mr-auto max-w-[85%]' : 
            'bg-gray-600 text-xs max-w-[95%] mx-auto text-center' 
          } ${msg.isLoading ? 'opacity-80' : ''}`}>
            <p className={`text-xs font-semibold mb-0.5 ${
                msg.sender === 'user' ? 'text-blue-200' : 
                msg.sender === 'gemini' ? 'text-green-200' : 'text-gray-300'
            }`}>
                {formatSender(msg.sender)} - {new Date(msg.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <div className={`text-white text-sm ${msg.isLoading && msg.sender === 'gemini' ? 'italic' : ''}`}>
                {renderMessageContent(msg.text, msg.isLoading && msg.sender === 'gemini')}
            </div>
            {msg.groundingChunks && msg.groundingChunks.length > 0 && (
              <div className={`mt-1 pt-1 border-t border-indigo-700 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                <p className="text-xs text-indigo-300 mb-0.5">参照元:</p>
                <ul className="list-disc list-inside">
                  {msg.groundingChunks.filter(chunk => chunk.web && chunk.web.uri).map((chunk, index) => ( 
                      <li key={index} className="text-xs text-pink-300 hover:text-pink-200">
                        <a href={chunk.web!.uri} target="_blank" rel="noopener noreferrer" title={chunk.web!.title || chunk.web!.uri}>
                          {chunk.web!.title || chunk.web!.uri}
                        </a>
                      </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
    );
  };
  
  if (appStatus === AppStatus.ERROR && statusMessage === SYSTEM_MESSAGE_SPEECH_UNSUPPORTED) {
    return (
      <SimpleErrorDisplay
        title={JA_ERROR_TITLE}
        message={SYSTEM_MESSAGE_SPEECH_UNSUPPORTED}
        footer={JA_FOOTER_BEST_EXPERIENCE}
      />
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen text-gray-100 p-4 items-center justify-center font-sans">
      <header className="w-full max-w-md text-center mb-6 pt-4">
        <h1 className="text-5xl font-bold text-pink-400">Hi, Gemini!</h1>
      </header>

      <main className="w-full flex-1 flex flex-col items-center justify-center p-2">
        <StatusDisplayComponent status={appStatus} message={statusMessage} speechErr={speechRecognition.error} />
        
        {appStatus === AppStatus.ERROR && 
         statusMessage !== SYSTEM_MESSAGE_NO_API_KEY && 
         statusMessage !== SYSTEM_MESSAGE_SPEECH_UNSUPPORTED && ( 
            <div className="w-full max-w-md bg-red-700 border border-red-800 text-white p-4 rounded-lg shadow-xl text-center my-4">
              <h2 className="font-bold text-xl mb-2">{JA_ERROR_TITLE}</h2>
              <p className="text-md">{statusMessage}</p>
            </div>
        )}
        
        <div className="my-6">
          <ActionButtonComponent />
        </div>

        <ChatLogComponent messages={chatMessages} /> 
      </main>

      <footer className="w-full max-w-md text-center mt-auto py-3 border-t border-indigo-700 opacity-0 h-0 p-0 m-0 border-0 overflow-hidden pointer-events-none">
        <p className="text-xs text-gray-500">{JA_FOOTER_BEST_EXPERIENCE}</p>
      </footer>
    </div>
  );
}; 

export default App;