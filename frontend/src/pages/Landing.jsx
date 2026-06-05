import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Mic2, BookOpen, BarChart3, Globe2 } from 'lucide-react';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
import VoiceOrb from '../components/VoiceOrb';
import { Button } from '../components/ui/button';
import { LANDING } from '../constants/testIds';

const features = [
  { icon: Mic2, title: 'Talk, don\'t type', body: 'Maya listens, understands, and replies in natural spoken English. Real conversations, real progress.' },
  { icon: BookOpen, title: 'Inline corrections', body: 'Get grammar fixes mid-conversation with kind, jargon-free explanations.' },
  { icon: BarChart3, title: 'Track your growth', body: 'Streaks, fluency level, new words learned — see your English improve daily.' },
  { icon: Globe2, title: '20+ scenarios', body: 'From interviews to ordering coffee. Roleplay any real-world situation.' },
];

const scenarios = [
  { title: 'Job Interview', emoji: '💼', level: 'Intermediate', description: 'Practice a job interview for a role you want.' },
  { title: 'Order at a Cafe', emoji: '☕', level: 'Beginner', description: 'Order coffee and food in a busy cafe.' },
  { title: 'Free Talk', emoji: '💬', level: 'All Levels', description: 'Have a casual conversation with Maya about anything.' },
];

