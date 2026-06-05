import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/button';
import { LANDING, LOGOUT } from '../constants/testIds';

const marketingLinks = [
  { href: '#features', label: 'Features' },
  { href: '#scenarios', label: 'Scenarios' },
  { href: '#how', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
];

const appLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/vocabulary', label: 'Vocabulary' },
  { to: '/conversations', label: 'History' },
  { to: '/settings', label: 'Settings' },
];

function linkClass(active) {
  return [
    'text-sm font-medium px-3.5 py-1.5 rounded-full transition-colors',
    active
      ? 'bg-white text-[#C85A47] shadow-sm border border-stone-200/70'
      : 'text-stone-600 hover:text-stone-900 hover:bg-white/60',
  ].join(' ');
}

export default function Header() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const onLanding = loc.pathname === '/';

  const isActive = (path) =>
    loc.pathname === path || (path !== '/dashboard' && loc.pathname.startsWith(`${path}/`))
    || (path === '/dashboard' && (loc.pathname === '/dashboard' || loc.pathname.startsWith('/chat/')));

  const initials = user?.name
    ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#F9F8F6]/70 border-b border-white/40">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between gap-4">
        <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2.5 group shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E58B6E] to-[#C85A47] shadow-md group-hover:scale-105 transition-transform flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={2} aria-hidden />
          </div>
          <span className="font-display text-xl font-medium tracking-tight hidden sm:inline">
            englearn<span className="text-[#C85A47]">.</span>ai
          </span>
        </Link>

        {user ? (
          <nav className="hidden md:flex items-center gap-1 bg-stone-200/40 rounded-full p-1">
            {appLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={linkClass(isActive(item.to))}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="hidden md:flex items-center gap-8 text-sm text-stone-600">
            {marketingLinks.map((item) => (
              <a
                key={item.href}
                href={onLanding ? item.href : `/${item.href}`}
                className="hover:text-stone-900 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {user ? (
            <>
              <nav className="flex md:hidden items-center gap-1">
                {appLinks.slice(0, 2).map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={linkClass(isActive(item.to))}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <Link
                to="/settings"
                className={`hidden sm:flex w-9 h-9 items-center justify-center rounded-full border transition-colors ${
                  loc.pathname === '/settings'
                    ? 'bg-white border-stone-200/70 shadow-sm text-[#C85A47]'
                    : 'border-transparent text-stone-500 hover:text-stone-900 hover:bg-white/70 hover:border-stone-200/70'
                }`}
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" />
              </Link>
              <Link
                to="/profile"
                className={`hidden sm:flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full border transition-colors ${
                  loc.pathname === '/profile'
                    ? 'bg-white border-stone-200/70 shadow-sm'
                    : 'border-transparent hover:bg-white/70 hover:border-stone-200/70'
                }`}
              >
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#E58B6E] to-[#C85A47] text-white text-[10px] font-semibold flex items-center justify-center">
                  {initials}
                </span>
                <span className="text-sm font-medium text-stone-800 max-w-[100px] truncate">
                  {user.name.split(' ')[0]}
                </span>
              </Link>
              <Link
                to="/profile"
                className="sm:hidden w-8 h-8 rounded-full bg-gradient-to-br from-[#E58B6E] to-[#C85A47] text-white text-[10px] font-semibold flex items-center justify-center"
                aria-label="Profile"
              >
                {initials}
              </Link>
              <Button
                data-testid={LOGOUT.button}
                onClick={() => { logout(); nav('/'); }}
                variant="ghost"
                size="icon"
                className="rounded-full text-stone-500 hover:text-stone-900 hover:bg-white/70 w-9 h-9"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link data-testid={LANDING.signinBtn} to="/login" className="text-sm font-medium hover:text-[#C85A47]">
                Sign in
              </Link>
              <Link to="/signup">
                <Button data-testid={LANDING.getStartedBtn} className="rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white px-5">
                  Get started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
