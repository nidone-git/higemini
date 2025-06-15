import { useState, useEffect, useCallback, useRef } from 'react';
import { SpeechSynthesisHook } from '../types';

const useSpeechSynthesis = (): SpeechSynthesisHook => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onEndCallbackRef = useRef<(() => void) | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]); // Ref to store voices

  useEffect(() => {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      console.warn("SpeechSynthesis API not supported.");
      setIsSupported(false);
      return;
    }

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices();
    if (voicesRef.current.length === 0 && 'onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = null; // Remove listener after voices are loaded
      };
    }

    return () => {
      if (isSupported && window.speechSynthesis.speaking) {
         window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
    };

  }, [isSupported]);


  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!isSupported || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
    }
    
    onEndCallbackRef.current = onEnd || null;

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance; 
    
    utterance.lang = 'ja-JP';
    utterance.pitch = 1;
    utterance.rate = 1;

    const localVoices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
    if (localVoices.length > 0) {
      // Try to find a female Japanese voice
      let jaVoice = localVoices.find(voice => 
        voice.lang === 'ja-JP' && 
        (voice.name.toLowerCase().includes('female') || 
         voice.name.toLowerCase().includes('kyoko') || // Common Japanese female voice name
         voice.name.toLowerCase().includes('o-ren') || // Another one
         voice.name.toLowerCase().includes('ayumi') || // Common female names
         voice.name.toLowerCase().includes('haruka') ||
         voice.name.toLowerCase().includes('misaki') ||
         voice.name.toLowerCase().includes('nanami') ||
         voice.name.toLowerCase().includes('sumire') 
         // Add more known female voice names if needed
        )
      );

      // If no specific female voice found, try any Japanese voice
      if (!jaVoice) {
        jaVoice = localVoices.find(voice => voice.lang === 'ja-JP');
      }
      
      if (jaVoice) {
        utterance.voice = jaVoice;
        // console.log("Using voice:", jaVoice.name);
      } else {
         console.warn("No Japanese (ja-JP) voice found, using default voice for the language.");
      }
    } else {
        console.warn("No voices available in browser's SpeechSynthesis API.");
    }

    utterance.onstart = () => setIsSpeaking(true);
    
    utterance.onend = () => {
        setIsSpeaking(false);
        if (onEndCallbackRef.current) {
            onEndCallbackRef.current();
            onEndCallbackRef.current = null;
        }
        utteranceRef.current = null;
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
      if (onEndCallbackRef.current) { 
        onEndCallbackRef.current();
        onEndCallbackRef.current = null;
      }
      utteranceRef.current = null;
    };
    
    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const cancel = useCallback(() => {
    if (!isSupported) return;

    const callbackToExecute = onEndCallbackRef.current;
    onEndCallbackRef.current = null; 

    if (window.speechSynthesis.speaking) { 
        window.speechSynthesis.cancel(); 
    }
    
    setIsSpeaking(false); 

    if (callbackToExecute) {
        callbackToExecute(); 
    }
  }, [isSupported]);

  return { speak, cancel, isSpeaking, isSupported };
};

export default useSpeechSynthesis;