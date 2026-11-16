import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, isUserOnline } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import {
  db,
  appId,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDocs
} from '../services/firebase';
import {
  RINGTONE_OPTIONS,
  getSelectedRingtone,
  saveSelectedRingtone,
  previewRingtone,
  stopRingtone,
  unlockAudioContext
} from '../services/ringtone';
import {
  requestScreenWakeLock,
  releaseScreenWakeLock
} from '../services/media';
import {
  Users,
  GraduationCap,
  Music,
  Shield,
  ShieldCheck,
  Phone,
  Video,
  Trash2,
  Search,
  CheckCircle,
  AlertCircle,
  Edit,
  Radio,
  Clock,
  ArrowRight,
  Sliders,
  Sparkles,
  Play,
  Square,
  Bell
} from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

export function DashboardPage({ onOpenProfile, onOpenDeviceSetup, onOpenAudioSettings }) {
  const { currentUser, userProfile, isAdmin, loginWithGoogle } = useAuth();
  const { initiateDirectCall, callNotice, setCallNotice } = useCall();
  const handleOpenSettings = onOpenDeviceSetup || onOpenAudioSettings;

  const role = userProfile?.role || 'student';
  const isTeacher = role === 'teacher' || isAdmin;

  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [adminTab, setAdminTab] = useState('all'); // 'all', 'students', 'teachers'
  const [roleUpdateMsg, setRoleUpdateMsg] = useState('');
  const [selectedRingtone, setSelectedRingtone] = useState(getSelectedRingtone());
  const [isPlayingTestTone, setIsPlayingTestTone] = useState(false);

  // Periodic tick (every 10 seconds) to ensure real-time Online/Offline status updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // 1. One-time pointerdown/keydown listener to unlock Web Audio on mobile/desktop browsers
  useEffect(() => {
    const handleUnlock = () => {
      unlockAudioContext();
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
    window.addEventListener('pointerdown', handleUnlock);
    window.addEventListener('keydown', handleUnlock);
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }, []);

  // 2. Student Standby Wake Lock (prevents phone screen from sleeping while waiting for teacher call)
  useEffect(() => {
    if (currentUser && role === 'student') {
      requestScreenWakeLock().catch(() => {});
      return () => {
        releaseScreenWakeLock();
      };
    }
  }, [currentUser, role]);

  // 3. Silent one-time cleanup of calls and rooms older than 3 hours (Admin / Teacher only)
  useEffect(() => {
    if (!currentUser || !isTeacher) return;

    const cleanupStaleData = async () => {
      try {
        const threeHoursAgo = Date.now() - 3 * 3600 * 1000;

        const callsRef = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
        const callsSnap = await getDocs(callsRef);
        callsSnap.forEach(d => {
          const data = d.data();
          if (data.createdAt && new Date(data.createdAt).getTime() < threeHoursAgo) {
            deleteDoc(d.ref).catch(() => {});
          }
        });

        const roomsRef = collection(db, 'artifacts', appId, 'public', 'data', 'rooms');
        const roomsSnap = await getDocs(roomsRef);
        roomsSnap.forEach(d => {
          const data = d.data();
          if (data.createdAt && new Date(data.createdAt).getTime() < threeHoursAgo) {
            deleteDoc(d.ref).catch(() => {});
          }
        });
      } catch (e) {
        console.warn("Silent cleanup skipped:", e);
      }
    };

    cleanupStaleData();
  }, [currentUser, isTeacher]);

  // Fetch all registered users in real time for user management & directory
  useEffect(() => {
    if (!currentUser) return;

    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersList = [];
      snapshot.forEach(docSnap => {
        usersList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setAllUsers(usersList);
      setLoadingUsers(false);
    }, (err) => {
      console.warn("Error fetching users list:", err);
      setLoadingUsers(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Handle changing user role (Admin only)
  const handleRoleChange = async (targetUid, newRole) => {
    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid);
      await updateDoc(userRef, { role: newRole });
      setRoleUpdateMsg(`Role updated to ${newRole} successfully.`);
      setTimeout(() => setRoleUpdateMsg(''), 3000);
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  };

  // Handle deleting user (Admin only, cannot delete other admins)
  const handleDeleteUser = async (targetUser) => {
    if (!isAdmin) return;
    if (targetUser.role === 'admin' || targetUser.id === currentUser?.uid) {
      alert("Admin accounts cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${targetUser.displayName || targetUser.email || 'this user'}" (${targetUser.role || 'student'})?\n\nThis will remove their account profile from the platform.`
    );
    if (!confirmed) return;

    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUser.id);
      await deleteDoc(userRef);
      setRoleUpdateMsg(`User "${targetUser.displayName || targetUser.email}" was deleted successfully.`);
      setTimeout(() => setRoleUpdateMsg(''), 4000);
    } catch (err) {
      console.error("Failed to delete user:", err);
      alert("Failed to delete user: " + err.message);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Vocal Class Portal</h2>
          <p className="text-gray-400 text-xs sm:text-sm mb-6">
            Sign in with your Google account to access your student directory, direct 1-click calls, and role management.
          </p>
          <button
            onClick={loginWithGoogle}
            className="w-full py-3 px-6 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  // Filter students
  const studentsList = allUsers.filter(u =>
    u.role === 'student' &&
    ((u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.instrument || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phone || '').includes(searchTerm))
  );

  // Filter teachers (teachers strictly, excluding admins from regular teacher list)
  const teachersList = allUsers.filter(u =>
    u.role === 'teacher' &&
    ((u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.instrument || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phone || '').includes(searchTerm))
  );

  // Filter all other users for Admin direct-calling directory
  const adminTargetList = allUsers.filter(u => {
    if (u.id === currentUser.uid) return false;
    const matchesSearch =
      (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.instrument || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phone || '').includes(searchTerm);

    if (!matchesSearch) return false;

    if (adminTab === 'students') return u.role === 'student';
    if (adminTab === 'teachers') return u.role === 'teacher';
    return true; // 'all'
  });

  return (
    <div className="p-3 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
      {/* Toast Alert for Call Result */}
      {callNotice && (
        <div className="p-3.5 bg-yellow-950/80 border border-yellow-600 text-yellow-300 rounded-2xl text-xs sm:text-sm flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{callNotice}</span>
          </div>
          <button onClick={() => setCallNotice(null)} className="font-bold px-2 py-0.5 hover:text-white">✕</button>
        </div>
      )}

      {/* Role Update Notice */}
      {roleUpdateMsg && (
        <div className="p-3.5 bg-green-950/80 border border-green-600 text-green-300 rounded-2xl text-xs sm:text-sm flex items-center gap-2 shadow-lg">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{roleUpdateMsg}</span>
        </div>
      )}

      {/* User Welcome Card */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-5 sm:p-7 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <UserAvatar
            photoURL={currentUser.photoURL || userProfile?.photoURL}
            name={userProfile?.displayName || currentUser.displayName}
            size="xl"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {userProfile?.displayName || currentUser.displayName || 'Vocalist'}
              </h2>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${isAdmin
                ? 'bg-purple-900/60 text-purple-300 border-purple-500/50'
                : isTeacher
                  ? 'bg-emerald-900/60 text-emerald-300 border-emerald-500/50'
                  : 'bg-blue-900/60 text-blue-300 border-blue-500/50'
                }`}>
                {role}
              </span>
            </div>
            <p className="text-gray-400 text-xs mt-0.5">
              {/* {currentUser.email}  •  {userProfile?.instrument || 'Vocalist'} */}
              {userProfile?.instrument || 'Vocalist'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* <button
            onClick={handleOpenSettings}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 text-xs font-semibold border border-purple-600/40 transition-colors shadow-sm"
            title="Configure Acoustic Pre-processing"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-400" />
            Audio DSP Settings
          </button> */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition-colors shadow-sm"
          >
            <Edit className="w-3.5 h-3.5 text-purple-400" />
            Edit Profile Info
          </button>
        </div>
      </div>

      {/* Admin Gateway to /editroll */}
      {/* Only enable for ADMIN. Currently disabled (false) for testing. */}
      {(isAdmin && false) && (
        <div className="bg-gradient-to-r from-purple-950/70 via-indigo-950/50 to-gray-900 border border-purple-500/50 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                User Role Administration
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700/50">
                  /editroll
                </span>
              </h3>
              <p className="text-xs text-gray-300 mt-0.5">
                Manage roles (Admin, Teacher, Student) and permissions for all users in the academy.
              </p>
            </div>
          </div>
          <Link
            to="/editroll"
            className="py-2.5 px-5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-semibold text-xs whitespace-nowrap shadow-lg shadow-purple-900/40 transition-all flex items-center gap-2"
          >
            <Shield className="w-4 h-4" />
            Open Role Manager (/editroll)
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 1. ADMIN DIRECTORY: CAN CALL ANYONE (STUDENTS & TEACHERS) */}
      {isAdmin ? (
        <section className="bg-gray-900/90 border border-purple-900/50 rounded-3xl p-5 sm:p-7 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                Admin Calling Hub & Directory
              </h3>
              <p className="text-xs text-gray-400">
                Admins have universal calling privileges. Click "Call" to ring any student or faculty member instantly.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-800/80 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Directory Tabs */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
            <button
              onClick={() => setAdminTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${adminTab === 'all'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
            >
              All Users ({allUsers.filter(u => u.id !== currentUser.uid).length})
            </button>
            <button
              onClick={() => setAdminTab('students')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${adminTab === 'students'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
            >
              Students ({studentsList.length})
            </button>
            <button
              onClick={() => setAdminTab('teachers')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${adminTab === 'teachers'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
            >
              Teachers & Faculty ({teachersList.length})
            </button>
          </div>

          {loadingUsers ? (
            <p className="text-center py-8 text-gray-500 text-xs">Loading directory...</p>
          ) : adminTargetList.length === 0 ? (
            <div className="text-center py-8 bg-gray-950/40 rounded-2xl border border-gray-800/60">
              <p className="text-gray-400 text-sm font-medium">No users found matching your criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {adminTargetList.map(user => {
                const online = isUserOnline(user);
                return (
                  <div
                    key={user.id}
                    className="bg-gray-800/50 border border-gray-700/70 hover:border-purple-500/50 p-4 rounded-2xl flex flex-col justify-between transition-all shadow-md group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="relative shrink-0">
                        <UserAvatar
                          photoURL={user.photoURL}
                          name={user.displayName || 'User'}
                          size="md"
                        />
                        {/* Real-time Online Indicator Badge on Avatar */}
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-500'
                            }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-sm font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                            {user.displayName || 'User'}
                          </h4>
                          {/* Online / Offline Pill & Admin Delete Option */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${online
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                                : 'bg-gray-900 text-gray-400 border-gray-700'
                                }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
                                  }`}
                              />
                              {online ? 'Online' : 'Offline'}
                            </span>
                            {isAdmin && user.role !== 'admin' && user.id !== currentUser.uid && (
                              <button
                                onClick={() => handleDeleteUser(user)}
                                title={`Delete ${user.displayName || 'User'}`}
                                className="p-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-500/30 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* {user.email && (
                          <p className="text-xs text-gray-400 truncate font-mono">{user.email}</p>
                        )}
                        {user.phone && !user.email && (
                          <p className="text-xs text-gray-400 truncate">{user.phone}</p>
                        )} */}

                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${user.role === 'admin'
                            ? 'bg-purple-900/50 text-purple-300 border-purple-500/40'
                            : user.role === 'teacher'
                              ? 'bg-emerald-900/50 text-emerald-300 border-emerald-500/40'
                              : 'bg-blue-900/50 text-blue-300 border-blue-500/40'
                            }`}>
                            {user.role || 'student'}
                          </span>
                          {user.instrument && (
                            <span className="text-[10px] text-gray-400 truncate">
                              • {user.instrument}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {user.bio && (
                      <p className="text-xs text-gray-400 italic line-clamp-2 mb-3 bg-gray-900/60 p-2 rounded-lg">
                        "{user.bio}"
                      </p>
                    )}

                    {/* Admin Calling Buttons: Video & Audio call options, ONLY IF ONLINE */}
                    {online ? (
                      <div className="grid grid-cols-2 gap-2 mt-auto">
                        <button
                          onClick={() => initiateDirectCall(user, 'video')}
                          className="py-2 px-2.5 rounded-xl active:scale-95 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/30 transition-all"
                          title="Start Video Call"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Video Call</span>
                        </button>
                        <button
                          onClick={() => initiateDirectCall(user, 'audio')}
                          className="py-2 px-2.5 rounded-xl active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all"
                          title="Start Audio Call"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Audio Call</span>
                        </button>
                      </div>
                    ) : (
                      <div className="mt-auto py-2 px-3 rounded-xl bg-gray-900/60 border border-gray-800 text-center text-xs text-gray-500 font-medium">
                        User is currently offline
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : isTeacher ? (
        /* 2. REGULAR TEACHER VIEW: STUDENT DIRECTORY */
        <section className="bg-gray-900/90 border border-gray-800 rounded-3xl p-5 sm:p-7 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-400" />
                Student Directory & 1-Click Direct Calling
              </h3>
              <p className="text-xs text-gray-400">
                Click "Call" to ring a student directly on their active session without needing a Room ID.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-800/80 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {loadingUsers ? (
            <p className="text-center py-8 text-gray-500 text-xs">Loading students...</p>
          ) : studentsList.length === 0 ? (
            <div className="text-center py-8 bg-gray-950/40 rounded-2xl border border-gray-800/60">
              <p className="text-gray-400 text-sm font-medium">No students found.</p>
              <p className="text-gray-500 text-xs mt-1">Students will appear here once they sign in with Google.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {studentsList.map(student => {
                const online = isUserOnline(student);
                return (
                  <div
                    key={student.id}
                    className="bg-gray-800/50 border border-gray-700/70 hover:border-emerald-500/50 p-4 rounded-2xl flex flex-col justify-between transition-all shadow-md group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="relative shrink-0">
                        <UserAvatar
                          photoURL={student.photoURL}
                          name={student.displayName || 'Student'}
                          size="md"
                        />
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-500'
                            }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-sm font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                            {student.displayName || 'Student'}
                          </h4>
                          {/* Real-time Online Indicator */}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${online
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                              : 'bg-gray-900 text-gray-400 border-gray-700'
                              }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
                                }`}
                            />
                            {online ? 'Online' : 'Offline'}
                          </span>
                        </div>

                        {student.email && (
                          <p className="text-xs text-gray-400 truncate font-mono">{student.email}</p>
                        )}
                        {student.phone && !student.email && (
                          <p className="text-xs text-gray-400 truncate">{student.phone}</p>
                        )}
                        {student.instrument && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                            {student.instrument}
                          </span>
                        )}
                      </div>
                    </div>

                    {student.bio && (
                      <p className="text-xs text-gray-400 italic line-clamp-2 mb-3 bg-gray-900/60 p-2 rounded-lg">
                        "{student.bio}"
                      </p>
                    )}

                    {/* Teacher Direct Call Buttons: Video & Audio call options, ONLY IF ONLINE */}
                    {online ? (
                      <div className="grid grid-cols-2 gap-2 mt-auto">
                        <button
                          onClick={() => initiateDirectCall(student, 'video')}
                          className="py-2 px-2.5 rounded-xl active:scale-95 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/30 transition-all"
                          title="Start Video Class"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Video Call</span>
                        </button>
                        <button
                          onClick={() => initiateDirectCall(student, 'audio')}
                          className="py-2 px-2.5 rounded-xl active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all"
                          title="Start Audio Class"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Audio Call</span>
                        </button>
                      </div>
                    ) : (
                      <div className="mt-auto py-2 px-3 rounded-xl bg-gray-900/60 border border-gray-800 text-center text-xs text-gray-500 font-medium">
                        Student is offline
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* 3. STUDENT VIEW: STANDBY MODE & TEACHERS */}
      {!isAdmin && role === 'student' && (
        <section className="bg-gray-900/90 border border-gray-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-4">
          <div className="bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-gray-900 border border-blue-500/30 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 shrink-0">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Student Live Standby Mode
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-green-950/60 text-green-400 border border-green-500/30">
                    Awake & Ready
                  </span>
                </h3>
                <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">
                  Keep this tab open. When your instructor initiates a class, your selected melody will ring and you can accept with 1 click.
                </p>
              </div>
            </div>

            {/* Ringtone Selection & Preview in Standby Mode */}
            <div className="w-full md:w-auto flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-gray-800/80 shrink-0">
              <div className="flex items-center gap-1.5 bg-gray-950/80 px-2.5 py-1.5 rounded-xl border border-gray-700 shadow-inner">
                <Bell className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <select
                  value={selectedRingtone}
                  onChange={(e) => {
                    const id = e.target.value;
                    saveSelectedRingtone(id);
                    setSelectedRingtone(id);
                    if (isPlayingTestTone) {
                      previewRingtone(id);
                    }
                  }}
                  className="bg-transparent text-white text-xs font-medium focus:outline-none cursor-pointer pr-1"
                >
                  {RINGTONE_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id} className="bg-gray-900 text-white">
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  setIsPlayingTestTone(true);
                  previewRingtone(selectedRingtone);
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-semibold flex items-center gap-1 transition-all shadow"
                title="Preview Ringtone"
              >
                <Play className="w-3 h-3 fill-current" />
                Test
              </button>
              <button
                onClick={() => {
                  setIsPlayingTestTone(false);
                  stopRingtone();
                }}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1 border border-gray-700 transition-all shadow"
                title="Stop Ringtone"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-purple-400" />
              Faculty & Teachers
            </h4>
            {teachersList.length === 0 ? (
              <p className="text-xs text-gray-500 italic py-1">No teachers currently registered.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {teachersList.map(teacher => {
                  const online = isUserOnline(teacher);
                  return (
                    <div key={teacher.id} className="bg-gray-800/40 border border-gray-700/60 p-3.5 rounded-2xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <UserAvatar
                            photoURL={teacher.photoURL}
                            name={teacher.displayName || 'Teacher'}
                            size="sm"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-500'
                              }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{teacher.displayName || 'Teacher'}</p>
                          <p className="text-[11px] text-gray-400 truncate">{teacher.instrument || 'Vocal Instructor'}</p>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${online
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                          : 'bg-gray-900 text-gray-400 border-gray-700'
                          }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
                            }`}
                        />
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. ADMIN VIEW: COMPLETE USER ROLE MANAGEMENT TABLE */}
      {/* Only enable for ADMIN. Currently disabled (false) for testing. */}
      {(isAdmin && false) && (
        <section className="bg-gray-900/90 border border-purple-900/50 rounded-3xl p-5 sm:p-7 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-400" />
                Admin: User Role Management
              </h3>
              <p className="text-xs text-gray-400">
                Manage roles and initiate calls directly from the administration table.
              </p>
            </div>
            <span className="text-xs font-mono text-purple-400 bg-purple-950/80 px-2.5 py-1 rounded-lg border border-purple-700/50">
              Total Users: {allUsers.length}
            </span>
          </div>

          {loadingUsers ? (
            <p className="text-center py-6 text-gray-500 text-xs">Loading user database...</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-950/90 border-b border-gray-800 text-gray-400 uppercase font-semibold">
                    <th className="p-3.5">User</th>
                    <th className="p-3.5">Status</th>
                    {/* <th className="p-3.5">Email</th> */}
                    <th className="p-3.5">Role</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 bg-gray-900/50">
                  {allUsers.map(user => {
                    const online = isUserOnline(user);
                    return (
                      <tr key={user.id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="p-3.5 flex items-center gap-2.5">
                          <UserAvatar
                            photoURL={user.photoURL}
                            name={user.displayName}
                            size="xs"
                          />
                          <span className="font-semibold text-gray-200">
                            {user.displayName || 'Vocalist'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${online
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                              : 'bg-gray-900 text-gray-400 border-gray-700'
                              }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
                                }`}
                            />
                            {online ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        {/* <td className="p-3.5 text-gray-400 font-mono text-[11px]">{user.email || 'N/A'}</td> */}
                        <td className="p-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${user.role === 'admin'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800'
                            : user.role === 'teacher'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                            }`}>
                            {user.role || 'student'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {user.id !== currentUser.uid && online && (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => initiateDirectCall(user, 'video')}
                                  className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-all"
                                  title={`Video Call ${user.displayName || 'User'}`}
                                >
                                  <Video className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => initiateDirectCall(user, 'audio')}
                                  className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
                                  title={`Audio Call ${user.displayName || 'User'}`}
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                            <select
                              value={user.role || 'student'}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
                            >
                              <option value="student">Student</option>
                              <option value="teacher">Teacher</option>
                              <option value="admin">Admin</option>
                            </select>
                            {isAdmin && user.role !== 'admin' && user.id !== currentUser.uid && (
                              <button
                                onClick={() => handleDeleteUser(user)}
                                title={`Delete ${user.displayName || 'User'}`}
                                className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-500/30 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
