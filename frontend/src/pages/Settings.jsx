import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Sparkles, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import Header from '../components/Header';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const LEVELS = [
  { id: 'Auto', label: 'Auto', desc: 'Adapt to me as I improve (recommended)' },
  { id: 'Beginner', label: 'Beginner', desc: 'Short, simple sentences and easy vocab' },
  { id: 'Intermediate', label: 'Intermediate', desc: 'More vocabulary and richer phrases' },
  { id: 'Advanced', label: 'Advanced', desc: 'Nuanced, idiomatic, complex structures' },
];

export default function Settings() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState('Kore');
  const [preferred, setPreferred] = useState('Auto');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setVoice(user.maya_voice || 'Kore');
      setPreferred(user.preferred_level || 'Auto');
    }
  }, [user]);

  useEffect(() => {
    api.get('/settings/voices')
      .then((r) => setVoices(r.data || []))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/profile', { maya_voice: voice, preferred_level: preferred });
      await refresh();
      toast.success('Settings saved');
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
        <p className="text-xs uppercase tracking-[0.22em] text-[#4A5D4E] font-medium mb-3">Settings</p>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter font-medium">
          Personalise<br /><span className="italic text-[#C85A47] font-normal">your Maya calls.</span>
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-12 bg-white border border-stone-200/70 rounded-2xl p-8 space-y-10"
        >
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Volume2 className="w-4 h-4 text-[#C85A47]" />
              <Label className="text-xs uppercase tracking-[0.18em] text-stone-500">Maya voice</Label>
            </div>
            <p className="text-sm text-stone-600 mb-4">
              Choose how Maya sounds on your next call. Your choice applies to all new sessions.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {voices.map((v) => (
                <button
                  key={v.id}
                  data-testid={`settings-voice-${v.id.toLowerCase()}`}
                  onClick={() => setVoice(v.id)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    voice === v.id
                      ? 'border-[#C85A47] bg-[#FBEAE7]'
                      : 'border-stone-200 hover:border-stone-400 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-display text-lg font-medium">{v.label}</p>
                    {voice === v.id && <Sparkles className="w-4 h-4 text-[#C85A47]" />}
                  </div>
                  <p className="text-sm text-stone-600">{v.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-[0.18em] text-stone-500 mb-3 block">Difficulty</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  data-testid={`settings-level-${l.id.toLowerCase()}`}
                  onClick={() => setPreferred(l.id)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    preferred === l.id
                      ? 'border-[#C85A47] bg-[#FBEAE7]'
                      : 'border-stone-200 hover:border-stone-400 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-display text-lg font-medium">{l.label}</p>
                    {preferred === l.id && <Sparkles className="w-4 h-4 text-[#C85A47]" />}
                  </div>
                  <p className="text-sm text-stone-600">{l.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-3">
              Current auto-detected level:{' '}
              <span className="font-medium text-stone-800">{user.level}</span>
            </p>
          </div>

          <Button
            data-testid="settings-save-button"
            onClick={save}
            disabled={saving}
            className="w-full h-12 rounded-full bg-[#C85A47] hover:bg-[#B34A38] text-white"
          >
            <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
