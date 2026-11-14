import React, { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { Navbar } from './components/Navbar';
import { LobbyPage } from './pages/LobbyPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditRolePage } from './pages/EditRolePage';
import { CallStudioPage } from './pages/CallStudioPage';
import { SettingsPage } from './pages/SettingsPage';
import { IncomingCallModal } from './components/IncomingCallModal';
import { OutgoingCallModal } from './components/OutgoingCallModal';
import { ProfileModal } from './components/ProfileModal';
import { DeviceSetupModal } from './components/DeviceSetupModal';

export function AppContent() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [deviceSetupOpen, setDeviceSetupOpen] = useState(false);
  const location = useLocation();

  // Hide the Navbar when inside an active WebRTC call room
  const isInCall = location.pathname.startsWith('/room/');

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-950 text-gray-100 overflow-hidden select-none">
      {!isInCall && (
        <Navbar
          onOpenProfile={() => setProfileOpen(true)}
          onOpenDeviceSetup={() => setDeviceSetupOpen(true)}
          onOpenAudioSettings={() => setDeviceSetupOpen(true)}
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
              element={
                <LobbyPage
                  onOpenDeviceSetup={() => setDeviceSetupOpen(true)}
                  onOpenAudioSettings={() => setDeviceSetupOpen(true)}
                />
              }
            />
            <Route
              path="/dashboard"
              element={
                <DashboardPage
                  onOpenProfile={() => setProfileOpen(true)}
                  onOpenDeviceSetup={() => setDeviceSetupOpen(true)}
                  onOpenAudioSettings={() => setDeviceSetupOpen(true)}
                />
              }
            />
            <Route path="/editroll" element={<EditRolePage />} />
            <Route path="/editroles" element={<EditRolePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <LobbyPage
                  onOpenDeviceSetup={() => setDeviceSetupOpen(true)}
                  onOpenAudioSettings={() => setDeviceSetupOpen(true)}
                />
              }
            />
          </Routes>
        </main>
      )}

      {/* Global Call & Settings Overlays */}
      <IncomingCallModal />
      <OutgoingCallModal />
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
      <DeviceSetupModal isOpen={deviceSetupOpen} onClose={() => setDeviceSetupOpen(false)} />
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

