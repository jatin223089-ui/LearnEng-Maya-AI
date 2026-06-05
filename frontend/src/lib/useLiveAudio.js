/**
 * Live audio hook for Gemini Live API — warm connect, VAD, PTT, reconnect, barge-in.
 */
import { useRef, useState, useCallback } from 'react';
import { createLatencyTracker, DEBUG_LATENCY } from './liveLatency';

const SEND_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;
const VAD_RMS_THRESHOLD = 0.015;
const SILENCE_END_MS = 2000;
const MIN_SPEECH_MS = 400;
const NO_AUDIO_TIMEOUT_MS = 8000;
const READY_TIMEOUT_MS = 30000;
const MAX_RECONNECT = 2;

function resampleFloat32(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < input.length; j++) {
      sum += input[j];
      count++;
    }
    out[i] = count ? sum / count : input[Math.min(start, input.length - 1)];
  }
  return out;
}

function float32ToPcm16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : 0x7fff;
  }
  return out;
}

function pcm16ToFloat32(pcm16) {
  const out = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) out[i] = pcm16[i] / 0x8000;
  return out;
}

function rms(f32) {
  let s = 0;
  for (let i = 0; i < f32.length; i++) s += f32[i] * f32[i];
  return Math.sqrt(s / (f32.length || 1));
}

async function toArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (data instanceof Blob) return data.arrayBuffer();
  return null;
}

function safeCloseAudioContext(ctx) {
  if (!ctx || ctx.state === 'closed') return;
  try {
    void ctx.close();
  } catch {
    /* already closing/closed */
  }
}

