import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { REGISTER } from '../constants/testIds';
import { toast } from 'sonner';

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords don't match");
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await signup(name, email, password);
      toast.success(`Welcome to EngLearn.ai, ${name.split(' ')[0]}!`);
      nav('/dashboard');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex">
      <div className="hidden lg:flex flex-1 bg-[#F0EFEA] relative overflow-hidden items-center justify-center p-12">
        <div className="float-shape" style={{ background: '#FBC5B0', width: 380, height: 380, top: '15%', left: '20%' }} />
        <div className="relative max-w-md">
          <Link to="/" className="font-display text-2xl font-medium tracking-tight">englearn<span className="text-[#C85A47]">.</span>ai</Link>
          <h1 className="font-display text-5xl tracking-tighter font-medium leading-tight mt-16">
            Start talking.<br /><span className="italic text-[#C85A47] font-normal">Grow daily.</span>
          </h1>
          <p className="mt-6 text-stone-700 leading-relaxed">No credit card. No commitment. Just you and Maya.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="lg:hidden font-display text-xl mb-8 inline-block">englearn<span className="text-[#C85A47]">.</span>ai</Link>
          <h2 className="font-display text-3xl tracking-tight font-medium mb-2">Create account</h2>
          <p className="text-stone-500 text-sm mb-10">30 seconds. That's all it takes.</p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-stone-500">Name</Label>
              <Input data-testid={REGISTER.nameInput} required value={name} onChange={(e) => setName(e.target.value)} className="mt-2 h-12 rounded-xl" placeholder="Your name" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-stone-500">Email</Label>
              <Input data-testid={REGISTER.emailInput} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 h-12 rounded-xl" placeholder="you@email.com" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-stone-500">Password</Label>
              <Input data-testid={REGISTER.passwordInput} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 h-12 rounded-xl" placeholder="Min 6 characters" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-stone-500">Confirm</Label>
              <Input data-testid={REGISTER.passwordConfirmInput} type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 h-12 rounded-xl" placeholder="Repeat password" />
            </div>
            <Button data-testid={REGISTER.submitButton} type="submit" disabled={loading} className="w-full h-12 rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white">
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-8 text-sm text-stone-500">
            Have an account?{' '}
            <Link data-testid={REGISTER.loginLink} to="/login" className="font-medium text-[#C85A47] hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
