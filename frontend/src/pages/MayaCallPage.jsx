import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Phone,
  PhoneOff,
  Sparkles,
  ArrowLeft,
  FileText,
  Loader2,
  AlertTriangle,
  Lightbulb,
  X,
  Mic,
  MicOff,
  RefreshCw,
} from 'lucide-react';
import VoiceOrb from '../components/VoiceOrb';
import StreamingCaption from '../components/StreamingCaption';
import MicGate from '../components/MicGate';
import { useLiveAudio } from '../lib/useLiveAudio';
import { DEBUG_LATENCY } from '../lib/liveLatency';
import api from '../lib/api';
import { wsBaseUrl } from '../lib/config';
import { checkBackendHealth } from '../lib/health';
import { CALL } from '../constants/testIds';
import { toast } from 'sonner';

const PLACEHOLDER = 'Tap the phone to talk with Maya…';
const CONNECTING_TEXT = 'Connecting to Maya…';
const SPEAKING_WAIT = 'Maya is speaking…';
const THINKING_TEXT = 'Maya is thinking…';

const DEFAULT_HINTS = [
  'Nice to meet you, Maya! I had a great breakfast.',
  'Hi Maya! I finally finished a book I was reading, so that felt good.',
  "It's a pleasure to meet you! To be honest, the best part of my day was just enjoying this sunny weather.",
];

const STATUS = {
  idle: 'IDLE',
  connecting: 'CONNECTING',
  thinking: 'THINKING',
  speaking: 'MAYA',
  listening: 'LISTENING',
  error: 'ERROR',
};

function orbStateFor(callState, heardAudio) {
  if (callState === 'listening') return 'listening';
  if (callState === 'thinking') return 'idle';
  if (callState === 'speaking' || (callState === 'connecting' && heardAudio)) return 'speaking';
  return 'idle';
}

