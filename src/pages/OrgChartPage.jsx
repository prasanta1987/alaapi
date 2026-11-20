import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, isUserOnline } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import {
  db,
  appId,
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  getDocs
} from '../services/firebase';
import {
  Network,
  Shield,
  GraduationCap,
  Music,
  Users,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Phone,
  Video,
  UserPlus,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  UserCheck,
  Sparkles,
  X,
  Layers,
  HelpCircle,
  UnfoldVertical,
  FoldVertical
} from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { DemotionModal, PromotionModal } from '../components/RoleChangeModals';

export function OrgChartPage() {
  const { currentUser, userProfile, isAdmin, loading: authLoading, loginWithGoogle } = useAuth();
  const { initiateDirectCall } = useCall();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [collapsedTeachers, setCollapsedTeachers] = useState({}); // { [teacherId]: boolean }
  const [feedback, setFeedback] = useState(null);
  const [updatingUid, setUpdatingUid] = useState(null);

  // Close search popout when clicking outside or pressing Escape
  useEffect(() => {
    if (!isSearchOpen) return;
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSearchOpen]);

  // Modals for Role Promotion & Demotion
  const [demotionTarget, setDemotionTarget] = useState(null);
  const [promotionTarget, setPromotionTarget] = useState(null);

  const navigate = useNavigate();

  const ROLE_RANKS = {
    admin: 3,
    teacher: 2,
    student: 1
  };

  // Heartbeat tick to refresh online indicators every 10 seconds
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all users in real-time
  useEffect(() => {
    if (!currentUser || !isAdmin) return;

    setLoadingUsers(true);
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setUsers(list);
      setLoadingUsers(false);
    }, (err) => {
      console.error("Error loading users for org chart:", err);
      setLoadingUsers(false);
    });

    return () => unsubscribe();
  }, [currentUser, isAdmin]);

  // Execute Role Update with cleanup
  const executeRoleUpdate = async (targetUser, newRole, previousRole) => {
    setUpdatingUid(targetUser.id);
    const roleBefore = previousRole || targetUser.role;

    try {
      if (newRole === 'student' && (roleBefore === 'teacher' || roleBefore === 'admin')) {
        try {
          const studentsQuery = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'users'),
            where('teacherId', '==', targetUser.id)
          );
          const studentsSnap = await getDocs(studentsQuery);
          const unassignTasks = studentsSnap.docs.map(sDoc =>
            updateDoc(sDoc.ref, {
              teacherId: '',
              teacherName: '',
              teacherAssignedAt: ''
            })
          );
          await Promise.all(unassignTasks);
        } catch (unassignErr) {
          console.warn("Could not unassign students from demoted teacher:", unassignErr);
        }
      }

      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUser.id);
      const updatePayload = {
        role: newRole,
        roleUpdatedAt: new Date().toISOString()
      };
      if (newRole !== 'student') {
        updatePayload.teacherId = '';
        updatePayload.teacherName = '';
        updatePayload.teacherAssignedAt = '';
      }
      await updateDoc(userRef, updatePayload);

      setFeedback({
        type: 'success',
        msg: `Role for ${targetUser.displayName || targetUser.email} updated to ${newRole.toUpperCase()}.`
      });

      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error("Failed to update role:", err);
      setFeedback({
        type: 'error',
        msg: `Failed to update role: ${err.message}`
      });
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleRoleChange = (targetUser, newRole) => {
    const currentRole = targetUser.role || 'student';
    if (currentRole === newRole) return;

    const currentRank = ROLE_RANKS[currentRole] || 1;
    const newRank = ROLE_RANKS[newRole] || 1;

    if (newRank < currentRank) {
      const assignedCount = users.filter(u => u.teacherId === targetUser.id).length;
      setDemotionTarget({
        user: targetUser,
        currentRole,
        newRole,
        isSelf: targetUser.id === currentUser?.uid,
        assignedStudentsCount: assignedCount
      });
      return;
    }

    if (newRank > currentRank) {
      setPromotionTarget({
        user: targetUser,
        currentRole,
        newRole
      });
      return;
    }

    executeRoleUpdate(targetUser, newRole, currentRole);
  };

  const confirmDemotion = async () => {
    if (!demotionTarget) return;
    const { user, currentRole, newRole } = demotionTarget;
    setDemotionTarget(null);
    await executeRoleUpdate(user, newRole, currentRole);
  };

  const confirmPromotion = async () => {
    if (!promotionTarget) return;
    const { user, currentRole, newRole } = promotionTarget;
    setPromotionTarget(null);
    await executeRoleUpdate(user, newRole, currentRole);
  };

  // Reassign student to teacher
  const handleAssignTeacher = async (studentUser, newTeacherId) => {
    setUpdatingUid(studentUser.id);
    try {
      const selectedTeacher = users.find(u => u.id === newTeacherId && u.role === 'teacher');
      if (newTeacherId && !selectedTeacher) {
        setFeedback({
          type: 'error',
          msg: 'Only users with the Teacher role can be assigned as instructors.'
        });
        return;
      }
      const teacherName = selectedTeacher ? (selectedTeacher.displayName || selectedTeacher.email || 'Teacher') : '';
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', studentUser.id);
      await updateDoc(userRef, {
        teacherId: newTeacherId || '',
        teacherName: teacherName || '',
        teacherAssignedAt: new Date().toISOString()
      });

      setFeedback({
        type: 'success',
        msg: newTeacherId
          ? `Assigned student "${studentUser.displayName || studentUser.email}" to teacher ${teacherName}.`
          : `Removed teacher assignment from "${studentUser.displayName || studentUser.email}".`
      });

      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error("Failed to assign teacher:", err);
      setFeedback({
        type: 'error',
        msg: `Failed to assign teacher: ${err.message}`
      });
    } finally {
      setUpdatingUid(null);
    }
  };

  // 1-Click Direct Call
  const handleDirectCall = (targetUser, callType = 'video') => {
    if (!targetUser || !currentUser) return;
    initiateDirectCall(targetUser, callType);
  };

  // Hierarchy Data Processing
  const admins = useMemo(() => users.filter(u => u.role === 'admin'), [users]);
  const teachers = useMemo(() => users.filter(u => u.role === 'teacher'), [users]);
  const teacherIdSet = useMemo(() => new Set(teachers.map(t => t.id)), [teachers]);

  const studentsByTeacher = useMemo(() => {
    const map = {};
    teachers.forEach(t => { map[t.id] = []; });
    users.forEach(u => {
      const isStudent = u.role === 'student' || (!u.role && u.role !== 'admin' && u.role !== 'teacher');
      if (isStudent && u.teacherId && teacherIdSet.has(u.teacherId)) {
        if (!map[u.teacherId]) map[u.teacherId] = [];
        map[u.teacherId].push(u);
      }
    });
    return map;
  }, [users, teachers, teacherIdSet]);

  const unassignedStudents = useMemo(() => {
    return users.filter(u => {
      const isStudent = u.role === 'student' || (!u.role && u.role !== 'admin' && u.role !== 'teacher');
      return isStudent && (!u.teacherId || !teacherIdSet.has(u.teacherId));
    });
  }, [users, teacherIdSet]);

  // Filtering by search term
  const matchesSearch = (u) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.displayName || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.instrument || '').toLowerCase().includes(term) ||
      (u.role || '').toLowerCase().includes(term)
    );
  };

  const toggleTeacher = (teacherId) => {
    setCollapsedTeachers(prev => ({
      ...prev,
      [teacherId]: !prev[teacherId]
    }));
  };

  const expandAll = () => setCollapsedTeachers({});
  const collapseAll = () => {
    const all = {};
    teachers.forEach(t => { all[t.id] = true; });
    setCollapsedTeachers(all);
  };

  // Loading or Unauthorized States
  if (authLoading || (loadingUsers && users.length === 0)) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-12 h-12 rounded-2xl bg-purple-900/40 border border-purple-500/40 flex items-center justify-center text-purple-400 animate-pulse mb-3">
          <Network className="w-6 h-6 animate-spin" />
        </div>
        <h2 className="text-base font-bold text-white mb-1">Loading Organization Tree...</h2>
        <p className="text-xs text-gray-400">Fetching real-time platform members and assignments.</p>
      </div>
    );
  }

  if (!currentUser || !isAdmin) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-14 h-14 rounded-2xl bg-red-950/60 border border-red-500/50 flex items-center justify-center text-red-400 mb-4 shadow-xl">
          <Shield className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Admin Access Required</h2>
        <p className="text-sm text-gray-400 max-w-md mb-6">
          The Organization Chart view is strictly restricted to platform administrators.
        </p>
        {!currentUser ? (
          <button
            onClick={loginWithGoogle}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg active:scale-95"
          >
            Sign in with Google
          </button>
        ) : (
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl text-sm transition-all"
          >
            Return to Lobby
          </button>
        )}
      </div>
    );
  }

  const assignedCount = users.length - admins.length - teachers.length - unassignedStudents.length;

  return (
    <div className="h-full w-full flex flex-col bg-gray-950 text-gray-100 select-none overflow-hidden relative">
      {/* Top Banner / Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur px-4 sm:px-8 py-3.5 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Link
                to="/editroll"
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                title="Go to Table View (Edit Roles)"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="w-7 h-7 rounded-xl bg-purple-900/50 border border-purple-500/50 flex items-center justify-center text-purple-300 shadow-md">
                <Network className="w-4 h-4" />
              </div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                Alaapi Organization Chart
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/40 uppercase tracking-widest">
                  Tree View
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-gray-400 ml-6">
              Live hierarchy mapping platform administrators, instructors, and their assigned students.
            </p>
          </div>

          {/* Quick Stats Badges & Switch View Link */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-xl bg-purple-950/60 border border-purple-600/40 text-purple-300 font-bold flex items-center gap-1.5 shadow-sm text-[11px]">
              <Shield className="w-3 h-3 text-purple-400" />
              <span>{admins.length} Admins</span>
            </span>

            <span className="px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 font-bold flex items-center gap-1.5 shadow-sm text-[11px]">
              <GraduationCap className="w-3 h-3 text-emerald-400" />
              <span>{teachers.length} Teachers</span>
            </span>

            <span className="px-2.5 py-1 rounded-xl bg-blue-950/60 border border-blue-600/40 text-blue-300 font-bold flex items-center gap-1.5 shadow-sm text-[11px]">
              <Music className="w-3 h-3 text-blue-400" />
              <span>{assignedCount} Assigned Students</span>
            </span>

            {unassignedStudents.length > 0 && (
              <span className="px-2.5 py-1 rounded-xl bg-amber-950/60 border border-amber-600/40 text-amber-300 font-bold flex items-center gap-1.5 shadow-sm animate-pulse text-[11px]">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>{unassignedStudents.length} Unassigned</span>
              </span>
            )}

            <Link
              to="/editroll"
              className="ml-auto md:ml-2 px-2.5 py-1 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white border border-gray-700 text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Switch to standard Table View"
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Table View</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Floating Feedback Notification */}
      {feedback && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className={`px-4 py-2.5 rounded-2xl shadow-2xl border text-xs font-semibold flex items-center gap-2 ${feedback.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
            : 'bg-red-950/90 border-red-500/50 text-red-200 shadow-red-950/50'
            }`}>
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
        </div>
      )}

      {/* Interactive Org Chart Canvas */}
      <main className="flex-1 w-full overflow-x-auto overflow-y-auto overscroll-contain p-4 sm:p-6 md:p-10 pl-16 sm:pl-20 pb-20 touch-pan-x touch-pan-y">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out'
          }}
          className="w-fit min-w-full mx-auto flex flex-col items-center pb-16"
        >
          {/* LEVEL 1: ADMINS TIER */}
          <section className="flex flex-col items-center mb-2">
            <div className="text-[10px] font-bold tracking-widest uppercase text-purple-400 mb-2 px-3 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/30 flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-purple-400" />
              <span>Executive Administration</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              {admins.map(admin => {
                const online = isUserOnline(admin);
                const isHighlight = matchesSearch(admin);
                return (
                  <div
                    key={admin.id}
                    className={`relative w-80 rounded-2xl bg-gradient-to-b from-gray-900 to-purple-950/40 border p-4 shadow-xl transition-all ${isHighlight
                      ? 'border-purple-500 shadow-purple-900/30 ring-1 ring-purple-500/50'
                      : 'border-purple-500/40 opacity-90'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <UserAvatar
                          photoURL={admin.photoURL}
                          name={admin.displayName || admin.email}
                          size="md"
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-500'
                            }`}
                          title={online ? 'Online' : 'Offline'}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="text-sm font-bold text-white truncate">
                            {admin.displayName || 'Administrator'}
                          </h3>
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-900/80 text-purple-300 border border-purple-500/40">
                            Admin
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate">{admin.email}</p>
                        <p className="text-[10px] text-purple-300/80 mt-0.5">
                          {admin.id === currentUser.uid ? '(Your Account)' : 'Platform Administrator'}
                        </p>
                      </div>
                    </div>

                    {/* Admin Actions: Voice/Video Call & Role Demotion */}
                    {admin.id !== currentUser.uid && (
                      <div className="mt-3 pt-2.5 border-t border-purple-500/20 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDirectCall(admin, 'audio')}
                            className="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-[11px] font-medium flex items-center gap-1 transition-colors"
                            title="Audio Call"
                          >
                            <Phone className="w-3 h-3 text-emerald-400" />
                            <span>Voice</span>
                          </button>
                          <button
                            onClick={() => handleDirectCall(admin, 'video')}
                            className="px-2 py-1 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                            title="Video Call"
                          >
                            <Video className="w-3 h-3" />
                            <span>Video</span>
                          </button>
                        </div>

                        {/* Demote Admin to Teacher or Student */}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] uppercase tracking-wider text-purple-300 font-semibold">Role:</span>
                          <select
                            value={admin.role || 'admin'}
                            onChange={(e) => handleRoleChange(admin, e.target.value)}
                            disabled={updatingUid === admin.id}
                            className="bg-gray-900 text-purple-300 font-semibold border border-purple-500/40 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:border-purple-400 cursor-pointer"
                            title="Change Role / Demote Admin"
                          >
                            <option value="admin">Admin</option>
                            <option value="teacher">Teacher</option>
                            <option value="student">Student</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vertical Trunk Line down from Admin */}
            <div className="w-0.5 h-10 bg-gradient-to-b from-purple-500 to-emerald-500 mt-2" />
          </section>

          {/* LEVEL 2 & 3: TEACHERS & ASSIGNED STUDENTS */}
          <section className="flex flex-col items-center w-full">
            {/* Horizontal Branch Bar linking across Teachers */}
            {teachers.length > 1 && (
              <div
                className="h-0.5 bg-emerald-500/50 mb-4"
                style={{
                  width: `${Math.max(0, (teachers.length - 1) * 352)}px`,
                  maxWidth: '95%'
                }}
              />
            )}

            {teachers.length === 0 ? (
              <div className="text-center p-8 bg-gray-900/60 rounded-3xl border border-dashed border-gray-800 max-w-md">
                <GraduationCap className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-gray-300">No Teachers Found</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Promote users to the "Teacher" role in Table View to build your instructor hierarchy.
                </p>
                <Link
                  to="/editroll"
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  Go to Edit Roles
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-center gap-8">
                {teachers.map(teacher => {
                  const online = isUserOnline(teacher);
                  const students = studentsByTeacher[teacher.id] || [];
                  const isCollapsed = collapsedTeachers[teacher.id];
                  const isHighlight = matchesSearch(teacher);

                  return (
                    <div key={teacher.id} className="flex flex-col items-center">
                      {/* Vertical connector stub to teacher */}
                      <div className="w-0.5 h-4 bg-emerald-500/50" />

                      {/* TEACHER NODE CARD */}
                      <div
                        className={`w-80 rounded-2xl bg-gradient-to-b from-gray-900 to-emerald-950/30 border p-4 shadow-xl transition-all ${isHighlight
                          ? 'border-emerald-500 shadow-emerald-900/30 ring-1 ring-emerald-500/50'
                          : 'border-emerald-500/40 hover:border-emerald-500/70'
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative shrink-0">
                            <UserAvatar
                              photoURL={teacher.photoURL}
                              name={teacher.displayName || teacher.email}
                              size="md"
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-500'
                                }`}
                              title={online ? 'Online' : 'Offline'}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="text-sm font-bold text-white truncate">
                                {teacher.displayName || 'Instructor'}
                              </h4>
                              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 shrink-0">
                                Teacher
                              </span>
                            </div>

                            <p className="text-[11px] text-gray-400 truncate">{teacher.email}</p>
                            <p className="text-[10px] text-emerald-300/90 font-medium mt-0.5 flex items-center gap-1">
                              <Music className="w-3 h-3 text-emerald-400" />
                              <span className="truncate">{teacher.instrument || 'Vocal Instructor'}</span>
                            </p>
                          </div>
                        </div>

                        {/* Teacher Footer: Student Count, Collapse Toggle & Direct Call */}
                        <div className="mt-3.5 pt-2.5 border-t border-emerald-500/20 flex items-center justify-between">
                          <button
                            onClick={() => toggleTeacher(teacher.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-600/40 text-[11px] font-bold transition-colors cursor-pointer"
                            title="Expand or collapse assigned students"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            <span>{students.length} Students</span>
                          </button>

                          <div className="flex items-center gap-1">
                            {teacher.id !== currentUser.uid && (
                              <>
                                <button
                                  onClick={() => handleDirectCall(teacher, 'audio')}
                                  className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                                  title="Voice Call Teacher"
                                >
                                  <Phone className="w-3 h-3 text-emerald-400" />
                                </button>
                                <button
                                  onClick={() => handleDirectCall(teacher, 'video')}
                                  className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                  title="Video Call Teacher"
                                >
                                  <Video className="w-3 h-3" />
                                </button>
                              </>
                            )}

                            {/* Role Menu */}
                            <select
                              value={teacher.role || 'teacher'}
                              onChange={(e) => handleRoleChange(teacher, e.target.value)}
                              disabled={updatingUid === teacher.id}
                              className="bg-gray-900 text-gray-300 border border-gray-700 rounded-lg px-1.5 py-1 text-[10px] font-semibold focus:outline-none focus:border-purple-500 cursor-pointer"
                              title="Change Role"
                            >
                              <option value="teacher">Teacher</option>
                              <option value="admin">Admin</option>
                              <option value="student">Student</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* STUDENTS SUBTREE UNDER TEACHER */}
                      {!isCollapsed && (
                        <div className="flex flex-col items-center w-full">
                          {/* Connector line down to students */}
                          <div className="w-0.5 h-6 bg-gradient-to-b from-emerald-500/50 to-blue-500/50" />

                          {students.length === 0 ? (
                            <div className="w-80 p-3 rounded-xl bg-gray-900/40 border border-dashed border-gray-800 text-center">
                              <p className="text-[11px] text-gray-500">No students assigned to this teacher yet.</p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2.5 w-80">
                              {students.map(student => {
                                const stOnline = isUserOnline(student);
                                const isStHighlight = matchesSearch(student);

                                return (
                                  <div
                                    key={student.id}
                                    className={`w-80 rounded-xl bg-gray-900/90 border p-3 shadow-md transition-all ${isStHighlight
                                      ? 'border-blue-500 ring-1 ring-blue-500/50 bg-blue-950/20'
                                      : 'border-blue-500/30 hover:border-blue-500/60'
                                      }`}
                                  >
                                    {/* Top: Avatar, Name, Email, and Voice/Video calls */}
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="relative shrink-0">
                                          <UserAvatar
                                            photoURL={student.photoURL}
                                            name={student.displayName || student.email}
                                            size="sm"
                                          />
                                          <span
                                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-gray-900 ${stOnline ? 'bg-emerald-400' : 'bg-gray-500'
                                              }`}
                                            title={stOnline ? 'Online' : 'Offline'}
                                          />
                                        </div>
                                        <div className="min-w-0">
                                          <h5 className="text-xs font-bold text-gray-100 truncate">
                                            {student.displayName || 'Student'}
                                          </h5>
                                          <p className="text-[10px] text-gray-400 truncate">{student.email}</p>
                                        </div>
                                      </div>

                                      {/* Voice & Video Call Buttons */}
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          onClick={() => handleDirectCall(student, 'audio')}
                                          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-white transition-colors cursor-pointer"
                                          title="Voice Call Student"
                                        >
                                          <Phone className="w-3 h-3 text-emerald-400" />
                                        </button>
                                        <button
                                          onClick={() => handleDirectCall(student, 'video')}
                                          className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
                                          title="Video Call Student"
                                        >
                                          <Video className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Bottom: Role Selector (Promote/Demote) & Teacher Reassignment */}
                                    <div className="mt-2.5 pt-2 border-t border-gray-800/80 flex items-center justify-between gap-2 text-[10px]">
                                      {/* Role Change */}
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold shrink-0">Role:</span>
                                        <select
                                          value={student.role || 'student'}
                                          onChange={(e) => handleRoleChange(student, e.target.value)}
                                          disabled={updatingUid === student.id}
                                          className="bg-gray-950 text-blue-300 font-semibold border border-blue-500/40 rounded-lg px-1.5 py-0.5 focus:outline-none focus:border-blue-400 cursor-pointer"
                                          title="Change Role (Promote / Demote)"
                                        >
                                          <option value="student">Student</option>
                                          <option value="teacher">Teacher</option>
                                          <option value="admin">Admin</option>
                                        </select>
                                      </div>

                                      {/* Teacher Assignment */}
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold shrink-0">Teacher:</span>
                                        <select
                                          value={student.teacherId || ''}
                                          onChange={(e) => handleAssignTeacher(student, e.target.value)}
                                          disabled={updatingUid === student.id}
                                          className="bg-gray-950 text-gray-300 border border-gray-700 rounded-lg px-1.5 py-0.5 focus:outline-none focus:border-blue-500 cursor-pointer max-w-[110px] truncate"
                                          title="Reassign Teacher"
                                        >
                                          <option value="">Unassigned</option>
                                          {teachers.map(t => (
                                            <option key={t.id} value={t.id}>
                                              {t.displayName || t.email}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* LEVEL 4: UNASSIGNED STUDENTS SHELF */}
          {unassignedStudents.length > 0 && (
            <section className="mt-14 w-full max-w-5xl rounded-3xl bg-gray-900/60 border border-amber-500/30 p-5 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Unassigned Students
                      <span className="px-2 py-0.2 rounded-full bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-black">
                        {unassignedStudents.length}
                      </span>
                    </h3>
                    <p className="text-[11px] text-gray-400">
                      These students are registered on the platform but have not yet been assigned to an instructor.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {unassignedStudents.map(student => {
                  const online = isUserOnline(student);
                  const isHighlight = matchesSearch(student);

                  return (
                    <div
                      key={student.id}
                      className={`rounded-2xl bg-gray-950/80 border p-3.5 shadow-md flex flex-col justify-between gap-3 transition-all ${isHighlight
                        ? 'border-amber-500 ring-1 ring-amber-500/50'
                        : 'border-gray-800 hover:border-gray-700'
                        }`}
                    >
                      {/* Top Row: Avatar, Name, Email, and Voice/Video Call buttons */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <UserAvatar
                              photoURL={student.photoURL}
                              name={student.displayName || student.email}
                              size="sm"
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-900 ${online ? 'bg-emerald-400' : 'bg-gray-500'
                                }`}
                              title={online ? 'Online' : 'Offline'}
                            />
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-xs font-bold text-white truncate">
                              {student.displayName || 'Student'}
                            </h5>
                            <p className="text-[10px] text-gray-400 truncate">{student.email}</p>
                            <span className="text-[9px] text-amber-400 font-semibold flex items-center gap-1 mt-0.5">
                              <HelpCircle className="w-2.5 h-2.5" />
                              <span>No teacher assigned</span>
                            </span>
                          </div>
                        </div>

                        {/* Call Buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleDirectCall(student, 'audio')}
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-white transition-colors cursor-pointer"
                            title="Voice Call Student"
                          >
                            <Phone className="w-3 h-3 text-emerald-400" />
                          </button>
                          <button
                            onClick={() => handleDirectCall(student, 'video')}
                            className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
                            title="Video Call Student"
                          >
                            <Video className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Bottom Row: Role & Assign Teacher */}
                      <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between gap-2 text-[10px]">
                        {/* Change Role (Promote) */}
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold shrink-0">Role:</span>
                          <select
                            value={student.role || 'student'}
                            onChange={(e) => handleRoleChange(student, e.target.value)}
                            disabled={updatingUid === student.id}
                            className="bg-gray-900 text-blue-300 font-semibold border border-blue-500/40 rounded-lg px-1.5 py-0.5 focus:outline-none focus:border-blue-400 cursor-pointer"
                            title="Change Role (Promote / Demote)"
                          >
                            <option value="student">Student</option>
                            <option value="teacher">Teacher</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>

                        {/* 1-Click Assign Teacher Select */}
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold shrink-0">Assign:</span>
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) handleAssignTeacher(student, e.target.value);
                            }}
                            disabled={updatingUid === student.id || teachers.length === 0}
                            className="bg-gray-900 hover:bg-gray-850 text-purple-300 font-bold border border-purple-500/40 rounded-lg px-2 py-0.5 focus:outline-none focus:border-purple-400 cursor-pointer shadow-sm max-w-[120px] truncate"
                          >
                            <option value="" disabled>
                              + Teacher
                            </option>
                            {teachers.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.displayName || t.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Left-Floating Vertical Canvas Toolbar */}
      <div className="fixed left-3 sm:left-4 top-1/2 -translate-y-1/2 z-40 bg-gray-900/95 backdrop-blur-md border border-gray-750 rounded-2xl p-1.5 shadow-2xl shadow-black/90 flex flex-col items-center gap-2 select-none animate-in fade-in slide-in-from-left-4 duration-300">
        {/* 1. Search Icon with Expandable Popout Input */}
        <div className="relative" ref={searchContainerRef}>
          <button
            onClick={() => setIsSearchOpen(prev => !prev)}
            className={`p-2 rounded-xl transition-all cursor-pointer relative ${
              isSearchOpen || searchTerm
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-gray-800/80 hover:bg-gray-750 text-gray-300 hover:text-white'
            }`}
            title={isSearchOpen ? 'Close Search' : 'Search users (Click to expand)'}
          >
            <Search className="w-4 h-4" />
            {searchTerm && !isSearchOpen && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-400 ring-2 ring-gray-900 animate-pulse" />
            )}
          </button>

          {/* Expandable text entry box to the right */}
          {isSearchOpen && (
            <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 flex items-center bg-gray-900/98 backdrop-blur-md border border-purple-500/50 rounded-2xl p-1.5 pl-3 pr-2 shadow-2xl shadow-black/95 w-56 sm:w-72 animate-in fade-in slide-in-from-left-2 duration-200">
              <Search className="w-3.5 h-3.5 text-purple-400 shrink-0 mr-2" />
              <input
                type="text"
                autoFocus
                placeholder="Search name, email, role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-xs text-white placeholder-gray-500 focus:outline-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="p-1 text-gray-400 hover:text-white shrink-0 mr-1 cursor-pointer"
                  title="Clear text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsSearchOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 shrink-0 cursor-pointer"
                title="Close search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="w-5 h-px bg-gray-800" />

        {/* 2. Expand All & Collapse All Float Icons */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={expandAll}
            className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-750 active:scale-95 text-gray-300 hover:text-white transition-all shadow-sm cursor-pointer"
            title="Expand All Teachers"
          >
            <UnfoldVertical className="w-4 h-4 text-emerald-400" />
          </button>
          <button
            onClick={collapseAll}
            className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-750 active:scale-95 text-gray-300 hover:text-white transition-all shadow-sm cursor-pointer"
            title="Collapse All Teachers"
          >
            <FoldVertical className="w-4 h-4 text-amber-400" />
          </button>
        </div>

        <div className="w-5 h-px bg-gray-800" />

        {/* 3. Vertical Zoom Controls */}
        <div className="flex flex-col items-center gap-1 bg-gray-950/80 border border-gray-800 rounded-xl p-1 shadow-inner">
          <button
            onClick={() => setZoom(z => Math.min(1.4, Number((z + 0.1).toFixed(1))))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-850 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <span className="text-[10px] font-mono font-bold text-gray-300 py-0.5 leading-none select-none text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={() => setZoom(z => Math.max(0.5, Number((z - 0.1).toFixed(1))))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-850 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            onClick={() => setZoom(1)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-850 transition-colors cursor-pointer mt-0.5 border-t border-gray-850"
            title="Reset Zoom (100%)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Shared Demotion & Promotion Confirmation Modals */}
      <DemotionModal
        target={demotionTarget}
        onConfirm={confirmDemotion}
        onCancel={() => setDemotionTarget(null)}
      />

      <PromotionModal
        target={promotionTarget}
        onConfirm={confirmPromotion}
        onCancel={() => setPromotionTarget(null)}
      />
    </div>
  );
}