export function useLiveAudio({
  wsUrl,
  authToken,
  mode = 'handsfree',
  onUserTranscript,
  onMayaTranscript,
  onCorrection,
  onPronunciation,
  onCoachFeedback,
  onReplyOptions,
  onTurnComplete,
  onError,
  onTurnStart,
  onAnalyserReady,
  onFirstAudio,
  onLatencyUpdate,
  onReconnecting,
  onUserSilence,
}) {
  const [state, setState] = useState('idle');
  const [micMuted, setMicMuted] = useState(false);
  const [warmed, setWarmed] = useState(false);
  const [latency, setLatency] = useState(null);
  const progressRef = useRef({ elapsedSec: 0, turnDurationSec: 0 });
  const liveTranscriptRef = useRef([]);
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const playbackCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const workletRef = useRef(null);
  const captureCtxRef = useRef(null);
  const nextPlaybackTimeRef = useRef(0);
  const turnStartAtRef = useRef(0);
  const turnDurationRef = useRef(0);
  const progressRafRef = useRef(null);
  const pendingTurnResetRef = useRef(false);
  const mayaTurnCountRef = useRef(0);
  const mayaSpokeFirstRef = useRef(false);
  const gotAudioRef = useRef(false);
  const connectingRef = useRef(false);
  const greetingSentRef = useRef(false);
  const callActiveRef = useRef(false);
  const micMutedRef = useRef(false);
  const modeRef = useRef(mode);
  const pttActiveRef = useRef(false);
  const playbackChainRef = useRef(Promise.resolve());
  const noAudioTimerRef = useRef(null);
  const stateRef = useRef('idle');
  const userSpeakingRef = useRef(false);
  const speechActivityRef = useRef(false);
  const speechStartRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const turnEndSentRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const latencyRef = useRef(createLatencyTracker());
  const vocabRef = useRef([]);
  const intentionalCloseRef = useRef(false);
  const cleaningUpRef = useRef(false);
  const thinkingTimerRef = useRef(null);
  const userSilenceTimerRef = useRef(null);

  micMutedRef.current = micMuted;
  stateRef.current = state;
  modeRef.current = mode;

  const pushLiveLine = useCallback((role, text) => {
    if (!text?.trim()) return;
    liveTranscriptRef.current = [
      ...liveTranscriptRef.current.slice(-7),
      { role, text: text.trim() },
    ];
  }, []);

  const clearNoAudioTimer = useCallback(() => {
    if (noAudioTimerRef.current) {
      clearTimeout(noAudioTimerRef.current);
      noAudioTimerRef.current = null;
    }
  }, []);

  const stopProgressLoop = useCallback(() => {
    if (progressRafRef.current) {
      cancelAnimationFrame(progressRafRef.current);
      progressRafRef.current = null;
    }
  }, []);

  const emitPlaybackProgress = useCallback(() => {
    const ctx = playbackCtxRef.current;
    if (!ctx || ctx.state === 'closed') return;
    progressRef.current = {
      elapsedSec: Math.max(0, ctx.currentTime - turnStartAtRef.current),
      turnDurationSec: turnDurationRef.current,
    };
  }, []);

  const startProgressLoop = useCallback(() => {
    stopProgressLoop();
    const tick = () => {
      emitPlaybackProgress();
      progressRafRef.current = requestAnimationFrame(tick);
    };
    progressRafRef.current = requestAnimationFrame(tick);
  }, [emitPlaybackProgress, stopProgressLoop]);

  const resetTurnPlayback = useCallback(({ resetClock = false } = {}) => {
    turnStartAtRef.current = 0;
    turnDurationRef.current = 0;
    progressRef.current = { elapsedSec: 0, turnDurationSec: 0 };
    if (resetClock) {
      const ctx = playbackCtxRef.current;
      if (ctx && ctx.state !== 'closed') nextPlaybackTimeRef.current = ctx.currentTime;
    }
  }, []);

  const markTurnStart = useCallback(() => {
    pendingTurnResetRef.current = true;
    mayaTurnCountRef.current += 1;
    if (mayaTurnCountRef.current > 1) onTurnStart?.();
  }, [onTurnStart]);

  const resetUserVad = useCallback(() => {
    userSpeakingRef.current = false;
    speechActivityRef.current = false;
    turnEndSentRef.current = false;
    speechStartRef.current = 0;
    lastSpeechAtRef.current = 0;
    pttActiveRef.current = false;
  }, []);

  const flushPlayback = useCallback(() => {
    playbackChainRef.current = Promise.resolve();
    stopProgressLoop();
    try {
      if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
        nextPlaybackTimeRef.current = playbackCtxRef.current.currentTime;
      }
    } catch {
      /* ignore */
    }
  }, [stopProgressLoop]);

  const ensurePlaybackUnlocked = useCallback(async () => {
    if (playbackCtxRef.current?.state === 'closed') {
      playbackCtxRef.current = null;
      gainNodeRef.current = null;
      analyserRef.current = null;
    }
    if (!playbackCtxRef.current) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: PLAYBACK_SAMPLE_RATE,
      });
      playbackCtxRef.current = ctx;
      gainNodeRef.current = ctx.createGain();
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
      onAnalyserReady?.(analyserRef.current);
      nextPlaybackTimeRef.current = ctx.currentTime;
    }
    if (playbackCtxRef.current.state === 'suspended') await playbackCtxRef.current.resume();
    return playbackCtxRef.current;
  }, [onAnalyserReady]);

  const playOneChunk = useCallback(
    async (pcm16ArrBuf) => {
      if (micMutedRef.current) return;
      const raw = await toArrayBuffer(pcm16ArrBuf);
      if (!raw || raw.byteLength < 2) return;

      const ctx = await ensurePlaybackUnlocked();
      const f32 = pcm16ToFloat32(new Int16Array(raw));
      if (!f32.length) return;

      const buf = ctx.createBuffer(1, f32.length, PLAYBACK_SAMPLE_RATE);
      buf.copyToChannel(f32, 0);

      await new Promise((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gainNodeRef.current || ctx.destination);

        const now = ctx.currentTime;
        if (pendingTurnResetRef.current) {
          pendingTurnResetRef.current = false;
          turnStartAtRef.current = 0;
          turnDurationRef.current = 0;
          stopProgressLoop();
        }
        const startAt = Math.max(now, nextPlaybackTimeRef.current);
        if (!turnStartAtRef.current) {
          turnStartAtRef.current = startAt;
          startProgressLoop();
        }
        nextPlaybackTimeRef.current = startAt + buf.duration;
        turnDurationRef.current = nextPlaybackTimeRef.current - turnStartAtRef.current;
        emitPlaybackProgress();

        if (!gotAudioRef.current) {
          gotAudioRef.current = true;
          clearNoAudioTimer();
          latencyRef.current.mark('firstAudioAt');
          const snap = latencyRef.current.snapshot();
          setLatency(snap);
          onLatencyUpdate?.(snap);
          onFirstAudio?.();
        }

        setState('speaking');
        src.onended = resolve;
        src.start(startAt);
      });
    },
    [
      ensurePlaybackUnlocked,
      emitPlaybackProgress,
      startProgressLoop,
      stopProgressLoop,
      clearNoAudioTimer,
      onFirstAudio,
      onLatencyUpdate,
    ]
  );

  const enqueueChunk = useCallback(
    (pcm16ArrBuf) => {
      if (micMutedRef.current) return;
      playbackChainRef.current = playbackChainRef.current
        .then(() => playOneChunk(pcm16ArrBuf))
        .catch((err) => console.error('PCM playback failed:', err));
    },
    [playOneChunk]
  );

  const clearThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
  }, []);

  const armThinkingWatchdog = useCallback(() => {
    clearThinkingTimer();
    thinkingTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'thinking') {
        resetUserVad();
        setState('listening');
        onError?.(new Error('Maya took too long to respond — try speaking again.'));
      }
    }, 25000);
  }, [clearThinkingTimer, resetUserVad, onError]);

  const unlockMicAfterMayaTurn = useCallback(() => {
    mayaSpokeFirstRef.current = true;
    resetUserVad();
  }, [resetUserVad]);

  const clearUserSilenceTimer = useCallback(() => {
    if (userSilenceTimerRef.current) {
      clearTimeout(userSilenceTimerRef.current);
      userSilenceTimerRef.current = null;
    }
  }, []);

  const startUserSilenceTimer = useCallback(() => {
    clearUserSilenceTimer();
    userSilenceTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'listening' && callActiveRef.current && !micMutedRef.current) {
        onUserSilence?.();
      }
    }, 8000);
  }, [clearUserSilenceTimer, onUserSilence]);

  const afterPlaybackIdle = useCallback(() => {
    stopProgressLoop();
    emitPlaybackProgress();
    unlockMicAfterMayaTurn();
    setState('listening');
    startUserSilenceTimer();
  }, [stopProgressLoop, emitPlaybackProgress, unlockMicAfterMayaTurn, startUserSilenceTimer]);

  const armNoAudioWatchdog = useCallback(() => {
    clearNoAudioTimer();
    noAudioTimerRef.current = setTimeout(() => {
      if (!gotAudioRef.current) {
        onError?.(new Error('No audio from Maya — check your speakers/headphones, then tap Retry.'));
        setState('error');
      }
    }, NO_AUDIO_TIMEOUT_MS);
  }, [clearNoAudioTimer, onError]);

  const buildWsUrl = useCallback(
    (resume = false) => {
      const sep = wsUrl.includes('?') ? '&' : '?';
      const modeParam = modeRef.current === 'ptt' ? 'ptt' : 'handsfree';
      const resumeParam = resume ? '&resume=1' : '';
      return `${wsUrl}${sep}mode=${modeParam}${resumeParam}`;
    },
    [wsUrl]
  );

  const handleWsMessage = useCallback(
    (evt, ws, startGreeting) => {
      if (typeof evt.data === 'string') {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'ready') {
            setWarmed(true);
            if (startGreeting) startGreeting(ws);
            return;
          }
          if (msg.type === 'user_transcript') {
            pushLiveLine('user', msg.text);
            onUserTranscript?.(msg.text);
          }
          if (msg.type === 'maya_thinking') {
            if (micMutedRef.current) return;
            latencyRef.current.mark('mayaThinkingAt');
            const snap = latencyRef.current.snapshot();
            setLatency(snap);
            onLatencyUpdate?.(snap);
            setState('thinking');
            armThinkingWatchdog();
          }
          if (msg.type === 'maya_speaking') {
            if (micMutedRef.current) return;
            clearThinkingTimer();
            resetUserVad();
            markTurnStart();
            setState('speaking');
          }
          if (msg.type === 'maya_transcript') {
            pushLiveLine('assistant', msg.text);
            if (msg.vocab) vocabRef.current = msg.vocab;
            onMayaTranscript?.(msg.text, msg.vocab || []);
          }
          if (msg.type === 'correction') onCorrection?.(msg.correction);
          if (msg.type === 'pronunciation') onPronunciation?.(msg.data);
          if (msg.type === 'coach_feedback') {
            onCoachFeedback?.({ improvement: msg.improvement, hasCorrection: msg.has_correction });
          }
          if (msg.type === 'reply_options') {
            onReplyOptions?.({ improvement: msg.improvement, suggestions: msg.suggestions || [] });
          }
          if (msg.type === 'turn_complete') {
            clearThinkingTimer();
            if (micMutedRef.current) {
              flushPlayback();
              playbackChainRef.current = Promise.resolve();
              return;
            }
            // Do NOT unlock mic here — wait until audio finishes playing in afterPlaybackIdle.
            // Premature unlock causes Maya's speaker audio to feed back into the mic,
            // making Gemini think the user spoke and triggering another response ("Hey there" loop).
            playbackChainRef.current = playbackChainRef.current.then(afterPlaybackIdle);
            onTurnComplete?.();
          }
          if (msg.type === 'error') {
            clearNoAudioTimer();
            onError?.(new Error(msg.message));
            setState('error');
          }
        } catch {
          /* ignore */
        }
      } else if (!micMutedRef.current) {
        enqueueChunk(evt.data);
      }
    },
    [
      pushLiveLine,
      onUserTranscript,
      onMayaTranscript,
      onCorrection,
      onPronunciation,
      onCoachFeedback,
      onReplyOptions,
      onTurnComplete,
      onError,
      onLatencyUpdate,
      resetUserVad,
      markTurnStart,
      afterPlaybackIdle,
      enqueueChunk,
      flushPlayback,
      clearNoAudioTimer,
      armThinkingWatchdog,
      clearThinkingTimer,
    ]
  );

  const tryReconnectRef = useRef(null);

  const cleanupInternal = useCallback(({ forReconnect = false } = {}) => {
    if (cleaningUpRef.current) return;
    cleaningUpRef.current = true;
    try {
      stopProgressLoop();
      clearNoAudioTimer();
      clearThinkingTimer();
      clearUserSilenceTimer();
      wsRef.current = null;
      playbackChainRef.current = Promise.resolve();
      greetingSentRef.current = false;
      setWarmed(false);

      if (forReconnect) return;

      try {
        workletRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());

      const capture = captureCtxRef.current;
      const audio = audioCtxRef.current;
      const playback = playbackCtxRef.current;
      if (capture && capture === audio) {
        safeCloseAudioContext(capture);
      } else {
        safeCloseAudioContext(audio);
        safeCloseAudioContext(capture);
      }
      safeCloseAudioContext(playback);

      workletRef.current = null;
      audioCtxRef.current = null;
      captureCtxRef.current = null;
      playbackCtxRef.current = null;
      gainNodeRef.current = null;
      analyserRef.current = null;
      streamRef.current = null;
    } finally {
      cleaningUpRef.current = false;
    }
  }, [stopProgressLoop, clearNoAudioTimer, clearThinkingTimer, clearUserSilenceTimer]);

  const openWebSocket = useCallback(
    (resume = false, { forCall = false } = {}) =>
      new Promise((resolve, reject) => {
        const existing = wsRef.current;
        if (existing?.readyState === WebSocket.OPEN && !forCall) {
          resolve(existing);
          return;
        }
        if (existing?.readyState === WebSocket.CONNECTING) {
          existing.addEventListener(
            'open',
            () => resolve(existing),
            { once: true }
          );
          return;
        }
        if (existing) wsRef.current = null;

        let settled = false;
        const finish = (fn) => {
          if (settled) return;
          settled = true;
          clearTimeout(readyTimeout);
          connectingRef.current = false;
          fn();
        };

        const ws = new WebSocket(buildWsUrl(resume));
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;
        connectingRef.current = true;
        intentionalCloseRef.current = false;

        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: authToken }));

        ws.onclose = () => {
          // Ignore stale sockets replaced during startCall / reconnect.
          if (wsRef.current !== ws) return;
          wsRef.current = null;

          if (!settled) {
            if (intentionalCloseRef.current) finish(() => resolve(null));
            else finish(() => reject(new Error('Voice connection failed')));
            return;
          }
          if (intentionalCloseRef.current) return;
          if (callActiveRef.current && reconnectAttemptsRef.current < MAX_RECONNECT) {
            cleanupInternal({ forReconnect: true });
            tryReconnectRef.current?.();
          } else if (!callActiveRef.current) {
            setWarmed(false);
          } else {
            setState('idle');
            cleanupInternal();
          }
        };

        ws.onerror = () => {
          if (intentionalCloseRef.current) finish(() => resolve(null));
          else finish(() => reject(new Error('Voice connection failed')));
        };

        const readyTimeout = setTimeout(
          () => finish(() => reject(new Error('Connection timeout — Maya is taking too long to start'))),
          READY_TIMEOUT_MS
        );

        const onReady = (evt) => {
          if (typeof evt.data !== 'string') return;
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'error') {
              ws.removeEventListener('message', onReady);
              finish(() => reject(new Error(msg.message || 'Voice connection failed')));
              return;
            }
            if (msg.type === 'auth_ok' && forCall) {
              gotAudioRef.current = false;
              greetingSentRef.current = true;
              latencyRef.current.reset();
              resetTurnPlayback({ resetClock: true });
              mayaTurnCountRef.current = 0;
              playbackChainRef.current = Promise.resolve();
              armNoAudioWatchdog();
              ws.send(resume ? '__resume_call__' : '__start_call__');
              setState('connecting');
              return;
            }
            if (msg.type === 'ready') {
              ws.removeEventListener('message', onReady);
              ws.onmessage = (e) => handleWsMessage(e, ws, null);
              setWarmed(true);
              finish(() => resolve(ws));
            }
          } catch {
            /* ignore */
          }
        };
        ws.addEventListener('message', onReady);
      }),
    [
      authToken,
      buildWsUrl,
      handleWsMessage,
      cleanupInternal,
      resetTurnPlayback,
      armNoAudioWatchdog,
    ]
  );

  const startMayaGreeting = useCallback(
    (ws) => {
      if (greetingSentRef.current) return;
      greetingSentRef.current = true;
      gotAudioRef.current = false;
      latencyRef.current.reset();
      resetTurnPlayback({ resetClock: true });
      mayaTurnCountRef.current = 0;
      playbackChainRef.current = Promise.resolve();
      armNoAudioWatchdog();
      const cmd = reconnectAttemptsRef.current > 0 ? '__resume_call__' : '__start_call__';
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(cmd);
        setState('connecting');
      }
    },
    [resetTurnPlayback, armNoAudioWatchdog]
  );

  const attachMic = useCallback(async () => {
    if (workletRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    captureCtxRef.current = ctx;
    audioCtxRef.current = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    await ctx.audioWorklet.addModule('/capture-processor.js');
    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, 'capture-processor');
    workletRef.current = worklet;

    worklet.port.onmessage = (e) => {
      const openWs = wsRef.current;
      if (!openWs || openWs.readyState !== WebSocket.OPEN) return;
      if (!mayaSpokeFirstRef.current || micMutedRef.current) return;

      const isPtt = modeRef.current === 'ptt';
      const st = stateRef.current;
      const canSend = isPtt ? pttActiveRef.current : st === 'listening';
      if (!canSend) return;

      if (ctx.state === 'suspended') void ctx.resume();

      const f32 = e.data;
      const level = rms(f32);
      const pcm = float32ToPcm16(resampleFloat32(f32, ctx.sampleRate, SEND_SAMPLE_RATE));
      openWs.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));

      if (isPtt) return;

      const now = Date.now();
      if (level >= VAD_RMS_THRESHOLD) {
        clearUserSilenceTimer();
        if (stateRef.current === 'speaking') flushPlayback();
        if (!speechActivityRef.current) speechStartRef.current = now;
        speechActivityRef.current = true;
        if (!userSpeakingRef.current) {
          userSpeakingRef.current = true;
          turnEndSentRef.current = false;
        }
        lastSpeechAtRef.current = now;
        return;
      }

      if (
        speechActivityRef.current &&
        !turnEndSentRef.current &&
        lastSpeechAtRef.current > 0
      ) {
        const silenceMs = now - lastSpeechAtRef.current;
        const speechMs = lastSpeechAtRef.current - speechStartRef.current;
        if (silenceMs >= SILENCE_END_MS && speechMs >= MIN_SPEECH_MS) {
          turnEndSentRef.current = true;
          userSpeakingRef.current = false;
          speechActivityRef.current = false;
          latencyRef.current.mark('userEndSpeechAt');
          latencyRef.current.mark('endTurnSentAt');
          openWs.send('__end_turn__');
          if (!isPtt) {
            setState('thinking');
            armThinkingWatchdog();
          }
        }
      }
    };
    source.connect(worklet);
  }, [flushPlayback, armThinkingWatchdog, clearUserSilenceTimer]);

  const warmConnect = useCallback(async () => {
    if (!authToken) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) return;
    if (connectingRef.current) return;
    try {
      const opened = await openWebSocket(false);
      if (!opened) return;
    } catch (e) {
      if (intentionalCloseRef.current) return;
      console.warn('Maya warm connect failed:', e);
    }
  }, [authToken, openWebSocket]);

  const startCall = useCallback(async () => {
    if (!authToken) {
      onError?.(new Error('Please sign in again to talk with Maya.'));
      return;
    }
    callActiveRef.current = true;
    reconnectAttemptsRef.current = 0;
    greetingSentRef.current = false;
    mayaSpokeFirstRef.current = false;
    gotAudioRef.current = false;
    resetUserVad();
    setMicMuted(false);
    liveTranscriptRef.current = [];
    vocabRef.current = [];

    try {
      await ensurePlaybackUnlocked();
      // Drop any warm/stale socket — Gemini Live sessions expire before the user taps phone.
      const staleWs = wsRef.current;
      if (staleWs) {
        intentionalCloseRef.current = true;
        staleWs.onclose = null;
        staleWs.onerror = null;
        try {
          staleWs.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
        setWarmed(false);
      }
      const ws = await openWebSocket(false, { forCall: true });
      if (!ws) throw new Error('Voice connection failed');
      await attachMic();
    } catch (e) {
      callActiveRef.current = false;
      setState('error');
      onError?.(e);
    }
  }, [
    authToken,
    ensurePlaybackUnlocked,
    openWebSocket,
    attachMic,
    resetUserVad,
    onError,
  ]);

  const connect = useCallback(async () => {
    await warmConnect();
    await startCall();
  }, [warmConnect, startCall]);

  const disconnect = useCallback(() => {
    callActiveRef.current = false;
    reconnectAttemptsRef.current = 0;
    playbackChainRef.current = Promise.resolve();
    pendingTurnResetRef.current = false;
    intentionalCloseRef.current = true;
    try {
      if (gainNodeRef.current) gainNodeRef.current.gain.value = 0;
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    mayaSpokeFirstRef.current = false;
    gotAudioRef.current = false;
    resetUserVad();
    setMicMuted(false);
    cleanupInternal();
    setState('idle');
  }, [resetUserVad, cleanupInternal]);

  const tryReconnect = useCallback(async () => {
    if (!callActiveRef.current || reconnectAttemptsRef.current >= MAX_RECONNECT) return;
    reconnectAttemptsRef.current += 1;
    onReconnecting?.(reconnectAttemptsRef.current);
    greetingSentRef.current = false;
    try {
      await openWebSocket(true, { forCall: true });
      await attachMic();
    } catch {
      if (reconnectAttemptsRef.current < MAX_RECONNECT) {
        setTimeout(tryReconnect, 1500 * reconnectAttemptsRef.current);
      } else {
        onError?.(new Error('Could not reconnect to Maya.'));
        setState('error');
      }
    }
  }, [openWebSocket, attachMic, onReconnecting, onError]);

  tryReconnectRef.current = tryReconnect;

  const toggleMicMute = useCallback(() => {
    setMicMuted((wasMuted) => {
      const next = !wasMuted;
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });

      if (next) {
        flushPlayback();
        playbackChainRef.current = Promise.resolve();
        clearThinkingTimer();
        clearUserSilenceTimer();
        resetUserVad();
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send('__mic_mute__');
        }
        if (callActiveRef.current) {
          setState('listening');
        }
      } else {
        resetUserVad();
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send('__mic_unmute__');
        }
        if (
          callActiveRef.current &&
          stateRef.current !== 'connecting' &&
          stateRef.current !== 'speaking'
        ) {
          setState('listening');
        }
      }

      return next;
    });
  }, [flushPlayback, clearThinkingTimer, clearUserSilenceTimer, resetUserVad]);

  const pttDown = useCallback(() => {
    pttActiveRef.current = true;
    userSpeakingRef.current = true;
    turnEndSentRef.current = false;
  }, []);

  const pttUp = useCallback(() => {
    pttActiveRef.current = false;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && userSpeakingRef.current) {
      userSpeakingRef.current = false;
      turnEndSentRef.current = true;
      latencyRef.current.mark('endTurnSentAt');
      ws.send('__end_turn__');
    }
  }, []);

  return {
    state,
    micMuted,
    warmed,
    latency: DEBUG_LATENCY ? latency : null,
    progressRef,
    liveTranscriptRef,
    vocabRef,
    warmConnect,
    startCall,
    connect,
    disconnect,
    toggleMicMute,
    ensurePlaybackUnlocked,
    pttDown,
    pttUp,
  };
}
