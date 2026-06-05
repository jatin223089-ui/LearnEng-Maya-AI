import { Link } from 'react-router-dom';
import { Mail, MessageCircle, ArrowLeft } from 'lucide-react';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';

const contacts = [
  {
    icon: Mail,
    label: 'Email',
    value: 'hello@englearn.ai',
    href: 'mailto:hello@englearn.ai',
    note: 'General questions, feedback, and support',
  },
  {
    icon: MessageCircle,
    label: 'Partnerships',
    value: 'partners@englearn.ai',
    href: 'mailto:partners@englearn.ai',
    note: 'Schools, teams, and collaboration inquiries',
  },
];

export default function Contact() {
  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900">
      <Header />
      <main className="max-w-3xl mx-auto px-6 lg:px-10 py-12 lg:py-16">
        <Link
          to="/"
          className="text-sm text-stone-500 hover:text-stone-900 flex items-center gap-2 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-2">Contact us</p>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter font-medium">
          We&apos;d love to hear from you.
        </h1>
        <p className="mt-4 text-stone-600 leading-relaxed">
          Questions, feedback, or partnership ideas — reach out anytime and we&apos;ll get back to you as soon as we can.
        </p>

        <div className="mt-10 space-y-4">
          {contacts.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="block bg-white border border-stone-200/70 rounded-2xl p-6 hover:border-[#4A5D4E]/60 hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-[#FBEAE7] flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-[#C85A47]" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500 font-medium mb-1">{item.label}</p>
                  <p className="font-medium text-stone-900">{item.value}</p>
                  <p className="text-sm text-stone-600 mt-1">{item.note}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