function TutorCoachPanel({
  improvement,
  correction,
  pronunciation,
  suggestions,
  onCloseSuggestions,
}) {
  const hasCoach = improvement || correction?.corrected || pronunciation?.tip;
  const hasSuggestions = suggestions?.length > 0;
  if (!hasCoach && !hasSuggestions) return null;

  return (
    <div className="w-full max-w-2xl shrink-0 space-y-2 transition-all duration-300">
      {hasCoach && (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[#C85A47]" />
            <p className="font-mono-tag text-[10px] uppercase tracking-[0.2em] text-[#C85A47] font-medium">
              What to improve
            </p>
          </div>
          {improvement && (
            <p className="text-xs text-stone-800 leading-relaxed mb-2">{improvement}</p>
          )}
          {correction?.corrected && (
            <div className="bg-[#FBEAE7]/60 border border-[#C85A47]/20 rounded-xl p-2">
              {correction.original && (
                <p className="text-xs text-stone-500 line-through mb-0.5">&ldquo;{correction.original}&rdquo;</p>
              )}
              <p className="text-xs text-[#C85A47] font-medium">&ldquo;{correction.corrected}&rdquo;</p>
              {correction.tip && correction.tip !== improvement && (
                <p className="text-[11px] text-stone-600 mt-1">{correction.tip}</p>
              )}
            </div>
          )}
          {pronunciation?.tip && !correction?.corrected && (
            <div className="bg-[#E8F0EA]/60 border border-[#4A5D4E]/20 rounded-xl p-2 mt-2">
              {pronunciation.word && (
                <p className="text-xs font-medium text-stone-800 mb-0.5">{pronunciation.word}</p>
              )}
              <p className="text-xs text-stone-700">{pronunciation.tip}</p>
            </div>
          )}
        </div>
      )}

      {hasSuggestions && (
        <div className="bg-[#FCECC9]/55 border border-[#F5DFA8] rounded-2xl p-3 relative">
          <button
            type="button"
            onClick={onCloseSuggestions}
            className="absolute top-2 right-2 text-stone-400 hover:text-stone-800 p-1"
            aria-label="Hide reply options"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-2 pr-8">
            <Lightbulb className="w-4 h-4 text-[#C85A47]" />
            <p className="font-mono-tag text-[10px] uppercase tracking-[0.2em] text-stone-600 font-medium">
              Try saying
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 4).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(h);
                  toast.message('Copied — say this out loud!');
                }}
                className="text-xs text-stone-700 bg-white border border-stone-200/90 px-3 py-1.5 rounded-full leading-snug text-left hover:border-[#C85A47]/40 hover:text-[#C85A47] hover:bg-[#FBEAE7]/40 transition-colors whitespace-nowrap"
              >
                &ldquo;{h}&rdquo;
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LatencyOverlay({ latency }) {
  if (!DEBUG_LATENCY || !latency) return null;
  return (
    <div className="fixed bottom-24 right-3 z-50 bg-stone-900/90 text-white text-[10px] font-mono rounded-lg px-3 py-2 space-y-0.5">
      <p>end→think: {latency.thinkingMs ?? '—'}ms</p>
      <p>end→audio: {latency.firstAudioMs ?? '—'}ms</p>
    </div>
  );
}

export default function MayaCallPage() {
  const { sessionId } = useParams();
  const [mayaTurn, setMayaTurn] = useState('');
  const [vocabWords, setVocabWords] = useState([]);
  const [userSaid, setUserSaid] = useState('');
  const [pronunciation, setPronunciation] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [coachImprovement, setCoachImprovement] = useState('');
  const [error, setError] = useState(null);
  const [hints, setHints] = useState([]);
  const [showHints, setShowHints] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [showMicGate, setShowMicGate] = useState(false);
  const [health, setHealth] = useState(null);
  const [heardAudio, setHeardAudio] = useState(false);
  const [analyserNode, setAnalyserNode] = useState(null);
  const pendingActionRef = useRef(null);

  const token = localStorage.getItem('englearn_token') || '';
  const wsUrl = `${wsBaseUrl()}/api/ws/maya/${sessionId}`;

  const onError = useCallback((e) => {
    const msg = e?.message || 'Connection failed';
    setError(msg);
    toast.error(msg);
  }, []);

  const refreshMessageCount = useCallback(async () => {
    try {
      const r = await api.get(`/sessions/${sessionId}/messages`);
      setMessageCount((r.data || []).length);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const {
    state,
    micMuted,
    latency,
    startCall,
    disconnect,
    toggleMicMute,
    ensurePlaybackUnlocked,
    progressRef,
    liveTranscriptRef,
  } = useLiveAudio({
    wsUrl,
    authToken: token,
    mode: 'handsfree',
    onTurnStart: () => {
      setMayaTurn('');
      setUserSaid('');
      setVocabWords([]);
    },
    onMayaTranscript: (t, vocab) => {
      setMayaTurn(t?.trim() || '');
      if (vocab?.length) setVocabWords(vocab);
    },
    onUserTranscript: (t) => setUserSaid(t?.trim() || ''),
    onCorrection: setCorrection,
    onPronunciation: setPronunciation,
    onCoachFeedback: ({ improvement }) => {
      if (improvement) setCoachImprovement(improvement);
    },
    onReplyOptions: ({ suggestions: opts }) => {
      if (opts?.length) {
        setHints(opts);
        setShowHints(true); // Automatically show when new replies arrive
      }
    },
    onTurnComplete: refreshMessageCount,
    onError,
    onFirstAudio: () => setHeardAudio(true),
    onAnalyserReady: setAnalyserNode,
    onReconnecting: () => toast.message('Reconnecting to Maya…'),
    onUserSilence: () => toast.warning('🎤 Try aloud and clear.'),
  });

  const callActive =
    state === 'connecting' || state === 'speaking' || state === 'listening' || state === 'thinking';

  const resetUi = useCallback(() => {
    setHeardAudio(false);
    setMayaTurn('');
    setUserSaid('');
    setVocabWords([]);
    setPronunciation(null);
    setCorrection(null);
    setCoachImprovement('');
    setHints([]);
    setShowHints(false);
    setAnalyserNode(null);
  }, []);

  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  const refreshHealth = useCallback(async () => {
    const h = await checkBackendHealth();
    setHealth(h);
    return h;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadHealth = async () => {
      const h = await checkBackendHealth();
      if (!cancelled) setHealth(h);
    };
    loadHealth();
    const interval = setInterval(loadHealth, 12000);
    refreshMessageCount();
    return () => {
      cancelled = true;
      clearInterval(interval);
      disconnectRef.current();
    };
  }, [sessionId, token, refreshMessageCount]);

  const requestMicAccess = useCallback(async (action) => {
    try {
      if (navigator.permissions?.query) {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'granted') {
          await action();
          return;
        }
      }
    } catch {
      /* Permissions API unavailable */
    }
    pendingActionRef.current = action;
    setShowMicGate(true);
  }, []);

  const beginCall = useCallback(async () => {
    if (!token) {
      setError('Please sign in again to talk with Maya.');
      return;
    }
    const latestHealth = await refreshHealth();
    if (latestHealth.ok === false) {
      const detail = latestHealth.gemini_error || latestHealth.error;
      setError(
        detail
          ? `Maya is not ready: ${detail}`
          : 'Backend or Gemini is not ready. Check server and GOOGLE_API_KEY.'
      );
      return;
    }
    setError(null);
    resetUi();
    await ensurePlaybackUnlocked();
    await startCall();
  }, [token, refreshHealth, resetUi, ensurePlaybackUnlocked, startCall]);

  const endCall = useCallback(() => {
    disconnect();
    resetUi();
  }, [disconnect, resetUi]);

  const handlePhone = useCallback(() => {
    if (callActive) endCall();
    else requestMicAccess(beginCall);
  }, [callActive, endCall, requestMicAccess, beginCall]);

  const handleRetry = useCallback(() => {
    setError(null);
    disconnect();
    setAnalyserNode(null);
    setTimeout(() => requestMicAccess(beginCall), 300);
  }, [disconnect, requestMicAccess, beginCall]);

  const fetchHints = useCallback(async () => {
    setLoadingHint(true);
    try {
      const r = await api.post('/hint', {
        session_id: sessionId,
        live_transcript: liveTranscriptRef.current,
        last_correction: correction,
        last_user_text: userSaid,
      });
      const list = r.data.suggestions || [];
      if (r.data.improvement) setCoachImprovement(r.data.improvement);
      setHints(list.length ? list : DEFAULT_HINTS);
      if (r.data.quota_limited) toast.message('Using offline reply options.');
    } catch {
      setHints(DEFAULT_HINTS);
    } finally {
      setLoadingHint(false);
    }
  }, [sessionId, liveTranscriptRef, correction, userSaid]);

  const handleToggleHints = useCallback(() => {
    if (showHints) {
      setShowHints(false);
    } else {
      setShowHints(true);
      if (!hints.length && !loadingHint) {
        fetchHints();
      }
    }
  }, [showHints, hints.length, loadingHint, fetchHints]);

  const status = useMemo(() => {
    if (micMuted && callActive) return 'MUTED';
    if (state === 'connecting' && heardAudio) return 'MAYA';
    return STATUS[state] || STATUS.idle;
  }, [state, heardAudio, micMuted, callActive]);

  const mayaDisplay = useMemo(() => {
    if (!callActive) return PLACEHOLDER;
    if (mayaTurn.trim()) return mayaTurn.trim();
    if (state === 'thinking') return THINKING_TEXT;
    return heardAudio || state === 'speaking' ? SPEAKING_WAIT : CONNECTING_TEXT;
  }, [callActive, mayaTurn, heardAudio, state]);

  const hintLine = useMemo(() => {
    if (!callActive) return 'Tap the phone to start a hands-free call';
    if (micMuted) return 'Mic muted — tap mic to unmute';
    if (state === 'listening' && hints.length) return 'Tap a suggestion below or speak your own reply';
    return 'Speak naturally — pause when done, Maya replies when status shows LISTENING';
  }, [callActive, micMuted, hints.length, state]);

  return (
    <div className="h-[100dvh] bg-[#F9F8F6] flex flex-col overflow-hidden">
      <LatencyOverlay latency={latency} />

      {showMicGate && (
        <MicGate
          onAllow={async () => {
            setShowMicGate(false);
            const action = pendingActionRef.current;
            pendingActionRef.current = null;
            if (action) await action();
          }}
          onCancel={() => {
            setShowMicGate(false);
            pendingActionRef.current = null;
          }}
        />
      )}

      <header className="shrink-0 border-b border-stone-200/60 bg-[#F9F8F6]/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link data-testid="livecall-back" to="/dashboard" className="text-sm text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C85A47]" strokeWidth={2} />
            <span className="font-display text-base font-medium text-stone-900">Maya</span>
            <span className={`w-2 h-2 rounded-full ${callActive && state !== 'error' ? 'bg-[#C85A47] animate-pulse' : 'bg-stone-300'}`} aria-hidden />
            <span className="font-mono-tag text-[10px] uppercase tracking-[0.18em] text-stone-500">{status}</span>
          </div>
          <Link data-testid={CALL.transcriptLink} to={`/transcript/${sessionId}`} className="text-sm text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            Transcript
            {messageCount > 0 && <span className="font-mono-tag text-[10px] text-stone-400 tabular-nums">{messageCount}</span>}
          </Link>
        </div>
      </header>

      {health?.ok === false && (
        <div className="px-5 pt-3 shrink-0">
          <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-900">
            Backend: {health.database_ok ? 'OK' : 'down'} · Gemini: {health.gemini_configured ? 'OK' : 'not configured'}
            {health.error || health.gemini_error ? (
              <span className="block text-xs mt-1 text-amber-800/80">{health.gemini_error || health.error}</span>
            ) : null}
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center px-5 pt-4 pb-2 min-h-0">
        <div data-testid={CALL.orb} className="mb-3 shrink-0">
          <VoiceOrb state={orbStateFor(state, heardAudio)} size={200} analyserNode={analyserNode} />
        </div>

        <p className="font-mono-tag text-[10px] uppercase tracking-[0.2em] text-stone-400 text-center mb-3 max-w-md shrink-0">{hintLine}</p>

        {/* Scrollable content area: caption + user transcript + coach panel */}
        <div className="w-full max-w-2xl flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto overscroll-contain">
          {/* Caption section */}
          <div className="shrink-0" data-testid={CALL.caption}>
            <div className="min-h-[4rem] px-1">
              <StreamingCaption
                text={mayaDisplay}
                isSpeaking={state === 'speaking'}
                progressRef={progressRef}
                vocabWords={vocabWords}
                emptyPlaceholder={PLACEHOLDER}
              />
            </div>

            {userSaid && callActive && (
              <p className="text-center text-sm text-stone-500 mt-3 shrink-0">
                <span className="font-mono-tag text-[10px] uppercase tracking-wider text-stone-400 mr-2">You said</span>
                <span className="text-stone-700">&ldquo;{userSaid}&rdquo;</span>
              </p>
            )}
          </div>

          {/* Coach / hints section — separated from captions */}
          {callActive && (
            <div className="shrink-0">
              <TutorCoachPanel
                improvement={coachImprovement}
                correction={correction}
                pronunciation={pronunciation}
                suggestions={showHints ? hints : []}
                onCloseSuggestions={() => setShowHints(false)}
              />
            </div>
          )}
        </div>
      </main>

      {error && (
        <div className="px-5 pb-2 shrink-0">
          <div className="max-w-2xl mx-auto bg-[#FBEAE7] border border-[#C85A47]/30 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-[#C85A47] shrink-0" />
            <p className="text-sm text-stone-800 flex-1">{error}</p>
            <button type="button" onClick={handleRetry} className="text-sm text-[#C85A47] hover:text-[#B34A38] flex items-center gap-1 font-medium">
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
            <button type="button" onClick={() => setError(null)} className="text-sm text-stone-500 hover:text-stone-900">Dismiss</button>
          </div>
        </div>
      )}

      <footer className="shrink-0 pb-10 pt-2 px-5">
        <div className="flex items-center justify-center gap-5 max-w-md mx-auto">
          <button
            type="button"
            data-testid={CALL.hintButton}
            onClick={handleToggleHints}
            disabled={loadingHint}
            className={`w-12 h-12 rounded-full border transition-colors flex items-center justify-center shadow-sm disabled:opacity-50 ${
              showHints
                ? 'bg-amber-50 border-amber-300 text-[#C85A47] hover:bg-amber-100/70 hover:border-amber-400'
                : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50'
            }`}
            aria-label="Toggle reply options"
          >
            {loadingHint ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lightbulb className="w-5 h-5" />}
          </button>

          <button
            type="button"
            data-testid={callActive ? CALL.endButton : CALL.startButton}
            onClick={handlePhone}
            disabled={!callActive && state === 'connecting'}
            className={`w-[4.5rem] h-[4.5rem] rounded-full transition-all flex items-center justify-center shadow-xl border-[3px] border-white disabled:opacity-60 ${
              callActive ? 'bg-stone-900 text-white hover:bg-stone-800' : 'bg-[#C85A47] hover:bg-[#B34A38] text-white'
            }`}
            aria-label={callActive ? 'End call' : 'Start hands-free call'}
          >
            {state === 'connecting' ? <Loader2 className="w-7 h-7 animate-spin" /> : callActive ? <PhoneOff className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
          </button>

          {callActive ? (
            <button
              type="button"
              data-testid={CALL.micButton}
              onClick={toggleMicMute}
              disabled={state === 'connecting'}
              className={`w-12 h-12 rounded-full border transition-colors flex items-center justify-center shadow-sm disabled:opacity-50 ${
                micMuted ? 'bg-[#FBEAE7] border-[#C85A47]/40 text-[#C85A47]' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50'
              }`}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          ) : (
            <button
              type="button"
              data-testid={CALL.micButton}
              onClick={handlePhone}
              disabled={state === 'connecting'}
              className="w-12 h-12 rounded-full border bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 transition-colors flex items-center justify-center shadow-sm disabled:opacity-50"
              aria-label="Start call"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>

        <p className="text-center font-mono-tag text-[10px] uppercase tracking-[0.2em] text-stone-400 mt-6">
          {callActive ? (
            micMuted ? 'Mic muted' : 'Hands-free · pause to reply · tap phone to end'
          ) : (
            <span className="inline-flex items-center justify-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#C85A47]" strokeWidth={2} aria-hidden />
              Maya AI · tap phone to start
            </span>
          )}
        </p>
      </footer>
    </div>
  );
}
