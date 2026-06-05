import { Link } from 'react-router-dom';

export default function SiteFooter() {
  return (
    <footer className="border-t border-stone-200/70 py-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 flex flex-wrap items-center justify-between gap-4 text-sm text-stone-500">
        <p>© 2026 EngLearn.ai — Talk your way to fluent English.</p>
        <nav className="flex items-center gap-6">
          <Link to="/about" className="hover:text-[#C85A47] transition-colors">About</Link>
          <Link to="/contact" className="hover:text-[#C85A47] transition-colors">Contact us</Link>
        </nav>
        <p>Built with <span className="text-[#C85A47]">♥</span> for learners everywhere.</p>
      </div>
    </footer>
  );
}
