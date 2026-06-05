import { useEffect, useState } from 'react';
import { useCaptionSync } from '../hooks/useCaptionSync';

function isVocabToken(token, vocabWords) {
  if (!vocabWords?.length) return false;
  const clean = token.replace(/[^A-Za-z']/g, '').toLowerCase();
  return vocabWords.some((v) => v.toLowerCase() === clean);
}

export default function StreamingCaption({
  text,
  isSpeaking = false,
  progressRef,
  vocabWords = [],
  className = '',
  emptyPlaceholder = '…',
}) {
  const [clock, setClock] = useState({ elapsedSec: 0, turnDurationSec: 0 });

  useEffect(() => {
    if (!isSpeaking || !progressRef) return undefined;
    let raf = 0;
    const loop = () => {
      setClock(progressRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isSpeaking, progressRef]);

  const { tokens, activeWordIndex } = useCaptionSync({
    text,
    isSpeaking,
    playbackElapsedSec: clock.elapsedSec,
    turnDurationSec: clock.turnDurationSec,
  });

  if (!text) {
    return (
      <p
        className={`font-display text-[1.65rem] sm:text-3xl leading-snug tracking-tight text-stone-400 text-center ${className}`}
      >
        {emptyPlaceholder}
      </p>
    );
  }

  let wordCounter = -1;

  return (
    <p
      className={`font-display text-[1.65rem] sm:text-3xl md:text-[2rem] leading-snug tracking-tight text-center font-medium ${className}`}
    >
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
        wordCounter += 1;
        const isActive = isSpeaking && wordCounter === activeWordIndex;
        const isSpoken = isSpeaking && activeWordIndex >= 0 && wordCounter < activeWordIndex;
        const isVocab = isVocabToken(token, vocabWords);

        let cls = 'text-stone-900';
        if (isActive) cls = 'text-[#C85A47]';
        else if (isSpoken) cls = 'text-stone-800';
        else if (isVocab) cls = 'text-[#4A5D4E] underline decoration-[#4A5D4E]/40 underline-offset-4';

        return (
          <span key={i} className={cls}>
            {token}
          </span>
        );
      })}
    </p>
  );
}
