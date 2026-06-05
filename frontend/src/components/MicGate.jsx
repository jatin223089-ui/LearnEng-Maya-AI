import { Mic, Volume2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from './ui/button';

/**
 * Friendly mic-permission gate shown BEFORE we ask the browser for permission.
 * Explains why we need the mic and what happens with the audio.
 */
export default function MicGate({ onAllow, onCancel }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[110] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="mic-gate"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }}
        className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl"
      >
        <div className="w-16 h-16 rounded-2xl bg-[#FBEAE7] flex items-center justify-center mb-6 mx-auto">
          <Mic className="w-8 h-8 text-[#C85A47]" />
        </div>
        <h3 className="font-display text-2xl tracking-tight font-medium text-center mb-3">
          Maya needs to hear you
        </h3>
        <p className="text-stone-600 text-center leading-relaxed mb-6">
          Your browser will ask for microphone access. We only use it while you're on a call — nothing is recorded or shared.
        </p>
        <ul className="space-y-3 mb-8">
          <li className="flex items-start gap-3 text-sm text-stone-700">
            <Volume2 className="w-4 h-4 text-[#4A5D4E] mt-0.5 shrink-0" />
            Audio streams directly to Maya for transcription, then is discarded.
          </li>
          <li className="flex items-start gap-3 text-sm text-stone-700">
            <ShieldCheck className="w-4 h-4 text-[#4A5D4E] mt-0.5 shrink-0" />
            You can revoke access anytime from your browser settings.
          </li>
        </ul>
        <div className="flex gap-3">
          <Button
            data-testid="mic-gate-cancel"
            onClick={onCancel}
            variant="outline"
            className="flex-1 h-12 rounded-full"
          >
            Maybe later
          </Button>
          <Button
            data-testid="mic-gate-allow"
            onClick={onAllow}
            className="flex-1 h-12 rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white"
          >
            Allow mic
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
