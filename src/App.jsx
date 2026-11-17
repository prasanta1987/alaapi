import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { Navbar } from './components/Navbar';
import { LobbyPage } from './pages/LobbyPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditRolePage } from './pages/EditRolePage';
import { CallStudioPage } from './pages/CallStudioPage';
import { PitchMonitorPage } from './pages/PitchMonitorPage';
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

  // Ghost touch simulation on Android / mobile on page visit to warm up browser user gesture state & unlock audio for incoming calls
  useEffect(() => {
    const performGhostTouch = () => {
      try {
        unlockAudioContext();
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const target = document.body || document.documentElement;
          try {
            if (typeof Touch !== 'undefined' && typeof TouchEvent !== 'undefined') {
              const touch = new Touch({
                identifier: Date.now(),
                target,
                clientX: 20,
                clientY: 20,
                radiusX: 2.5,
                radiusY: 2.5,
                rotationAngle: 0,
                force: 0.5
              });
              target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch] }));
              target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
            }
          } catch (_) {}

          try {
            target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
            target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: 20, clientY: 20 }));
          } catch (_) {}
        }
      } catch (err) {
        console.warn("Ghost touch initialization skipped:", err);
      }
    };

    performGhostTouch();

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
  const hideNavbar = isInCall || isTunerPage;

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
        <main className={`flex-1 w-full ${isTunerPage ? 'h-full overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
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

