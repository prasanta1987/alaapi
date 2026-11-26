import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { Navbar } from './components/Navbar';
import { LobbyPage } from './pages/LobbyPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditRolePage } from './pages/EditRolePage';
import { OrgChartPage } from './pages/OrgChartPage';
import { CallStudioPage } from './pages/CallStudioPage';
import { PitchMonitorPage } from './pages/PitchMonitorPage';
import { SwaralipiPage } from './pages/SwaralipiPage';
import { IncomingCallModal } from './components/IncomingCallModal';
import { OutgoingCallModal } from './components/OutgoingCallModal';
import { ProfileModal } from './components/ProfileModal';
import { DeviceSetupModal } from './components/DeviceSetupModal';
import { unlockAudioContext } from './services/ringtone';

export function AppContent() {
  const { currentUser } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [deviceSetupOpen, setDeviceSetupOpen] = useState(false);
  const [deviceSetupTab, setDeviceSetupTab] = useState(null);
  const location = useLocation();
  const mainContentRef = useRef(null);

  // Automatically scroll to the top of the viewport and main scroll container on every route transition
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [location.pathname]);

  // Hide the Navbar when inside an active WebRTC call room
  const isInCall = location.pathname.startsWith('/room/');

  const handleOpenSettings = (tab = null) => {
    setDeviceSetupTab(tab);
    setDeviceSetupOpen(true);
  };

  const handleOpenProfile = () => {
    setProfileOpen(true);
  };

  // Support ?settings=open query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('settings') === 'open') {
      setDeviceSetupOpen(true);
    }
  }, [location.search]);

  // Warm up audio context on page visit and capture first user gesture to unlock audio playback for incoming calls
  useEffect(() => {
    try {
      unlockAudioContext();
    } catch (err) {
      console.warn("Audio unlock initialization skipped:", err);
    }

    const handleFirstInteraction = () => {
      unlockAudioContext();
      window.removeEventListener('pointerdown', handleFirstInteraction, true);
      window.removeEventListener('touchstart', handleFirstInteraction, true);
      window.removeEventListener('click', handleFirstInteraction, true);
      window.removeEventListener('keydown', handleFirstInteraction, true);
    };

    window.addEventListener('pointerdown', handleFirstInteraction, true);
    window.addEventListener('touchstart', handleFirstInteraction, true);
    window.addEventListener('click', handleFirstInteraction, true);
    window.addEventListener('keydown', handleFirstInteraction, true);

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction, true);
      window.removeEventListener('touchstart', handleFirstInteraction, true);
      window.removeEventListener('click', handleFirstInteraction, true);
      window.removeEventListener('keydown', handleFirstInteraction, true);
    };
  }, []);

  const isTunerPage = location.pathname === '/tuner';
  const isOrgChartPage = location.pathname === '/orgchart';
  const isSwaralipiPage = location.pathname.startsWith('/swaralipi');
  const isFullCanvasPage = isTunerPage || isOrgChartPage;
  const hideNavbar = isInCall || isTunerPage || isSwaralipiPage;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-950 text-gray-100 overflow-hidden select-none">
      {!hideNavbar && (
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
        <main
          ref={mainContentRef}
          className={`flex-1 w-full ${isFullCanvasPage ? 'h-full overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}
        >
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

            <Route path="/tuner" element={<PitchMonitorPage />} />
            
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
            <Route path="/orgchart" element={<OrgChartPage />} />
            <Route path="/swaralipi/new" element={<SwaralipiPage mode="new" />} />
            <Route path="/swaralipi/:id" element={<SwaralipiPage />} />
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

