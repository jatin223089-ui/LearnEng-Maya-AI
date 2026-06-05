import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, Clock, BookOpen, TrendingUp, MessageCircle, FileText, Phone, MessagesSquare, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import Header from '../components/Header';
import Onboarding from '../components/Onboarding';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { DASHBOARD, SCENARIO } from '../constants/testIds';
import { toast } from 'sonner';

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [scenarios, setScenarios] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem('englearn_call_mode', 'live');
    Promise.allSettled([
      api.get('/scenarios'),
      api.get('/sessions'),
      api.get('/daily-mission'),
    ])
      .then(([scenariosRes, sessionsRes, missionRes]) => {
        if (scenariosRes.status === 'fulfilled') setScenarios(scenariosRes.value.data);
        if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.data);
        if (missionRes.status === 'fulfilled') setMission(missionRes.value.data);
      })
      .finally(() => setLoading(false));
    refresh();
    // eslint-disable-next-line
  }, []);

  const startScenario = async (id) => {
    try {
      const r = await api.post('/sessions', { scenario_id: id });
      nav(`/chat/${r.data.id}`);
    } catch {
      toast.error("Couldn't start session");
    }
  };

  const startMission = async () => {
    try {
      const r = await api.post('/daily-mission/start');
      nav(`/chat/${r.data.id}`);
    } catch {
      toast.error("Couldn't start daily mission");
    }
  };

  if (!user) return null;

  const casualScenarios = scenarios.filter((s) => s.level === 'All Levels');
  const roleplayScenarios = scenarios.filter((s) => s.level !== 'All Levels');

  const stats = [
    { icon: Flame, label: 'Day streak', value: user.streak, color: '#C85A47', testid: DASHBOARD.streakStat },
    { icon: Clock, label: 'Minutes practiced', value: user.minutes_practiced, color: '#4A5D4E' },
    { icon: BookOpen, label: 'Words learned', value: user.words_learned, color: '#C85A47' },
    { icon: TrendingUp, label: 'Level', value: user.level, color: '#4A5D4E' },
  ];

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <Header />
      <Onboarding />
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-3">Good to see you</p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter font-medium">
            Hi,{' '}
            <span className="inline-flex items-center gap-1.5">
              {user.name.split(' ')[0]}
              <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-[#C85A47]" strokeWidth={2} aria-hidden />
            </span>
            .<br /><span className="italic text-[#C85A47] font-normal">Ready to talk?</span>
          </h1>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.06 }}
              data-testid={s.testid}
              className="bg-white border border-stone-200/70 rounded-2xl p-6"
            >
              <s.icon className="w-5 h-5 mb-3" style={{ color: s.color }} />
              <p className="font-display text-3xl tracking-tight font-medium">{s.value}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500 mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-6">
          <Link
            to="/conversations"
            className="inline-flex items-center gap-2 text-sm text-[#4A5D4E] hover:text-[#C85A47] font-medium"
          >
            <MessagesSquare className="w-4 h-4" />
            View all conversations →
          </Link>
        </div>

        {/* Daily mission */}
        {mission && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-8 bg-gradient-to-br from-[#4A5D4E] to-[#3a4a3e] text-white rounded-2xl p-6 md:p-8"
            data-testid="daily-mission-card"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[#FBC5B0] font-medium mb-2">
                  Today&apos;s mission · {mission.scenario_emoji} {mission.scenario_title}
                </p>
                <p className="font-display text-2xl md:text-3xl font-medium">{mission.objective}</p>
                <p className="text-sm text-white/80 mt-2">{mission.opener_hint}</p>
              </div>
              <Button
                onClick={startMission}
                className="shrink-0 h-12 px-8 rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white"
                data-testid="daily-mission-start"
              >
                Start mission →
              </Button>
            </div>
          </motion.div>
        )}

        {/* Quick actions row */}
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <Link
            data-testid={DASHBOARD.vocabLink}
            to="/vocabulary"
            className="bg-stone-900 text-white rounded-2xl p-6 flex items-center justify-between hover:bg-stone-800 transition-colors group"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#FBC5B0] font-medium mb-2">Vocabulary book</p>
              <p className="font-display text-2xl font-medium">Review your corrections →</p>
            </div>
            <BookOpen className="w-10 h-10 text-[#FBC5B0] group-hover:scale-110 transition-transform" />
          </Link>
          <button
            data-testid={DASHBOARD.newSessionBtn}
            onClick={() => startScenario('free-talk')}
            className="bg-[#C85A47] text-white rounded-2xl p-6 flex items-center justify-between hover:bg-[#B34A38] transition-colors group text-left"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#FBC5B0] font-medium mb-2">One-tap live call</p>
              <p className="font-display text-2xl font-medium flex items-center gap-2 flex-wrap">
                Quick-start{' '}
                <span className="inline-flex items-center gap-1.5">
                  Maya AI
                  <Sparkles className="w-4 h-4 text-[#FBC5B0]" strokeWidth={2} />
                </span>
                →
              </p>
            </div>
            <Phone className="w-10 h-10 text-white group-hover:scale-110 transition-transform" />
          </button>
        </div>

        {/* Scenarios — open conversation */}
        <section className="mt-16">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-2">Open conversation</p>
            <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium">Chat freely with Maya</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {loading && Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white border border-stone-200/70 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Skeleton className="w-8 h-8 rounded" />
                  <Skeleton className="w-20 h-5 rounded" />
                </div>
                <Skeleton className="w-32 h-6 mb-2" />
                <Skeleton className="w-full h-4 mb-1" />
                <Skeleton className="w-3/4 h-4" />
              </div>
            ))}
            {!loading && casualScenarios.map((s, i) => (
              <motion.button
                key={s.id}
                data-testid={`${SCENARIO.card}-${s.id}`}
                onClick={() => startScenario(s.id)}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05 }}
                className="text-left bg-white border border-stone-200/70 rounded-2xl p-6 hover:-translate-y-1 hover:border-[#4A5D4E]/60 hover:shadow-[0_15px_35px_-15px_rgba(70,40,30,0.18)] transition-all duration-300 group flex flex-col h-full"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{s.emoji}</span>
                  <span className="font-mono-tag text-[10px] uppercase tracking-wider text-[#4A5D4E] bg-[#E8EBE9] px-2 py-1 rounded">{s.level}</span>
                </div>
                <h3 className="font-display text-xl font-medium mb-2 group-hover:text-[#C85A47] transition-colors">{s.title}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{s.description}</p>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Scenarios — roleplay & practice */}
        <section className="mt-16">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-2">Roleplay & practice</p>
            <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium">Real-life situations</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-stone-200/70 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Skeleton className="w-8 h-8 rounded" />
                  <Skeleton className="w-20 h-5 rounded" />
                </div>
                <Skeleton className="w-32 h-6 mb-2" />
                <Skeleton className="w-full h-4 mb-1" />
                <Skeleton className="w-3/4 h-4" />
              </div>
            ))}
            {!loading && roleplayScenarios.map((s, i) => (
              <motion.button
                key={s.id}
                data-testid={`${SCENARIO.card}-${s.id}`}
                onClick={() => startScenario(s.id)}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05 }}
                className="text-left bg-white border border-stone-200/70 rounded-2xl p-6 hover:-translate-y-1 hover:border-[#4A5D4E]/60 hover:shadow-[0_15px_35px_-15px_rgba(70,40,30,0.18)] transition-all duration-300 group flex flex-col h-full"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{s.emoji}</span>
                  <span className="font-mono-tag text-[10px] uppercase tracking-wider text-[#4A5D4E] bg-[#E8EBE9] px-2 py-1 rounded">{s.level}</span>
                </div>
                <h3 className="font-display text-xl font-medium mb-2 group-hover:text-[#C85A47] transition-colors">{s.title}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{s.description}</p>
              </motion.button>
            ))}
          </div>
        </section>

        {/* History */}
        <section className="mt-16" data-testid={DASHBOARD.sessionList}>
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-2">Your sessions</p>
              <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium">History</h2>
            </div>
            {sessions.length > 0 && (
              <Link
                to="/conversations"
                className="text-sm text-[#4A5D4E] hover:text-[#C85A47] font-medium shrink-0"
              >
                View all →
              </Link>
            )}
          </div>
          {sessions.length === 0 ? (
            <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-10 text-center">
              <MessageCircle className="w-8 h-8 text-stone-400 mx-auto mb-3" />
              <p className="text-stone-500">No conversations yet. Pick a scenario above to start chatting with Maya.</p>
            </div>
          ) : (
            <>
              <div className="bg-white border border-stone-200/70 rounded-2xl overflow-hidden divide-y divide-stone-200/70">
                {sessions.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-stone-50/80 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{s.title}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {new Date(s.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        to={`/transcript/${s.id}`}
                        className="w-8 h-8 rounded-full border border-stone-200 hover:border-[#4A5D4E] flex items-center justify-center text-stone-600 hover:text-stone-900 transition-colors"
                        title="View transcript"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Link>
                      <Link
                        to={`/chat/${s.id}`}
                        className="w-8 h-8 rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white flex items-center justify-center transition-colors"
                        title="Resume chat"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              {sessions.length > 3 && (
                <Link
                  to="/conversations"
                  className="mt-4 inline-flex items-center gap-2 text-sm text-[#4A5D4E] hover:text-[#C85A47] font-medium"
                >
                  <MessagesSquare className="w-4 h-4" />
                  {sessions.length - 3} more in history →
                </Link>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
