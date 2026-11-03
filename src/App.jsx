import React, { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { Navbar } from './components/Navbar';
import { LobbyPage } from './pages/LobbyPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditRolePage } from './pages/EditRolePage';
import { CallStudioPage } from './pages/CallStudioPage';
import { IncomingCallModal } from './components/IncomingCallModal';
import { OutgoingCallModal } from './components/OutgoingCallModal';
import { ProfileModal } from './components/ProfileModal';
import { AudioSettingsModal } from './components/AudioSettingsModal';

export function AppContent() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const location = useLocation();

  // Hide the Navbar when inside an active WebRTC call room
  const isInCall = location.pathname.startsWith('/room/');

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-950 text-gray-100 overflow-hidden select-none">
      {!isInCall && (
        <Navbar
          onOpenProfile={() => setProfileOpen(true)}
          onOpenAudioSettings={() => setAudioSettingsOpen(true)}
        />
      )}

      {isInCall ? (
        <div className="flex-1 w-full h-full overflow-hidden">
          <Routes>
            <Route path="/room/:roomId" element={<CallStudioPage />} />
          </Routes>
        </div>
      ) : (
        <main className="flex-1 w-full overflow-y-auto overflow-x-hidden">
          <Routes>
            <Route
              path="/"
              element={<LobbyPage onOpenAudioSettings={() => setAudioSettingsOpen(true)} />}
            />
            <Route
              path="/dashboard"
              element={
                <DashboardPage
                  onOpenProfile={() => setProfileOpen(true)}
                  onOpenAudioSettings={() => setAudioSettingsOpen(true)}
                />
              }
            />
            <Route path="/editroll" element={<EditRolePage />} />
            <Route path="/editroles" element={<EditRolePage />} />
            <Route
              path="*"
              element={<LobbyPage onOpenAudioSettings={() => setAudioSettingsOpen(true)} />}
            />
          </Routes>
        </main>
      )}

      {/* Global Call & Settings Overlays */}
      <IncomingCallModal />
      <OutgoingCallModal />
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
      <AudioSettingsModal isOpen={audioSettingsOpen} onClose={() => setAudioSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CallProvider>
        <AppContent />
      </CallProvider>
    </AuthProvider>
  );
}

