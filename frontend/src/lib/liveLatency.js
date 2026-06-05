/** Dev-only latency tracker for Maya live calls. */
export function createLatencyTracker() {
  const marks = {};
  return {
    mark(key) {
      marks[key] = performance.now();
    },
    snapshot() {
      const endTurn = marks.endTurnSentAt;
      const thinking = marks.mayaThinkingAt;
      const firstAudio = marks.firstAudioAt;
      return {
        userEndSpeechMs: marks.userEndSpeechAt ? Math.round(marks.userEndSpeechAt) : null,
        endTurnMs: endTurn ? Math.round(endTurn) : null,
        thinkingMs: thinking && endTurn ? Math.round(thinking - endTurn) : null,
        firstAudioMs: firstAudio && endTurn ? Math.round(firstAudio - endTurn) : null,
      };
    },
    reset() {
      Object.keys(marks).forEach((k) => delete marks[k]);
    },
  };
}

export const DEBUG_LATENCY = process.env.REACT_APP_DEBUG_LATENCY === 'true';
