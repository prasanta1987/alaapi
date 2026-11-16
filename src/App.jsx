import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { Navbar } from './components/Navbar';
import { LobbyPage } from './pages/LobbyPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditRolePage } from './pages/EditRolePage';
import { CallStudioPage } from './pages/CallStudioPage';
import { IncomingCallModal } from './components/IncomingCallModal';
import { OutgoingCallModal } from './components/OutgoingCallModal';
import { ProfileModal } from './components/ProfileModal';
import { DeviceSetupModal } from './components/DeviceSetupModal';

export function AppContent() {
  const { currentUser } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [deviceSetupOpen, setDeviceSetupOpen] = useState(false);
  const [deviceSetupTab, setDeviceSetupTab] = useState(null);
  const location = useLocation();

  // Hide the Navbar when inside an active WebRTC call room
  const isInCall = location.pathname.startsWith('/room/');

  const handleOpenSettings = (tab = null) => {
    setDeviceSetupTab(tab);
    setDeviceSetupOpen(true);
  };

  const handleOpenProfile = () => {
    if (currentUser) {
      setDeviceSetupTab('profile');
      setDeviceSetupOpen(true);
    } else {
      setProfileOpen(true);
    }
  };

  // Support ?settings=open query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('settings') === 'open') {
      setDeviceSetupOpen(true);
    }
  }, [location.search]);

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-950 text-gray-100 overflow-hidden select-none">
      {!isInCall && (
        <Navbar
          onOpenProfile={handleOpenProfile}
          onOpenDeviceSetup={() => handleOpenSettings()}
          onOpenAudioSettings={() => handleOpenSettings()}
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
                  onOpenDeviceSetup={() => handleOpenSettings()}
                  onOpenAudioSettings={() => handleOpenSettings()}
                />
              }
            />
            <Route
              path="/dashboard"
              element={
                <DashboardPage
                  onOpenProfile={handleOpenProfile}
                  onOpenDeviceSetup={() => handleOpenSettings()}
                  onOpenAudioSettings={() => handleOpenSettings()}
                />
              }
            />
            <Route path="/editroll" element={<EditRolePage />} />
            <Route path="/editroles" element={<EditRolePage />} />
            <Route
              path="*"
              element={
                <LobbyPage
                  onOpenDeviceSetup={() => handleOpenSettings()}
                  onOpenAudioSettings={() => handleOpenSettings()}
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
      <DeviceSetupModal
        initialTab={deviceSetupTab}
        isOpen={deviceSetupOpen}
        onClose={() => {
          setDeviceSetupOpen(false);
          setDeviceSetupTab(null);
        }}
      />
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

