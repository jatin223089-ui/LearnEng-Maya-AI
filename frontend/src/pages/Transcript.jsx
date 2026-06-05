import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import { TRANSCRIPT } from '../constants/testIds';

export default function Transcript() {
  const { sessionId } = useParams();
  const [messages, setMessages] = useState([]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/sessions/${sessionId}/messages`),
      api.get('/sessions'),
    ])
      .then(([m, s]) => {
        setMessages(m.data);
        setSession(s.data.find((x) => x.id === sessionId));
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid={TRANSCRIPT.page}>
      <header className="border-b border-stone-200/70 bg-[#F9F8F6]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="text-sm text-stone-600 hover:text-stone-900 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <div className="text-sm">
            <p className="font-display font-medium">{session?.title || 'Conversation'}</p>
          </div>
          <Link to={`/chat/${sessionId}`} className="text-sm text-[#C85A47] hover:underline flex items-center gap-1.5 font-medium">
            <Phone className="w-4 h-4" /> Resume chat
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-3">Transcript</p>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium mb-2">
          {session?.title || 'Conversation'}
        </h1>
        <p className="text-sm text-stone-500 mb-10">
          {session?.created_at && new Date(session.created_at).toLocaleString()} · {messages.length} messages
        </p>

        {loading && (
          <p className="text-stone-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
        )}

        <div className="space-y-8">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                data-testid={TRANSCRIPT.message}
                className={m.role === 'assistant' ? '' : `flex flex-col items-end${m.correction?.corrected ? ' ring-2 ring-[#C85A47]/30 rounded-xl p-3 -m-3' : ''}`}
              >
                <p className="text-xs uppercase tracking-[0.2em] font-medium mb-2" style={{ color: m.role === 'assistant' ? '#C85A47' : '#6B7068' }}>
                  {m.role === 'assistant' ? 'Maya' : 'You'}
                  {m.correction?.corrected && m.role === 'user' && (
                    <span className="ml-2 text-[#C85A47] normal-case tracking-normal">· corrected</span>
                  )}
                </p>
                <div className={m.role === 'assistant' ? 'pr-8' : 'pl-8 text-right'}>
                  <p className={`leading-relaxed ${m.role === 'assistant' ? 'font-display text-xl md:text-2xl tracking-tight text-stone-900' : 'text-base text-stone-800'}`}>
                    {m.text}
                  </p>
                </div>
                {m.correction && m.correction.corrected && (
                  <div className="mt-3 bg-[#FBEAE7] border border-[#C85A47]/30 rounded-xl p-4 max-w-xl">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#C85A47] font-medium mb-2">Gentle correction</p>
                    <p className="font-mono-tag text-sm text-stone-700 line-through mb-1">{m.correction.original}</p>
                    <p className="font-mono-tag text-sm text-[#C85A47] mb-3">{m.correction.corrected}</p>
                    {m.correction.tip && <p className="text-sm text-stone-700 leading-relaxed">💡 {m.correction.tip}</p>}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {!loading && messages.length === 0 && (
          <p className="text-stone-500">No messages yet — start a call to begin.</p>
        )}
      </main>
    </div>
  );
}
