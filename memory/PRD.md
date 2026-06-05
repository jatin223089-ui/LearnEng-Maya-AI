# EngLearn.ai — Product Requirements

## Original Problem Statement
Build an AI English-learning website inspired by mysivi.ai. AI tutor named "Maya". Users learn English by talking with her. Beautiful landing page with minimal 3D animations and unique UI/UX.

## Architecture
- **Backend**: FastAPI + MongoDB (motor) + JWT auth + emergentintegrations
- **Frontend**: React + Tailwind + shadcn/ui + framer-motion + canvas-confetti
- **LLM**: Gemini 3 Flash via Emergent Universal Key
- **STT**: OpenAI Whisper-1 via Emergent Universal Key
- **TTS**: OpenAI tts-1 (voice: shimmer) via Emergent Universal Key

## User Personas
- ESL learner who wants to practice speaking without judgement
- Wants real-time voice conversation (phone-call experience)
- Reviews corrections in a vocabulary book between calls
- Tracks progress via streak / minutes / words / level

## Core Requirements (Static)
- Voice-first chat with Maya (mic input, voice reply)
- Roleplay scenarios (free-talk, interview, cafe, travel, debate, story)
- Inline grammar corrections with original / corrected / tip
- AI-generated reply hints (3 difficulty variants)
- Vocabulary book aggregating all corrections
- Transcript history per session
- Adaptive difficulty (Auto or manual override)
- Daily streak tracking
- JWT email/password auth

## What's Been Implemented (June 2026)
### Phase 1 (MVP)
- Landing page with unique terracotta + sage aesthetic, Outfit + Fira Sans fonts, animated voice orb, asymmetric layout
- Signup/Login with JWT
- Dashboard with stats, scenario cards, recent sessions
- Chat with Maya (text + voice)
- TTS replies with live captions
- Hint button (3 AI-generated reply suggestions)

### Phase 2 (Voice Call)
- Full /call/:id voice-call experience with VAD silence detection
- Word-by-word caption highlighting synced to TTS audio
- /transcript/:id page with full message history
- /vocabulary page aggregating corrections

### Phase 3 (Polish)
- /profile page with name + 4-level difficulty (Auto/Beginner/Intermediate/Advanced)
- Daily streak with last_active_date tracking
- Onboarding 3-step modal (first-time users)
- Mic-permission gate screen
- Level-up confetti toast
- Voice orb with amplitude-reactive inner ring
- Loading skeletons on Dashboard + Vocabulary
- localStorage offline cache for Vocabulary book

## Prioritized Backlog (Remaining)
- **P1**: Gemini Live API integration (true WebSocket bidirectional audio, ~1s latency) — blocked on user's Google AI Studio key
- **P1**: Streak reset cron (currently relies on user activity)
- **P2**: Shareable Maya snippets (5-sec video clip with orb + best line)
- **P2**: Pronunciation scoring after each user utterance
- **P2**: Premium tier with Stripe (unlimited calls, extra voices)
- **P3**: Multi-language support (Spanish, Japanese learners)
- **P3**: Group / classroom mode

## Test Credentials
test@englearn.ai / pass1234

## Models / Files of Note
- /app/backend/server.py — all endpoints
- /app/frontend/src/pages/Call.jsx — voice-call mode
- /app/frontend/src/components/VoiceOrb.jsx — amplitude-reactive orb
- /app/design_guidelines.json — color tokens & typography
