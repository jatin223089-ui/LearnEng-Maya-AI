import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import Header from '../components/Header';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const LEVELS = [
  { id: 'Auto', label: 'Auto', desc: 'Adapt to me as I improve (recommended)' },
  { id: 'Beginner', label: 'Beginner', desc: 'Short, simple sentences and easy vocab' },
  { id: 'Intermediate', label: 'Intermediate', desc: 'More vocabulary and richer phrases' },
  { id: 'Advanced', label: 'Advanced', desc: 'Nuanced, idiomatic, complex structures' },
];

export default function Profile() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [preferred, setPreferred] = useState('Auto');
  const [saving, setSaving] = useState(false);
  const [fluency, setFluency] = useState([]);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPreferred(user.preferred_level || 'Auto');
    }
  }, [user]);

  useEffect(() => {
    api.get('/fluency-stats')
      .then((r) => setFluency(r.data.sessions || []))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/profile', { name, preferred_level: preferred });
      await refresh();
      toast.success('Profile saved');
      nav('/dashboard');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <Header />
      <main className="max-w-3xl mx-auto px-6 lg:px-10 py-12">
        <Link to="/dashboard" className="text-sm text-stone-500 hover:text-stone-900 flex items-center gap-2 mb-8">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-3">Profile</p>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter font-medium">
          Tune Maya<br /><span className="italic text-[#C85A47] font-normal">to fit you.</span>
        </h1>
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 mt-4 text-sm text-[#C85A47] hover:text-[#B34A38] transition-colors"
        >
          Voice & difficulty settings →
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="mt-12 bg-white border border-stone-200/70 rounded-2xl p-8 space-y-8"
        >
          <div>
            <Label className="text-xs uppercase tracking-[0.18em] text-stone-500">Your name</Label>
            <Input
              data-testid="profile-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 h-12 rounded-xl"
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-[0.18em] text-stone-500 mb-3 block">Difficulty</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  data-testid={`profile-level-${l.id.toLowerCase()}`}
                  onClick={() => setPreferred(l.id)}
                  className={`text-left p-4 rounded-xl border transition-all ${preferred === l.id ? 'border-[#C85A47] bg-[#FBEAE7]' : 'border-stone-200 hover:border-stone-400 bg-white'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-display text-lg font-medium">{l.label}</p>
                    {preferred === l.id && <Sparkles className="w-4 h-4 text-[#C85A47]" />}
                  </div>
                  <p className="text-sm text-stone-600">{l.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-3">Current auto-detected level: <span className="font-medium text-stone-800">{user.level}</span> · {user.minutes_practiced} min practiced</p>
          </div>

          {fluency.length > 0 && (
            <div data-testid="fluency-stats">
              <Label className="text-xs uppercase tracking-[0.18em] text-stone-500 mb-3 block">Speaking progress</Label>
              <div className="space-y-2">
                {fluency.slice(0, 7).map((s) => (
                  <div key={s.session_id} className="flex items-center justify-between text-sm border border-stone-100 rounded-lg px-3 py-2">
                    <span className="text-stone-600">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Session'}
                    </span>
                    <span className="font-mono-tag text-stone-800">
                      {Math.round(s.avg_utterance_words || 0)} words/turn
                      {s.avg_pronunciation_score != null && (
                        <> · {Math.round(s.avg_pronunciation_score)}% fluency</>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            data-testid="profile-save-button"
            onClick={save}
            disabled={saving}
            className="w-full h-12 rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white"
          >
            <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
