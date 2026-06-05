import { useMemo, useRef, useEffect } from 'react';

export function tokenizeCaption(text) {
  if (!text) return [];
  return text.match(/\S+|\s+/g) || [];
}

const WORDS_PER_SEC = 2.8;

export function useCaptionSync({ text, isSpeaking, playbackElapsedSec = 0, turnDurationSec = 0 }) {
  const tokens = useMemo(() => tokenizeCaption(text), [text]);
  const wordCount = useMemo(
    () => tokens.filter((t) => !/^\s+$/.test(t)).length,
    [tokens]
  );
  const maxIndexRef = useRef(-1);

  useEffect(() => {
    if (!isSpeaking) maxIndexRef.current = -1;
  }, [isSpeaking]);

  const activeWordIndex = useMemo(() => {
    if (!text || !wordCount) return -1;
    if (!isSpeaking) return wordCount - 1;

    const elapsed = Math.max(0, playbackElapsedSec);
    const duration = Math.max(turnDurationSec, elapsed + 0.05, wordCount / WORDS_PER_SEC);
    const progress = Math.min(1, elapsed / duration);
    const raw = Math.min(wordCount - 1, Math.floor(progress * wordCount));

    maxIndexRef.current = Math.max(maxIndexRef.current, raw);
    return maxIndexRef.current;
  }, [text, isSpeaking, playbackElapsedSec, turnDurationSec, wordCount]);

  return { tokens, activeWordIndex };
}
