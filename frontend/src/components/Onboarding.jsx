import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Phone, BookOpen, Lightbulb } from 'lucide-react';

const STORAGE_KEY = 'englearn_onboarded_v1';

const STEPS = [
  {
    icon: Phone,
    title: 'Tap any scenario to start a call',
    body: "Maya picks up the phone, sets the scene, and waits for you. You can speak naturally — no script required.",
  },
  {
    icon: Lightbulb,
    title: 'Stuck? Tap the 💡 Hint',
    body: 'You\'ll get 3 different things you could say — easy, medium, and richer. Tap one to use it.',
  },
  {
    icon: BookOpen,
    title: 'Every correction is saved',
    body: 'Maya gently fixes your sentences. Review them anytime in your Vocabulary book.',
  },
];

export default function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const close = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setOpen(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else close();
  };

  if (!open) return null;
  const S = STEPS[step];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-stone-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        data-testid="onboarding-overlay"
      >
        <motion.div
          initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative"
        >
          <button
            onClick={close}
            className="absolute top-4 right-4 text-stone-400 hover:text-stone-900"
            aria-label="Skip"
            data-testid="onboarding-skip"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-[#FBEAE7] flex items-center justify-center mb-6">
            <S.icon className="w-7 h-7 text-[#C85A47]" />
          </div>
          <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-3">
            Step {step + 1} of {STEPS.length}
          </p>
          <h3 className="font-display text-3xl tracking-tight font-medium leading-tight mb-3">{S.title}</h3>
          <p className="text-stone-600 leading-relaxed">{S.body}</p>

          <div className="flex items-center justify-between mt-10">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-8 bg-[#C85A47]' : 'w-1.5 bg-stone-300'}`} />
              ))}
            </div>
            <button
              onClick={next}
              data-testid="onboarding-next"
              className="flex items-center gap-2 bg-[#C85A47] hover:bg-[#B34A38] text-white rounded-full px-5 h-11 font-medium text-sm transition-colors"
            >
              {step === STEPS.length - 1 ? "Let's go" : 'Next'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
