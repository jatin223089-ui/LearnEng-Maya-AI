import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { LOGIN } from '../constants/testIds';
import { toast } from 'sonner';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      nav('/dashboard');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex">
      <div className="hidden lg:flex flex-1 bg-stone-900 relative overflow-hidden items-center justify-center p-12">
        <div className="float-shape" style={{ background: '#C85A47', width: 380, height: 380, top: '20%', left: '15%', opacity: 0.45 }} />
        <div className="relative text-white max-w-md">
          <Link to="/" className="font-display text-2xl font-medium tracking-tight">englearn<span className="text-[#C85A47]">.</span>ai</Link>
          <h1 className="font-display text-5xl tracking-tighter font-medium leading-tight mt-16">
            Welcome back.<br /><span className="italic text-[#FBC5B0] font-normal">Maya missed you.</span>
          </h1>
          <p className="mt-6 text-stone-300 leading-relaxed">Pick up where you left off and keep your streak alive.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="lg:hidden font-display text-xl mb-8 inline-block">englearn<span className="text-[#C85A47]">.</span>ai</Link>
          <h2 className="font-display text-3xl tracking-tight font-medium mb-2">Sign in</h2>
          <p className="text-stone-500 text-sm mb-10">to continue your English journey.</p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-stone-500">Email</Label>
              <Input data-testid={LOGIN.emailInput} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 h-12 rounded-xl" placeholder="you@email.com" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-stone-500">Password</Label>
              <Input data-testid={LOGIN.passwordInput} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 h-12 rounded-xl" placeholder="••••••••" />
            </div>
            <Button data-testid={LOGIN.submitButton} type="submit" disabled={loading} className="w-full h-12 rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-8 text-sm text-stone-500">
            New here?{' '}
            <Link data-testid={LOGIN.registerLink} to="/signup" className="font-medium text-[#C85A47] hover:underline">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
