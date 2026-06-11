# EngLearn.ai — AI English Conversation Tutor

An AI-powered English learning platform where users practice speaking with Maya, an intelligent conversational tutor. Learn through immersive voice-first conversations, get real-time corrections, and track your progress with streak tracking and adaptive difficulty.

## Overview

**EngLearn.ai** combines cutting-edge AI with a beautiful, intuitive interface to make English learning conversational and engaging. Practice real-world scenarios like interviews, travel, casual conversations, and debates—all with instant feedback and AI-generated hints.

### Key Features

- 🎤 **Voice-First Learning** — Speak naturally with Maya, hear AI-generated replies with word-level caption sync
- 🎭 **Roleplay Scenarios** — Free talk, interviews, cafe chats, travel, debate, storytelling
- ✏️ **Real-Time Corrections** — Inline grammar fixes with explanations and learning tips
- 💡 **AI Hint System** — Get 3 difficulty-leveled suggestions before responding
- 📚 **Vocabulary Book** — Auto-aggregated corrections from all conversations
- 🔥 **Streak Tracking** — Daily login streak, minutes logged, words learned, and levels
- 🎨 **Beautiful UI** — Terracotta + sage aesthetic with responsive design and smooth animations
- 🔐 **Secure Auth** — JWT email/password authentication

## Tech Stack

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB (motor async driver)
- **Auth**: JWT + bcrypt
- **AI**: Google Gemini 3 Flash
- **Speech**: OpenAI Whisper-1 (STT) + tts-1 (TTS, voice: shimmer)
- **Infrastructure**: Emergent Universal Key for API access

### Frontend
- **Framework**: React 19 + React Router
- **Styling**: Tailwind CSS + shadcn/ui components
- **Animation**: Framer Motion + Canvas Confetti
- **HTTP**: Axios + React Query (TanStack)
- **Forms**: React Hook Form + Zod validation

## Getting Started

### Prerequisites

- Node.js 18+ (frontend)
- Python 3.9+ (backend)
- MongoDB 5+ (or MongoDB Atlas)
- Google AI Studio API key (Gemini access)
- Emergent Universal Key (STT/TTS access)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys and database URL

# Start server
uvicorn server:app --reload
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install

# Configure environment
cp .env.example .env

# Start development server
yarn start
```

## Project Structure

```
eng-learning-ai/
├── backend/
│   ├── server.py              # All API endpoints
│   ├── store.py               # MongoDB queries
│   ├── tutor_context.py       # Conversation state
│   ├── user_settings.py       # User preferences
│   ├── emergentintegrations/
│   │   └── llm/chat.py       # Gemini integration
│   ├── prompts/
│   │   └── maya.py           # System prompts
│   ├── migrations/            # Database schema
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── MayaCallPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── VocabularyPage.jsx
│   │   │   └── ProfilePage.jsx
│   │   ├── components/
│   │   │   ├── VoiceOrb.jsx
│   │   │   ├── MicGate.jsx
│   │   │   └── Onboarding.jsx
│   │   ├── lib/useLiveAudio.js
│   │   └── App.js
│   └── package.json
└── design_guidelines.json
```

## Environment Variables

### Backend (.env)
```
MONGODB_URL=mongodb+srv://...
JWT_SECRET=your-secret-key
GEMINI_API_KEY=your-gemini-key
EMERGENT_API_KEY=your-emergent-key
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:8000
REACT_APP_ENV=development
```

## Testing

### Backend Tests
```bash
cd backend
pytest
```

### Frontend Tests
```bash
cd frontend
yarn test
```

## API Endpoints

### Authentication
- `POST /auth/signup` — Create new account
- `POST /auth/login` — Login with email/password

### Chat
- `POST /chat` — Text chat with Maya
- `POST /call/:id/message` — Voice message in call

### User
- `GET /profile` — Get user settings
- `PATCH /profile` — Update settings
- `GET /stats` — Get progress stats

### Vocabulary
- `GET /vocabulary` — Get corrections
- `DELETE /vocabulary/:id` — Remove correction

## Test Credentials

```
Email: test@englearn.ai
Password: pass1234
```

## Design System

See `design_guidelines.json` for:
- Color tokens (terracotta + sage palette)
- Typography (Outfit + Fira Sans)
- Component variants
- Spacing & animations

## Core Features

### Voice-First Chat
Real-time conversation with Maya using OpenAI's Whisper for speech-to-text and tts-1 for text-to-speech.

### Adaptive Difficulty
Users can set difficulty (Auto/Beginner/Intermediate/Advanced) to customize Maya's responses and corrections.

### Vocabulary Book
Automatic collection of all grammar corrections with original text, correction, and learning tips.

### Streak Tracking
Track daily login streaks, total minutes practiced, words learned, and current level.

### Hint System
Get AI-generated reply suggestions at 3 difficulty levels before responding to Maya.

## What's Implemented (June 2026)

✅ Landing page with animated voice orb  
✅ JWT auth (signup/login)  
✅ Dashboard with stats and scenario cards  
✅ Text + voice chat with Maya  
✅ TTS replies with caption sync  
✅ Vocabulary book  
✅ Profile page with difficulty settings  
✅ Daily streak tracking  
✅ Onboarding modal  
✅ Mic permission gate  

## Roadmap

🔜 Gemini Live API (true WebSocket audio)  
🔜 Pronunciation scoring  
🔜 Shareable video snippets  
🔜 Premium tier with Stripe  
🔜 Multi-language support  

## Contributing

1. Create a feature branch (`git checkout -b feature/your-feature`)
2. Commit changes (`git commit -m 'Add your feature'`)
3. Push to branch (`git push origin feature/your-feature`)
4. Open a Pull Request

## License

MIT License — See LICENSE file for details

## Support

For issues, questions, or feedback, please open an issue on GitHub or contact the team.

---

Built with ❤️ for English learners worldwide.
