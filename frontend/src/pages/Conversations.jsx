import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Loader2, Phone, FileText, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../lib/api';
import Header from '../components/Header';

export default function Conversations() {
  const [sessions, setSessions] = useState([]);
  const [previews, setPreviews] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/sessions')
      .then(async (r) => {
        const list = r.data || [];
        setSessions(list);
        const entries = await Promise.all(
          list.slice(0, 30).map(async (s) => {
            try {
              const m = await api.get(`/sessions/${s.id}/messages`);
              const msgs = m.data || [];
              const last = msgs[msgs.length - 1];
              return [
                s.id,
                {
                  count: msgs.length,
                  lastText: last?.text?.slice(0, 120) || '',
                  lastRole: last?.role,
                },
              ];
            } catch {
              return [s.id, { count: 0, lastText: '', lastRole: null }];
            }
          })
        );
        setPreviews(Object.fromEntries(entries));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link
          to="/dashboard"
          className="text-sm text-stone-500 hover:text-stone-900 flex items-center gap-2 mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <MessageCircle className="w-5 h-5 text-[#C85A47]" />
          <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium">All conversations</p>
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter font-medium">
          Chat history
        </h1>
        <p className="mt-3 text-stone-600 max-w-lg">
          Every session with Maya is saved here. Resume voice chat or read the full transcript.
        </p>

        <div className="mt-12 space-y-4">
          {loading && (
            <p className="text-stone-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </p>
          )}

          {!loading && sessions.length === 0 && (
            <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-12 text-center">
              <Sparkles className="w-8 h-8 text-stone-400 mx-auto mb-3" />
              <p className="text-stone-500 mb-4">No chats yet.</p>
              <Link to="/dashboard" className="text-[#C85A47] font-medium hover:underline">
                Start talking with Maya →
              </Link>
            </div>
          )}

          {sessions.map((s, i) => {
            const p = previews[s.id] || {};
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="bg-white border border-stone-200/70 rounded-2xl p-5 hover:border-[#4A5D4E]/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-lg font-medium truncate">{s.title}</p>
                    <p className="text-xs text-stone-500 mt-1">
                      {new Date(s.created_at).toLocaleString()}
                      {p.count ? ` · ${p.count} messages` : ''}
                    </p>
                    {p.lastText && (
                      <p className="text-sm text-stone-600 mt-3 line-clamp-2 leading-relaxed">
                        <span className="text-stone-400">{p.lastRole === 'assistant' ? 'Maya: ' : 'You: '}</span>
                        {p.lastText}
                        {p.lastText.length >= 120 ? '…' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      to={`/transcript/${s.id}`}
                      className="w-10 h-10 rounded-full border border-stone-200 flex items-center justify-center text-stone-600 hover:border-[#4A5D4E]"
                      title="Transcript"
                    >
                      <FileText className="w-4 h-4" />
                    </Link>
                    <Link
                      to={`/chat/${s.id}`}
                      className="w-10 h-10 rounded-full bg-[#C85A47] text-white flex items-center justify-center hover:bg-[#B34A38]"
                      title="Voice chat"
                    >
                      <Phone className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
