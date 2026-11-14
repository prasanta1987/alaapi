import React, { useState, useEffect } from 'react';
import {
  HardwareDevicesTab,
  AudioDspSettingsTab,
  RingtonesTab,
  TestCallTab,
  ProfileSettingsTab
} from './settings_ui';
import { useAuth } from '../context/AuthContext';
import { stopRingtone } from '../services/ringtone';
import {
  X,
  Camera,
  Sliders,
  Bell,
  PhoneCall,
  User,
  Settings2
} from 'lucide-react';

export function DeviceSetupModal({ isOpen, onClose, initialTab = 'devices' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { currentUser } = useAuth();

  // Reset tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    } else {
      stopRingtone();
    }
  }, [isOpen, initialTab]);

  // Clean up any test ringtone if tab changes away from ringtones
  const handleTabChange = (tab) => {
    if (activeTab === 'ringtones') {
      stopRingtone();
    }
    setActiveTab(tab);
  };

  const handleClose = () => {
    stopRingtone();
    onClose();
  };

  if (!isOpen) return null;

  const tabs = [
    {
      id: 'devices',
      label: 'Hardware Devices',
      shortLabel: 'Devices',
      icon: Camera
    },
    {
      id: 'dsp',
      label: 'Audio & DSP Filters',
      shortLabel: 'Audio DSP',
      icon: Sliders
    },
    {
      id: 'ringtones',
      label: 'Melody Ringtones',
      shortLabel: 'Ringtones',
      icon: Bell
    },
    {
      id: 'testcall',
      label: 'Test Call (Echo)',
      shortLabel: 'Echo Test',
      icon: PhoneCall
    },
    ...(currentUser
      ? [
          {
            id: 'profile',
            label: 'Profile & Music',
            shortLabel: 'Profile',
            icon: User
          }
        ]
      : [])
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn select-none">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/40 text-purple-400 border border-purple-500/30 flex items-center justify-center shadow-sm">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Studio & Hardware Settings
              </h3>
              <p className="text-[11px] text-gray-400 hidden xs:block">
                Acoustic constraints, audio inputs, test call & synthesized ringtones
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Bar */}
        <div className="px-3 sm:px-5 pt-2 border-b border-gray-800 bg-gray-950/20 shrink-0 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-1.5 border-b-2 shrink-0 ${
                  isActive
                    ? 'text-purple-300 border-purple-500 bg-gray-800/60 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-gray-800/30'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-purple-400' : 'text-gray-500'}`} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {activeTab === 'devices' && <HardwareDevicesTab onSaved={handleClose} />}
          {activeTab === 'dsp' && <AudioDspSettingsTab onSaved={handleClose} />}
          {activeTab === 'ringtones' && <RingtonesTab onSaved={handleClose} />}
          {activeTab === 'testcall' && <TestCallTab />}
          {activeTab === 'profile' && <ProfileSettingsTab onSaved={handleClose} />}
        </div>
      </div>
    </div>
  );
}
