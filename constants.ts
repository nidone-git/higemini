export const VOICE_COMMAND_WAKE_UP = "起動"; // きどう
export const VOICE_COMMAND_SLEEP = "スリープ";
export const VOICE_COMMAND_SLEEP_ALT = "ストップ";
// REMOVED: VOICE_COMMAND_GEMINI_PREFIX and VOICE_COMMAND_GEMINI_PREFIX_ALT
export const VOICE_COMMAND_REPEAT = "もう一度"; // もういちど
export const VOICE_COMMAND_REPEAT_ALT = "繰り返して"; // くりかえして
export const VOICE_COMMAND_END_SESSION = "終了"; // しゅうりょう
export const VOICE_COMMAND_END_SESSION_ALT = "さようなら";

export const GEMINI_MODEL_NAME = "gemini-2.5-flash-preview-04-17";

// UPDATED: Welcome message for tap-based interaction, removed "起動" command reference.
export const SYSTEM_MESSAGE_WELCOME = `タップして会話を開始してください。`;
// UPDATED: Message when mic is on, guiding tap to send
export const SYSTEM_MESSAGE_MIC_ON = "マイクオン。話し終えたらタップしてください。";
// UPDATED: Generic sleeping message, removed "わかりました" and "起動" command reference.
export const SYSTEM_MESSAGE_SLEEPING = `聞き取りが停止しました。タップして再開してください。`;
// NEW: Spoken confirmation when user says "sleep" or "stop".
export const SYSTEM_MESSAGE_SLEEP_CONFIRMATION = "わかりました、聞き取りを停止します。";
// UPDATED: Session ended message, removed "起動" command reference.
export const SYSTEM_MESSAGE_SESSION_ENDED = `セッションが終了しました。新しいセッションを開始するにはタップしてください。`;
export const SYSTEM_MESSAGE_PROCESSING = "処理中…"; // Shortened for button
export const SYSTEM_MESSAGE_PROCESSING_SR = "リクエストを処理中です..."; // For screen readers or longer status
export const SYSTEM_MESSAGE_UNSURE = "申し訳ありませんが、どのようにお手伝いすればよいかわかりません。別の言葉で言い換えてみてください。";
export const SYSTEM_MESSAGE_GEMINI_ERROR = "申し訳ありません、AIとの接続で問題が発生しました。もう一度お試しください。";
export const SYSTEM_MESSAGE_SPEECH_UNSUPPORTED = "このブラウザまたはデバイスでは音声コマンドがサポートされていません。Chromeなどの互換性のあるブラウザを使用してください。";
export const SYSTEM_MESSAGE_MICROPHONE_ERROR = "マイクにアクセスできませんでした。権限を確認してください。";
export const SYSTEM_MESSAGE_NO_API_KEY = "Gemini APIキーが設定されていません。アプリケーションは機能できません。";
export const JA_STATUS_AI_SPEAKING = "応答を読み上げています...";

// Button Text Constants - Shortened for visual display
export const JA_BUTTON_TEXT_START = "開始";
export const JA_BUTTON_TEXT_SEND = "送信";
export const JA_BUTTON_TEXT_STOP_SPEAKING = "停止";
export const JA_BUTTON_TEXT_RETRY = "再試行";

// ARIA Label Constants (remain descriptive)
export const JA_BUTTON_ARIA_TAP_TO_START_CONVERSATION = "タップして会話を開始"; 
export const JA_BUTTON_ARIA_SPEAKING_TAP_TO_SEND = "音声入力中…タップして送信";
export const JA_BUTTON_ARIA_STOP_SPEAKING = "読み上げを停止します";

export const DEBOUNCE_TIME_MS = 300; // Debounce time for processing transcript (for voice commands)

// New constants for empty Gemini response
export const JA_SYSTEM_MESSAGE_GEMINI_NO_RESPONSE = "AIから応答がありませんでした。";
export const JA_SYSTEM_MESSAGE_GEMINI_EMPTY_RESPONSE_FOR_CHAT = "AIからの応答が空でした。";

// New constant for displaying AI generating response
export const JA_GEMINI_GENERATING_MESSAGE = "AIが応答を生成中です...";