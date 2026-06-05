import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import './App.css';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './lib/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Transcript from './pages/Transcript';
import Vocabulary from './pages/Vocabulary';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import MayaCallPage from './pages/MayaCallPage';
import Conversations from './pages/Conversations';
import About from './pages/About';
import Contact from './pages/Contact';

function LegacyCallRedirect() {
  const { sessionId } = useParams();
  return <Navigate to={`/chat/${sessionId}`} replace />;
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-center" richColors />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/chat/:sessionId" element={<ProtectedRoute><MayaCallPage /></ProtectedRoute>} />
            <Route path="/call/:sessionId" element={<LegacyCallRedirect />} />
            <Route path="/live/:sessionId" element={<LegacyCallRedirect />} />
            <Route path="/conversations" element={<ProtectedRoute><Conversations /></ProtectedRoute>} />
            <Route path="/transcript/:sessionId" element={<ProtectedRoute><Transcript /></ProtectedRoute>} />
            <Route path="/vocabulary" element={<ProtectedRoute><Vocabulary /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