const testimonials = [
  { name: 'Aanya P.', role: 'Designer, Mumbai', text: '"Maya feels like a friend who happens to be a brilliant English teacher. My speaking confidence doubled in 3 weeks."', avatar: 'https://images.unsplash.com/photo-1745197375167-884c1ab268cb?crop=entropy&cs=srgb&fm=jpg&w=200&q=80' },
  { name: 'Hiro T.', role: 'Engineer, Tokyo', text: '"I practice job interview English at 6am every day. The corrections are gold."', avatar: 'https://images.unsplash.com/photo-1662850886700-4ec19bd30d11?crop=entropy&cs=srgb&fm=jpg&w=200&q=80' },
  { name: 'Lúcia M.', role: 'Student, São Paulo', text: '"It\'s like having a patient tutor on call. No judgement, just progress."', avatar: 'https://images.unsplash.com/photo-1758874384753-b9672af6b063?crop=entropy&cs=srgb&fm=jpg&w=200&q=80' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900 overflow-hidden">
      <Header />

      {/* HERO */}
      <section className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-16 lg:pt-24 pb-32">
        <div className="float-shape" style={{ background: '#FBC5B0', width: 380, height: 380, top: -60, right: -80 }} />
        <div className="float-shape" style={{ background: '#E8EBE9', width: 280, height: 280, bottom: -80, left: -60, animationDelay: '4s' }} />

        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
            className="lg:col-span-7"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E8EBE9] text-[#4A5D4E] text-xs uppercase tracking-[0.2em] font-medium mb-8">
              <Sparkles className="w-3.5 h-3.5" /> Meet Maya
            </div>
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tighter leading-[0.95] font-medium text-stone-900">
              Learn English<br />
              by simply<br />
              <span className="text-[#C85A47] italic font-normal">talking.</span>
            </h1>
            <p className="mt-8 text-lg md:text-xl text-stone-600 max-w-xl leading-relaxed">
              Maya is your always-on AI tutor — patient, kind, and surprisingly good at conversation.
              Speak naturally, get gentle corrections, and watch your fluency grow.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link to="/signup">
                <Button data-testid={LANDING.heroCta} size="lg" className="rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white px-8 h-14 text-base">
                  Start talking with Maya <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <a href="#how" className="text-sm font-medium text-stone-700 hover:text-stone-900 underline-offset-4 hover:underline">
                Watch a 60-sec demo →
              </a>
            </div>
            <div className="mt-10 flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-stone-500 font-medium">
              <span className="w-8 h-px bg-stone-300" />
              Trusted by 12,400 learners worldwide
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-5 flex justify-center"
          >
            <div className="relative">
              <VoiceOrb state="idle" size={340} />
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-lg px-4 py-3 border border-stone-200/60 max-w-[220px]">
                <p className="text-xs text-stone-500 uppercase tracking-[0.18em] mb-1">Maya says</p>
                <p className="text-sm">"Hey! Tell me about your morning ☀️"</p>
              </div>
              <div className="absolute -top-2 -right-4 bg-[#FBEAE7] text-[#C85A47] rounded-xl px-3 py-2 text-xs font-mono-tag border border-[#C85A47]/20">
                "I go" → "I went"
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FEATURES BENTO */}
      <section id="features" className="max-w-7xl mx-auto px-6 lg:px-10 py-20">
        <div className="grid md:grid-cols-12 gap-6">
          <div className="md:col-span-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-4">What makes Maya different</p>
            <h2 className="font-display text-4xl md:text-5xl tracking-tight font-medium leading-[1.05]">
              Not flashcards.<br />A real <em className="text-[#C85A47] not-italic">conversation</em>.
            </h2>
          </div>
          <div className="md:col-span-7 grid sm:grid-cols-2 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="bg-white border border-stone-200/70 rounded-2xl p-6 hover:-translate-y-1 hover:shadow-[0_15px_35px_-15px_rgba(70,40,30,0.18)] transition-all duration-300"
              >
                <f.icon className="w-5 h-5 text-[#C85A47] mb-4" />
                <h3 className="font-display text-xl font-medium mb-2">{f.title}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SCENARIOS */}
      <section id="scenarios" className="max-w-7xl mx-auto px-6 lg:px-10 py-20">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-2">Practice anything</p>
            <h2 className="font-display text-2xl md:text-3xl tracking-tight font-medium">Roleplay real life.</h2>
          </div>
          <Link to="/signup" className="text-sm text-[#4A5D4E] hover:text-[#C85A47] font-medium shrink-0">
            See all 20+ scenarios →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Link
                to="/signup"
                className="group block text-left bg-white border border-stone-200/70 rounded-2xl p-6 hover:-translate-y-1 hover:border-[#4A5D4E]/60 hover:shadow-[0_15px_35px_-15px_rgba(70,40,30,0.18)] transition-all duration-300 h-full"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{s.emoji}</span>
                  <span className="font-mono-tag text-[10px] uppercase tracking-wider text-[#4A5D4E] bg-[#E8EBE9] px-2 py-1 rounded">{s.level}</span>
                </div>
                <h3 className="font-display text-xl font-medium mb-2 group-hover:text-[#C85A47] transition-colors">{s.title}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{s.description}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-[#F0EFEA] py-24 mt-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <h2 className="font-display text-4xl md:text-5xl tracking-tight font-medium text-center mb-16">
            Three steps to fluency.
          </h2>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { n: '01', t: 'Pick a scenario', d: 'Free chat, interview, café — choose what you want to practice today.' },
              { n: '02', t: 'Talk with Maya', d: 'Speak naturally. Maya listens, replies aloud, and stays in character.' },
              { n: '03', t: 'See your corrections', d: 'After every reply, gentle inline corrections appear with simple tips.' },
            ].map((step) => (
              <div key={step.n} className="">
                <div className="font-mono-tag text-sm text-[#C85A47] mb-4 tracking-widest">{step.n}</div>
                <h3 className="font-display text-2xl font-medium mb-3">{step.t}</h3>
                <p className="text-stone-600 leading-relaxed">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24">
        <h2 className="font-display text-4xl md:text-5xl tracking-tight font-medium text-center mb-16">
          Loved by learners everywhere.
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-white border border-stone-200/70 rounded-3xl p-8">
              <p className="text-base leading-relaxed text-stone-800 mb-6">{t.text}</p>
              <div className="flex items-center gap-3">
                <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-stone-500">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING / CTA */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 lg:px-10 py-24">
        <div className="relative bg-stone-900 rounded-[2rem] p-12 md:p-20 overflow-hidden">
          <div className="float-shape" style={{ background: '#C85A47', width: 320, height: 320, top: -100, right: -100, opacity: 0.4 }} />
          <div className="relative">
            <h2 className="font-display text-4xl md:text-6xl tracking-tighter font-medium text-white leading-[1.0]">
              Start free.<br />
              <span className="text-[#FBC5B0] italic font-normal">Speak today.</span>
            </h2>
            <p className="mt-6 text-stone-300 max-w-md text-lg leading-relaxed">
              Sign up in 30 seconds. No credit card. Talk to Maya as long as you want.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to="/signup">
                <Button size="lg" className="rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white px-8 h-14">
                  Create my account <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="rounded-full border-stone-600 bg-transparent text-white hover:bg-white hover:text-stone-900 px-8 h-14">
                  I already have one
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
