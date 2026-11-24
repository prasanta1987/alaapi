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
  getDocs,
  query,
  where
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
  Bell,
  BookOpen,
  Plus,
  FileText
} from 'lucide-react';
import { TAALS, SCALE_OPTIONS } from '../services/swaralipiAudio';
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
  const [swaralipiSheets, setSwaralipiSheets] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(true);

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
      requestScreenWakeLock().catch(() => { });
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
            deleteDoc(d.ref).catch(() => { });
          }
        });

        const roomsRef = collection(db, 'artifacts', appId, 'public', 'data', 'rooms');
        const roomsSnap = await getDocs(roomsRef);
        roomsSnap.forEach(d => {
          const data = d.data();
          if (data.createdAt && new Date(data.createdAt).getTime() < threeHoursAgo) {
            deleteDoc(d.ref).catch(() => { });
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

  // Fetch Swaralipi homework sheets in real time
  useEffect(() => {
    if (!currentUser) return;

    const sheetsRef = collection(db, 'artifacts', appId, 'public', 'data', 'swaralipi');
    const unsubscribe = onSnapshot(sheetsRef, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0));
        const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0));
        return timeB - timeA;
      });
      setSwaralipiSheets(list);
      setLoadingSheets(false);
    }, (err) => {
      console.warn("Error fetching Swaralipi sheets:", err);
      setLoadingSheets(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Delete Swaralipi sheet (Teacher / Admin)
  const handleDeleteSheet = async (sheet) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${sheet.title || 'Untitled'}"?`);
    if (!confirmed) return;
    try {
      const sheetRef = doc(db, 'artifacts', appId, 'public', 'data', 'swaralipi', sheet.id);
      await deleteDoc(sheetRef);
      setRoleUpdateMsg(`Swaralipi "${sheet.title || 'Untitled'}" deleted successfully.`);
      setTimeout(() => setRoleUpdateMsg(''), 3000);
    } catch (err) {
      console.error("Failed to delete sheet:", err);
      alert("Failed to delete sheet: " + err.message);
    }
  };

  // Handle changing user role (Admin only)
  const handleRoleChange = async (targetUid, newRole) => {
    const targetUser = allUsers.find(u => u.id === targetUid);
    const roleRanks = { admin: 3, teacher: 2, student: 1 };
    const currentRole = targetUser?.role || 'student';

    // Demotion check: Admin -> Teacher/Student, or Teacher -> Student
    if (targetUser && roleRanks[newRole] < roleRanks[currentRole]) {
      const assignedStudents = allUsers.filter(u => u.teacherId === targetUid);
      const studentCount = assignedStudents.length;

      let confirmMessage = `Are you sure you want to demote "${targetUser.displayName || targetUser.email || 'this user'}" from ${currentRole.toUpperCase()} to ${newRole.toUpperCase()}?`;
      if (newRole === 'student' && studentCount > 0) {
        confirmMessage += `\n\n⚠️ WARNING: ${studentCount} student(s) currently assigned to this user will be unassigned, and their teacher assignment records will be deleted.`;
      }

      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;

      if (newRole === 'student' && (currentRole === 'teacher' || currentRole === 'admin')) {
        try {
          const studentsQuery = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'users'),
            where('teacherId', '==', targetUid)
          );
          const studentsSnap = await getDocs(studentsQuery);
          await Promise.all(studentsSnap.docs.map(sDoc => updateDoc(sDoc.ref, {
            teacherId: '',
            teacherName: '',
            teacherAssignedAt: ''
          })));
        } catch (e) {
          console.warn("Could not unassign students from demoted teacher:", e);
        }
      }
    }

    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUid);
      const updatePayload = { role: newRole };
      if (newRole !== 'student') {
        updatePayload.teacherId = '';
        updatePayload.teacherName = '';
        updatePayload.teacherAssignedAt = '';
      }
      await updateDoc(userRef, updatePayload);
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

  // Handle student-to-teacher assignment (Admin can assign directly from dashboard cards)
  const handleAssignTeacher = async (studentUser, newTeacherId) => {
    try {
      const selectedTeacher = allUsers.find(u => u.id === newTeacherId && u.role === 'teacher');
      if (newTeacherId && !selectedTeacher) {
        setCallNotice('Only users with the Teacher role can be assigned as instructors.');
        return;
      }
      const teacherName = selectedTeacher ? (selectedTeacher.displayName || selectedTeacher.email || 'Teacher') : '';
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', studentUser.id);
      await updateDoc(userRef, {
        teacherId: newTeacherId || '',
        teacherName: teacherName || '',
        teacherAssignedAt: new Date().toISOString()
      });
      setRoleUpdateMsg(newTeacherId
        ? `Assigned student "${studentUser.displayName || 'Student'}" to teacher ${teacherName}`
        : `Removed teacher assignment from "${studentUser.displayName || 'Student'}"`);
      setTimeout(() => setRoleUpdateMsg(''), 4000);
    } catch (err) {
      console.error("Failed to assign teacher:", err);
      setCallNotice(`Failed to assign teacher: ${err.message}`);
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

  // Available instructors (only users with 'teacher' role can be assigned)
  const availableTeachers = allUsers.filter(u => u.role === 'teacher');

  // Admins list for teachers and users to contact academy administration
  const adminsList = allUsers.filter(u => u.role === 'admin' && u.id !== currentUser?.uid);

  // For student view: resolve their assigned teacher (only if assigned to an active teacher)
  const currentStudentDoc = allUsers.find(u => u.id === currentUser?.uid);
  const assignedTeacherId = userProfile?.teacherId || currentStudentDoc?.teacherId;
  const assignedTeacher = assignedTeacherId
    ? allUsers.find(u => u.id === assignedTeacherId && u.role === 'teacher')
    : null;

  // Filter students: Teachers only see their assigned students, Admins see all students
  const studentsList = allUsers.filter(u => {
    if (u.role !== 'student') return false;
    // Non-admin teacher can ONLY see their assigned students
    if (!isAdmin && role === 'teacher' && u.teacherId !== currentUser?.uid) {
      return false;
    }
    return (
      (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.instrument || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phone || '').includes(searchTerm)
    );
  }).sort((a, b) => {
    const aOnline = isUserOnline(a);
    const bOnline = isUserOnline(b);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return (a.displayName || '').localeCompare(b.displayName || '');
  });

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

  // Filter Swaralipi sheets based on role & assignment
  const visibleSheets = swaralipiSheets.filter(sheet => {
    if (isAdmin) return true;
    if (role === 'teacher') {
      return sheet.teacherId === currentUser?.uid;
    }
    // Student view: match studentId or assigned teacher or unassigned public sheet
    if (sheet.studentId && sheet.studentId === currentUser?.uid) return true;
    if (assignedTeacherId && sheet.teacherId === assignedTeacherId) return true;
    if (!sheet.studentId) return true;
    return false;
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
          <Link
            to="/tuner"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-900/50 hover:bg-purple-900/80 text-purple-200 text-xs font-semibold border border-purple-500/40 transition-all shadow-sm active:scale-95"
            title="Open Indian Classical Pitch Monitor & Swara Tuner"
          >
            <Music className="w-3.5 h-3.5 text-purple-400" />
            Swara Tuner
          </Link>
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition-colors shadow-sm"
          >
            <Edit className="w-3.5 h-3.5 text-purple-400" />
            Edit Profile Info
          </button>
        </div>
      </div>

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

                    {/* Admin Quick Teacher Assignment for Students */}
                    {user.role === 'student' && (
                      <div className="mb-3 p-2 bg-gray-900/70 border border-gray-700/50 rounded-xl flex items-center justify-between gap-2 text-xs">
                        <span className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0 font-medium">
                          <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
                          Teacher:
                        </span>
                        <select
                          value={user.teacherId || ''}
                          onChange={(e) => handleAssignTeacher(user, e.target.value)}
                          className="bg-gray-950 border border-gray-700 hover:border-purple-500 text-gray-200 text-xs font-medium rounded-lg px-2 py-1 outline-none max-w-[170px] truncate cursor-pointer"
                          title="Assign Teacher"
                        >
                          <option value="">-- Unassigned --</option>
                          {availableTeachers.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.displayName || t.email || 'Teacher'}
                            </option>
                          ))}
                        </select>
                      </div>
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
                My Assigned Students
              </h3>
              <p className="text-xs text-gray-400">
                Direct 1-click calling to your assigned students.
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
              <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-300 text-sm font-medium">No students currently assigned to your roster.</p>
              <p className="text-gray-500 text-xs mt-1">
                Once an administrator assigns students to your account, they will appear here with live online status for 1-click calling.
              </p>
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

                        {/* {student.email && (
                          <p className="text-xs text-gray-400 truncate font-mono">{student.email}</p>
                        )}
                        {student.phone && !student.email && (
                          <p className="text-xs text-gray-400 truncate">{student.phone}</p>
                        )} */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {/* <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800/40">
                            <CheckCircle className="w-3 h-3 text-emerald-400" />
                            Assigned Student
                          </span> */}
                          {student.instrument && (
                            <span className="text-[10px] font-semibold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                              {student.instrument}
                            </span>
                          )}
                        </div>
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

          {/* Academy Administration Calling for Teachers */}
          <div className="mt-8 pt-6 border-t border-gray-800/80">
            <div className="mb-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                Academy Administration & Faculty Support
              </h4>
              <p className="text-xs text-gray-400">
                Need technical assistance or session coordination? Call academy administrators directly:
              </p>
            </div>

            {adminsList.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No academy administrators currently listed.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {adminsList.map(admin => {
                  const online = isUserOnline(admin);
                  return (
                    <div
                      key={admin.id}
                      className="bg-gray-800/40 border border-purple-900/40 hover:border-purple-600/50 p-3.5 rounded-2xl flex flex-col justify-between transition-all shadow group"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="relative shrink-0">
                          <UserAvatar
                            photoURL={admin.photoURL}
                            name={admin.displayName || 'Administrator'}
                            size="md"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-500'
                              }`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <h5 className="text-xs font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                              {admin.displayName || 'Administrator'}
                            </h5>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border shrink-0 ${online
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                                : 'bg-gray-900 text-gray-400 border-gray-700'
                                }`}
                            >
                              <span
                                className={`w-1 h-1 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
                                  }`}
                              />
                              {online ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          {/* {admin.email && (
                            <p className="text-[11px] text-gray-400 truncate font-mono">{admin.email}</p>
                          )} */}
                          <span className="inline-block mt-1 text-[9px] font-semibold text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/50 uppercase">
                            Admin
                          </span>
                        </div>
                      </div>

                      {online ? (
                        <div className="grid grid-cols-2 gap-2 mt-auto">
                          <button
                            onClick={() => initiateDirectCall(admin, 'video')}
                            className="py-1.5 px-2 rounded-xl active:scale-95 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow transition-all"
                            title="Start Video Call with Administrator"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Video Call</span>
                          </button>
                          <button
                            onClick={() => initiateDirectCall(admin, 'audio')}
                            className="py-1.5 px-2 rounded-xl active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow transition-all"
                            title="Start Audio Call with Administrator"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Audio Call</span>
                          </button>
                        </div>
                      ) : (
                        <div className="mt-auto py-1.5 px-2 rounded-xl bg-gray-900/60 border border-gray-800 text-center text-xs text-gray-500">
                          Admin is offline
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

          {/* Student's Assigned Instructor Section */}
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-purple-400" />
                Your Assigned Teacher
              </h4>
              {assignedTeacher && (
                <span className="text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  Assigned
                </span>
              )}
            </div>

            {assignedTeacher ? (
              <div className="max-w-md">
                {(() => {
                  const online = isUserOnline(assignedTeacher);
                  return (
                    <div className="bg-emerald-950/20 border border-emerald-500/40 p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-md">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <UserAvatar
                            photoURL={assignedTeacher.photoURL}
                            name={assignedTeacher.displayName || assignedTeacher.email || 'Teacher'}
                            size="md"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-500'
                              }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                            {assignedTeacher.displayName || assignedTeacher.email || 'Teacher'}
                            <span className="text-[9px] font-bold text-emerald-300 bg-emerald-900/60 px-1.5 py-0.2 rounded border border-emerald-600/40">
                              Instructor
                            </span>
                          </p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {assignedTeacher.instrument || 'Vocal Instructor'}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${online
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                          : 'bg-gray-900 text-gray-400 border-gray-700'
                          }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`}
                        />
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-gray-950/50 border border-gray-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500 shrink-0">
                  <GraduationCap className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-300">No Teacher Assigned Yet</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    An academy administrator has not assigned an instructor to your account yet. When assigned, your teacher will appear here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SWARALIPI HOMEWORK & PRACTICE SECTION */}
      <section className="bg-gray-900/90 border border-gray-800 rounded-3xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 text-lg shadow-inner">
              🎵
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Swaralipi Homework & Practice
              </h3>
              <p className="text-xs text-gray-400">
                {isTeacher
                  ? 'Create, assign, and manage Bengali Akarmatrik Swaralipi homework sheets for students.'
                  : 'Practice your assigned Swaralipi exercises with the harmonium player and print clean sheets.'}
              </p>
            </div>
          </div>

          {isTeacher && (
            <Link
              to="/swaralipi/new"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition-all active:scale-95 shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>New Swaralipi</span>
            </Link>
          )}
        </div>

        {loadingSheets ? (
          <p className="text-center py-6 text-gray-500 text-xs">Loading homework sheets...</p>
        ) : visibleSheets.length === 0 ? (
          <div className="text-center py-6 bg-gray-950/40 rounded-2xl border border-gray-800/60 p-5">
            <Music className="w-7 h-7 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-300 text-xs sm:text-sm font-medium">
              {isTeacher
                ? 'No Swaralipi homework sheets created yet.'
                : 'No homework sheets currently assigned to your account.'}
            </p>
            <p className="text-gray-500 text-xs mt-1 max-w-md mx-auto">
              {isTeacher
                ? 'Click "New Swaralipi" to compose Bengali Akarmatrik notations with harmonium audio and assign them to students.'
                : 'When your instructor creates an exercise or song notation, it will appear here for practice.'}
            </p>
            {isTeacher && (
              <Link
                to="/swaralipi/new"
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-bold transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Your First Swaralipi</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleSheets.map(sheet => {
              const taalObj = TAALS[sheet.taal] || TAALS.free;
              const scaleLabel = SCALE_OPTIONS.find(s => s.value === sheet.scaleOffset)?.label || 'Sa = B♭';

              return (
                <div
                  key={sheet.id}
                  className="bg-gray-800/50 border border-gray-700/70 hover:border-purple-500/50 p-3.5 rounded-2xl flex flex-col justify-between transition-all shadow-md group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-purple-300 transition-colors font-bengali line-clamp-1">
                        {sheet.title || 'স্বরলিপি'}
                      </h4>
                      {isTeacher && (
                        <button
                          onClick={() => handleDeleteSheet(sheet)}
                          title="Delete Homework"
                          className="p-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-500/30 transition-all shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                      <span className="text-[10px] font-semibold text-purple-300 bg-purple-950/70 border border-purple-800/50 px-2 py-0.5 rounded-md">
                        {taalObj.name}
                      </span>
                      <span className="text-[10px] font-semibold text-blue-300 bg-blue-950/70 border border-blue-800/50 px-2 py-0.5 rounded-md font-mono">
                        {scaleLabel}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-800/50 px-2 py-0.5 rounded-md font-mono">
                        {sheet.bpm || 90} BPM
                      </span>
                    </div>

                    <div className="text-[11px] text-gray-400 flex items-center justify-between gap-2 border-t border-gray-800/80 pt-2 mb-3">
                      {isTeacher ? (
                        <span className="truncate">
                          🎯 {sheet.studentName ? `Assigned: ${sheet.studentName}` : 'For All Students'}
                        </span>
                      ) : (
                        <span className="truncate">
                          👨‍🏫 {sheet.teacherName || 'Instructor'}
                        </span>
                      )}
                      <span className="text-gray-500 text-[10px] shrink-0">
                        {sheet.updatedAt?.toDate ? sheet.updatedAt.toDate().toLocaleDateString() : 'Recent'}
                      </span>
                    </div>
                  </div>

                  {isTeacher ? (
                    <div className="grid grid-cols-2 gap-2 mt-auto">
                      <Link
                        to={`/swaralipi/${sheet.id}`}
                        className="py-1.5 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/30 transition-all active:scale-95"
                        title="Open in Composer Mode (with Keyboard)"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Link>
                      <Link
                        to={`/swaralipi/${sheet.id}?view=practice`}
                        className="py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all active:scale-95"
                        title="Open in Clean Practice Mode (No Typing Dock)"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play / View</span>
                      </Link>
                    </div>
                  ) : (
                    <Link
                      to={`/swaralipi/${sheet.id}?view=practice`}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-900/30 transition-all active:scale-95 mt-auto"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Open & Practice</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
