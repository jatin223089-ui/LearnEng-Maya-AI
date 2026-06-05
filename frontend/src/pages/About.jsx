import { Link } from 'react-router-dom';
import { Sparkles, Mic2, BookOpen, BarChart3 } from 'lucide-react';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
import { Button } from '../components/ui/button';

const highlights = [
  { icon: Mic2, title: 'Real conversations', body: 'Practice spoken English with Maya — a patient AI tutor who listens and replies in natural voice.' },
  { icon: BookOpen, title: 'Gentle corrections', body: 'Get grammar fixes and tips after you speak, without interrupting the flow of conversation.' },
  { icon: BarChart3, title: 'Track your progress', body: 'Streaks, vocabulary, and session history help you see improvement over time.' },
];

export default function About() {
  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900">
      <Header />
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-12 lg:py-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E8EBE9] text-[#4A5D4E] text-xs uppercase tracking-[0.2em] font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" /> About EngLearn.ai
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter font-medium leading-[1.05]">
            Talk your way to fluent English.
          </h1>
          <p className="mt-6 text-lg text-stone-600 leading-relaxed">
            EngLearn.ai pairs you with Maya, an AI tutor built for real spoken conversation — not flashcards.
            Practice interviews, daily chat, café orders, and more with gentle corrections that help you improve every day.
          </p>
          <p className="mt-4 text-sm text-stone-600 leading-relaxed">
            We believe the fastest path to fluency is speaking often, making mistakes safely, and getting feedback that actually sticks.
            Maya stays in character for roleplay scenarios and adapts to your level — from your first café order to your next job interview.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-14">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="bg-white border border-stone-200/70 rounded-2xl p-6"
            >
              <item.icon className="w-5 h-5 text-[#C85A47] mb-4" />
              <h2 className="font-display text-xl font-medium mb-2">{item.title}</h2>
              <p className="text-sm text-stone-600 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap gap-4">
          <Link to="/signup">
            <Button className="rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white px-6">
              Get started free
            </Button>
          </Link>
          <Link to="/contact">
            <Button variant="outline" className="rounded-full border-stone-300 px-6">
              Contact us
            </Button>
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
