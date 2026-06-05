import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Loader2, Sparkles, WifiOff } from 'lucide-react';
import api from '../lib/api';
import { VOCAB } from '../constants/testIds';
import Header from '../components/Header';
import { Skeleton } from '../components/ui/skeleton';

const CACHE_KEY = 'englearn_vocab_cache_v1';

export default function Vocabulary() {
  const [items, setItems] = useState([]);
  const [dueItems, setDueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    // 1. Hydrate from localStorage instantly (offline support)
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setItems(parsed.items || []);
        setFromCache(true);
        setLoading(false);
      } catch {}
    }
    // 2. Then refresh from network
    Promise.allSettled([api.get('/corrections'), api.get('/corrections/due')])
      .then(([allRes, dueRes]) => {
        if (allRes.status === 'fulfilled') {
          setItems(allRes.value.data);
          setFromCache(false);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ items: allRes.value.data, fetched_at: Date.now() }));
        }
        if (dueRes.status === 'fulfilled') setDueItems(dueRes.value.data);
      })
      .catch(() => {
        // keep cached
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid={VOCAB.page}>
      <Header />
      <main className="max-w-5xl mx-auto px-6 lg:px-10 py-12">
        <Link to="/dashboard" className="text-sm text-stone-500 hover:text-stone-900 flex items-center gap-2 mb-8">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <BookOpen className="w-5 h-5 text-[#C85A47]" />
          <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium">Your vocabulary book</p>
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter font-medium">
          Every correction.<br /><span className="italic text-[#C85A47] font-normal">One place.</span>
        </h1>
        <p className="mt-4 text-stone-600 max-w-xl">
          A growing collection of every gentle correction Maya has given you. Review them anytime — repetition is how fluency sticks.
        </p>
        <Link
          to="/conversations"
          className="inline-block mt-4 text-sm text-[#C85A47] font-medium hover:underline"
        >
          Browse full conversation history →
        </Link>

        {fromCache && (
          <div className="mt-6 inline-flex items-center gap-2 text-xs font-mono-tag uppercase tracking-wider text-[#4A5D4E] bg-[#E8EBE9] px-3 py-1.5 rounded-full" data-testid="vocab-offline-badge">
            <WifiOff className="w-3.5 h-3.5" /> Showing your saved copy
          </div>
        )}

        {dueItems.length > 0 && (
          <section className="mt-10" data-testid="vocab-review-today">
            <p className="text-xs uppercase tracking-[0.22em] text-[#C85A47] font-medium mb-3">Review today</p>
            <div className="grid md:grid-cols-2 gap-4">
              {dueItems.map((item) => (
                <div
                  key={`due-${item.id}`}
                  className="bg-[#FBEAE7] border border-[#C85A47]/40 rounded-2xl p-5"
                >
                  <p className="font-mono-tag text-sm text-stone-500 line-through mb-1">{item.correction?.original}</p>
                  <p className="font-mono-tag text-sm text-[#C85A47] mb-2">{item.correction?.corrected}</p>
                  {item.correction?.tip && (
                    <p className="text-sm text-stone-700">💡 {item.correction.tip}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-12">
          {loading && items.length === 0 && (
            <div className="grid md:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white border border-stone-200/70 rounded-2xl p-6">
                  <Skeleton className="w-1/2 h-3 mb-4" />
                  <Skeleton className="w-full h-4 mb-2" />
                  <Skeleton className="w-3/4 h-4 mb-4" />
                  <Skeleton className="w-full h-16 rounded-lg" />
                </div>
              ))}
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-12 text-center">
              <Sparkles className="w-8 h-8 text-stone-400 mx-auto mb-3" />
              <p className="text-stone-500 mb-4">No corrections yet. Start talking with Maya — she'll gently teach you and the corrections will appear here.</p>
              <Link to="/dashboard" className="text-[#C85A47] font-medium hover:underline">Start a conversation →</Link>
            </div>
          )}

          {items.length > 0 && (
            <p className="text-sm text-stone-500 mb-6 font-mono-tag uppercase tracking-wider">
              {items.length} correction{items.length === 1 ? '' : 's'} learned
            </p>
          )}

          <div className="grid md:grid-cols-2 gap-5">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                data-testid={VOCAB.card}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.4) }}
                className="bg-white border border-stone-200/70 rounded-2xl p-6 hover:border-[#4A5D4E]/60 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <Link to={`/transcript/${item.session_id}`} className="font-mono-tag text-[10px] uppercase tracking-wider text-stone-500 hover:text-[#C85A47]">
                    {item.session_title}
                  </Link>
                  <span className="font-mono-tag text-[10px] text-stone-400">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="font-mono-tag text-sm text-stone-500 line-through mb-1">{item.correction.original}</p>
                <p className="font-mono-tag text-sm text-[#C85A47] mb-4">{item.correction.corrected}</p>
                {item.correction.tip && (
                  <p className="text-sm text-stone-700 leading-relaxed bg-[#FCECC9]/50 border border-[#FCECC9] rounded-lg p-3">
                    💡 {item.correction.tip}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
