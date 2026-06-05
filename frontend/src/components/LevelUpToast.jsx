import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

export default function LevelUpToast({ newLevel, onDismiss }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (newLevel) {
      setShow(true);
      // burst confetti
      const colors = ['#C85A47', '#FBC5B0', '#4A5D4E', '#FCECC9'];
      const end = Date.now() + 1200;
      (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
      const t = setTimeout(() => { setShow(false); onDismiss?.(); }, 5500);
      return () => clearTimeout(t);
    }
  }, [newLevel, onDismiss]);

  return (
    <AnimatePresence>
      {show && newLevel && (
        <motion.div
          initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[120] bg-stone-900 text-white rounded-2xl px-6 py-4 shadow-2xl border border-stone-700 flex items-center gap-4 max-w-md"
          data-testid="level-up-toast"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FBC5B0] to-[#C85A47] flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-mono-tag text-[10px] uppercase tracking-[0.2em] text-[#FBC5B0]">Level up!</p>
            <p className="font-display text-lg font-medium leading-tight">You're now {newLevel}.</p>
          </div>
          <button onClick={() => { setShow(false); onDismiss?.(); }} className="text-stone-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
