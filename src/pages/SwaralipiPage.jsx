import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  db,
  appId,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from '../services/firebase';
import {
  SWARA_MAP,
  WESTERN_NAMES,
  IS_BLACK,
  SCALE_OPTIONS,
  TAALS,
  getRootSaMidi,
  midiToFreq,
  playPreviewTone,
  SwaralipiPlaybackEngine
} from '../services/swaralipiAudio';
import {
  ArrowLeft,
  Play,
  Square,
  Printer,
  Save,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Delete,
  Music,
  CheckCircle,
  AlertCircle,
  Eye,
  Edit3,
  Users,
  GraduationCap,
  Keyboard,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

function createEmptyRow(beats) {
  return Array.from({ length: beats }, () => ({
    swara: '',
    semi: null,
    oct: 0,
    lyric: '',
    meend: false
  }));
}

export function SwaralipiPage({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userProfile, isAdmin } = useAuth();

  const searchParams = new URLSearchParams(location.search);
  const isPracticeRequested = searchParams.get('view') === 'practice' || searchParams.get('mode') === 'practice';

  const isTeacher = userProfile?.role === 'teacher' || isAdmin;

  // Sheet State
  const [title, setTitle] = useState('');
  const [taal, setTaal] = useState('free');
  const [scaleOffset, setScaleOffset] = useState(10); // Sa = B♭ (Kali 5)
  const [bpm, setBpm] = useState(90);
  const [rows, setRows] = useState(() => {
    const beats = TAALS.free.beats;
    return [createEmptyRow(beats), createEmptyRow(beats)];
  });

  const [cursor, setCursor] = useState({ r: 0, c: 0 });
  const [currentOctave, setCurrentOctave] = useState(0); // -1, 0, 1
  const [keypadMode, setKeypadMode] = useState('kbd'); // 'kbd' | 'pad'
  const [showKeypad, setShowKeypad] = useState(() => !isPracticeRequested);
  const [pressedMidi, setPressedMidi] = useState(null);
  const [playingCell, setPlayingCell] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Firestore & Assignment State
  const [teacherId, setTeacherId] = useState(currentUser?.uid || '');
  const [teacherName, setTeacherName] = useState(userProfile?.displayName || currentUser?.displayName || '');
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [loadingDoc, setLoadingDoc] = useState(Boolean(id));
  const [savingDoc, setSavingDoc] = useState(false);
  const [statusNotice, setStatusNotice] = useState(null);

  // Student vs Teacher view toggle (Teacher can preview student mode)
  const [previewStudentView, setPreviewStudentView] = useState(() => Boolean(isPracticeRequested));

  // Determine if current user can edit
  const isAuthor = !teacherId || teacherId === currentUser?.uid || isAdmin;
  const canEdit = isTeacher && isAuthor && !previewStudentView;

  // Refs
  const playbackEngineRef = useRef(null);
  const sheetContainerRef = useRef(null);
  const kbdScrollerRef = useRef(null);
  const rowsContainerRef = useRef(null);

  // Instantiate playback engine once
  useEffect(() => {
    playbackEngineRef.current = new SwaralipiPlaybackEngine();
    return () => {
      if (playbackEngineRef.current) {
        playbackEngineRef.current.stop();
      }
    };
  }, []);

  // Fetch assigned students if current user is teacher/admin
  useEffect(() => {
    if (!currentUser || !isTeacher) return;
    const fetchStudents = async () => {
      try {
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
        let snap;
        if (isAdmin) {
          const q = query(usersRef, where('role', '==', 'student'));
          snap = await getDocs(q);
        } else {
          const q = query(usersRef, where('teacherId', '==', currentUser.uid));
          snap = await getDocs(q);
        }
        const sList = [];
        snap.forEach(d => {
          sList.push({ id: d.id, ...d.data() });
        });
        setAssignedStudents(sList);
      } catch (e) {
        console.warn('Failed to load students for assignment:', e);
      }
    };
    fetchStudents();
  }, [currentUser, isTeacher, isAdmin]);

  // Load existing document if `id` is present
  useEffect(() => {
    if (!id || mode === 'new') return;
    let isCancelled = false;

    const loadSheet = async () => {
      try {
        setLoadingDoc(true);
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'swaralipi', id);
        const snap = await getDoc(docRef);
        if (snap.exists() && !isCancelled) {
          const data = snap.data();
          setTitle(data.title || '');
          setTaal(data.taal || 'free');
          setScaleOffset(typeof data.scaleOffset === 'number' ? data.scaleOffset : 10);
          setBpm(data.bpm || 90);
          setTeacherId(data.teacherId || '');
          setTeacherName(data.teacherName || '');
          setStudentId(data.studentId || '');
          setStudentName(data.studentName || '');

          if (data.rowsJson) {
            try {
              const parsed = JSON.parse(data.rowsJson);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setRows(parsed);
              }
            } catch (err) {
              console.error('Failed to parse rowsJson:', err);
            }
          }
        } else if (!isCancelled) {
          setStatusNotice({ type: 'error', message: 'Swaralipi homework document not found.' });
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Error loading Swaralipi sheet:', err);
          setStatusNotice({ type: 'error', message: 'Failed to load homework sheet: ' + err.message });
        }
      } finally {
        if (!isCancelled) setLoadingDoc(false);
      }
    };

    loadSheet();
    return () => {
      isCancelled = true;
    };
  }, [id, mode]);

  // Auto-center Mini Harmonium on Root Sa
  const centerKeyboardOnSa = useCallback(() => {
    requestAnimationFrame(() => {
      const scroller = kbdScrollerRef.current;
      if (!scroller) return;
      const saKey = scroller.querySelector('.is-sa');
      if (saKey) {
        const targetScroll = saKey.offsetLeft - (scroller.clientWidth / 2) + 24;
        scroller.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
      }
    });
  }, []);

  useEffect(() => {
    if (canEdit && keypadMode === 'kbd') {
      centerKeyboardOnSa();
    }
  }, [scaleOffset, canEdit, keypadMode, centerKeyboardOnSa]);

  // Meend SVG Arc Rendering
  const updateMeendArcs = useCallback(() => {
    if (!rowsContainerRef.current) return;
    const rowElements = rowsContainerRef.current.querySelectorAll('.swara-row');

    rowElements.forEach((rowEl, rIdx) => {
      const svg = rowEl.querySelector('.meend-svg');
      if (!svg) return;
      svg.innerHTML = '';

      const row = rows[rIdx];
      if (!row) return;

      row.forEach((cell, cIdx) => {
        if (!cell.meend) return;
        const startEl = rowEl.querySelector(`.cell[data-c="${cIdx}"]`);
        if (!startEl) return;

        let targetIdx = -1;
        for (let j = cIdx + 1; j < row.length; j++) {
          if (row[j].semi !== null && row[j].semi >= 0) {
            targetIdx = j;
            break;
          }
        }

        const x1 = startEl.offsetLeft + startEl.offsetWidth / 2;

        if (targetIdx !== -1) {
          const endEl = rowEl.querySelector(`.cell[data-c="${targetIdx}"]`);
          if (!endEl) return;
          const x2 = endEl.offsetLeft + endEl.offsetWidth / 2;
          const midX = (x1 + x2) / 2;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M ${x1},2 Q ${midX},15 ${x2},2`);
          path.setAttribute('class', 'meend-path');
          svg.appendChild(path);
        } else if (cIdx + 1 < row.length) {
          const nextEl = rowEl.querySelector(`.cell[data-c="${cIdx + 1}"]`);
          if (!nextEl) return;
          const x2 = nextEl.offsetLeft + nextEl.offsetWidth / 2;
          const midX = (x1 + x2) / 2;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M ${x1},2 Q ${midX},13 ${x2},2`);
          path.setAttribute('class', 'meend-path pending');
          svg.appendChild(path);
        }
      });
    });
  }, [rows]);

  useEffect(() => {
    const timer = setTimeout(updateMeendArcs, 60);
    window.addEventListener('resize', updateMeendArcs);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateMeendArcs);
    };
  }, [updateMeendArcs, taal]);

  // Flash Key Animation
  const flashKey = useCallback((midi, durationMs = 240) => {
    setPressedMidi(midi);
    setTimeout(() => {
      setPressedMidi(current => (current === midi ? null : current));
    }, durationMs);
  }, []);

  // Playback Control
  const handleTogglePlay = () => {
    if (isPlaying) {
      if (playbackEngineRef.current) {
        playbackEngineRef.current.stop();
      }
      setIsPlaying(false);
      setPlayingCell(null);
      return;
    }

    if (!playbackEngineRef.current) return;

    const started = playbackEngineRef.current.play({
      rows,
      scaleOffset,
      bpm,
      onCellPlaying: (r, c) => setPlayingCell({ r, c }),
      onKeyFlash: (midi, dur) => flashKey(midi, dur),
      onEnded: () => {
        setIsPlaying(false);
        setPlayingCell(null);
      }
    });

    if (started) {
      setIsPlaying(true);
    }
  };

  // Cursor Movement
  const advanceCursor = () => {
    const beats = TAALS[taal]?.beats || 8;
    setCursor(prev => {
      if (prev.c + 1 < beats) {
        return { r: prev.r, c: prev.c + 1 };
      } else {
        if (prev.r + 1 >= rows.length) {
          setRows(r => [...r, createEmptyRow(beats)]);
        }
        return { r: prev.r + 1, c: 0 };
      }
    });
  };

  const retreatCursor = () => {
    const beats = TAALS[taal]?.beats || 8;
    setCursor(prev => {
      if (prev.c > 0) {
        return { r: prev.r, c: prev.c - 1 };
      } else if (prev.r > 0) {
        return { r: prev.r - 1, c: beats - 1 };
      }
      return prev;
    });
  };

  // Insert Note / Symbol into active cell
  const handleInsertNote = (swara, semi, oct) => {
    if (!canEdit) return;

    setRows(prevRows => {
      const next = prevRows.map(row => row.map(cell => ({ ...cell })));
      const curr = next[cursor.r]?.[cursor.c];
      if (!curr) return prevRows;

      let glideFrom = null;
      if (semi >= 0 && cursor.c > 0) {
        const prev = next[cursor.r][cursor.c - 1];
        if (prev && prev.meend && prev.semi >= 0) {
          glideFrom = prev;
        }
      }

      curr.swara = swara;
      curr.semi = semi;
      curr.oct = semi >= 0 ? oct : 0;
      if (semi < 0) curr.meend = false;

      if (semi >= 0) {
        const beatSec = 60 / bpm;
        playPreviewTone(scaleOffset, semi, oct, Math.min(0.50, beatSec * 0.88), glideFrom);
      }

      return next;
    });

    advanceCursor();
  };

  // Backspace / Erase active cell
  const handleBackspace = () => {
    if (!canEdit) return;

    setRows(prevRows => {
      const next = prevRows.map(row => row.map(cell => ({ ...cell })));
      const curr = next[cursor.r]?.[cursor.c];

      if (curr && curr.swara) {
        curr.swara = '';
        curr.semi = null;
        curr.meend = false;
        return next;
      }

      // If already empty, retreat and clear
      retreatCursor();
      const beats = TAALS[taal]?.beats || 8;
      const targetR = cursor.c > 0 ? cursor.r : Math.max(0, cursor.r - 1);
      const targetC = cursor.c > 0 ? cursor.c - 1 : beats - 1;

      if (next[targetR]?.[targetC]) {
        next[targetR][targetC].swara = '';
        next[targetR][targetC].semi = null;
        next[targetR][targetC].meend = false;
      }
      return next;
    });
  };

  // 1-Tap Meend Toggle
  const handleToggleMeend = () => {
    if (!canEdit) return;

    setRows(prevRows => {
      const next = prevRows.map(row => row.map(cell => ({ ...cell })));
      let target = null;

      const curr = next[cursor.r]?.[cursor.c];
      if (curr && curr.semi !== null && curr.semi >= 0) {
        target = curr;
      } else if (cursor.c > 0) {
        const prev = next[cursor.r]?.[cursor.c - 1];
        if (prev && prev.semi !== null && prev.semi >= 0) {
          target = prev;
        }
      }

      if (target) {
        target.meend = !target.meend;
      }
      return next;
    });
  };

  // Determine if Meend is armed for active cell
  const isMeendArmed = () => {
    const curr = rows[cursor.r]?.[cursor.c];
    if (curr && curr.semi !== null && curr.semi >= 0) {
      return Boolean(curr.meend);
    }
    if (cursor.c > 0) {
      const prev = rows[cursor.r]?.[cursor.c - 1];
      if (prev && prev.semi !== null && prev.semi >= 0) {
        return Boolean(prev.meend);
      }
    }
    return false;
  };

  // Taal change handler
  const handleTaalChange = (newTaal) => {
    const newBeats = TAALS[newTaal]?.beats || 8;
    setTaal(newTaal);
    setRows(prevRows => {
      return prevRows.map(oldRow => {
        const newRow = createEmptyRow(newBeats);
        for (let i = 0; i < Math.min(oldRow.length, newBeats); i++) {
          newRow[i] = { ...oldRow[i] };
        }
        return newRow;
      });
    });
    setCursor({ r: 0, c: 0 });
  };

  // Add line / row
  const handleAddRow = () => {
    const beats = TAALS[taal]?.beats || 8;
    setRows(prev => [...prev, createEmptyRow(beats)]);
    setCursor({ r: rows.length, c: 0 });
  };

  // Clear sheet confirmation
  const handleClearSheet = () => {
    if (window.confirm('Clear all swaras and lyrics in this sheet?')) {
      const beats = TAALS[taal]?.beats || 8;
      setRows([createEmptyRow(beats), createEmptyRow(beats)]);
      setCursor({ r: 0, c: 0 });
    }
  };

  // Save to Firestore
  const handleSaveHomework = async () => {
    if (!currentUser) {
      alert('Please sign in to save homework sheets.');
      return;
    }

    try {
      setSavingDoc(true);
      const targetDocId = id && mode !== 'new' ? id : doc(collection(db, 'artifacts', appId, 'public', 'data', 'swaralipi')).id;
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'swaralipi', targetDocId);

      // Selected student info
      const studentObj = assignedStudents.find(s => s.id === studentId);
      const finalStudentName = studentObj ? (studentObj.displayName || studentObj.email) : (studentId ? 'Student' : 'All Students');

      const payload = {
        title: title.trim() || 'স্বরলিপি',
        taal,
        scaleOffset: Number(scaleOffset),
        bpm: Number(bpm),
        rowsJson: JSON.stringify(rows),
        teacherId: currentUser.uid,
        teacherName: userProfile?.displayName || currentUser.displayName || 'Instructor',
        studentId: studentId || '',
        studentName: finalStudentName,
        updatedAt: serverTimestamp()
      };

      if (!id || mode === 'new') {
        payload.createdAt = serverTimestamp();
        await setDoc(docRef, payload);
        setStatusNotice({ type: 'success', message: 'Swaralipi homework created successfully!' });
        setTimeout(() => {
          navigate(`/swaralipi/${targetDocId}`, { replace: true });
        }, 1200);
      } else {
        await updateDoc(docRef, payload);
        setStatusNotice({ type: 'success', message: 'Swaralipi homework saved successfully!' });
        setTimeout(() => setStatusNotice(null), 3500);
      }
    } catch (err) {
      console.error('Error saving Swaralipi sheet:', err);
      setStatusNotice({ type: 'error', message: 'Failed to save homework: ' + err.message });
    } finally {
      setSavingDoc(false);
    }
  };

  // Generate 2.5 Octave Piano Keys (MIDI 48 to 79)
  const rootSaMidi = getRootSaMidi(scaleOffset);
  const pianoKeys = [];
  const whiteKeyWidth = 46;
  let whiteCount = 0;

  for (let midi = 48; midi <= 79; midi++) {
    const noteInOct = midi % 12;
    const isBlack = IS_BLACK[noteInOct];
    const diffFromSa = midi - rootSaMidi;
    const semi = ((diffFromSa % 12) + 12) % 12;
    const oct = Math.floor(diffFromSa / 12);
    const swara = SWARA_MAP[semi];
    const western = WESTERN_NAMES[noteInOct] + (Math.floor(midi / 12) - 1);
    const isSa = midi === rootSaMidi;

    let leftPx = null;
    if (isBlack) {
      leftPx = 4 + (whiteCount * whiteKeyWidth) - 16;
    } else {
      whiteCount++;
    }

    pianoKeys.push({
      midi,
      isBlack,
      isSa,
      swara,
      semi,
      oct: Math.max(-1, Math.min(1, oct)),
      western,
      leftPx
    });
  }

  const currentTaalObj = TAALS[taal] || TAALS.free;

  if (loadingDoc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-gray-400">
        <Music className="w-10 h-10 animate-spin text-purple-400 mb-3" />
        <p className="text-sm font-medium">Loading Swaralipi Homework Sheet...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-950 text-gray-100 min-h-screen relative font-bengali">
      {/* Toast Notice */}
      {statusNotice && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border backdrop-blur-md ${
            statusNotice.type === 'error'
              ? 'bg-red-950/90 border-red-500/60 text-red-200'
              : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
          }`}
        >
          {statusNotice.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{statusNotice.message}</span>
          <button
            onClick={() => setStatusNotice(null)}
            className="ml-2 hover:opacity-75 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Practice Toolbar */}
      <header className="bg-gray-900/95 border-b border-gray-800 px-3 sm:px-5 py-2.5 sticky top-0 z-30 backdrop-blur-md flex flex-wrap items-center justify-between gap-2.5 no-print">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-all active:scale-95"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 text-sm font-bold shadow-inner">
              🎵
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-tight flex items-center gap-1.5">
                Alaapi Swaralipi
                {!canEdit && (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-600/40 px-2 py-0.5 rounded-full uppercase">
                    Practice Mode
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-gray-400">
                {teacherName ? `Teacher: ${teacherName}` : 'Bengali Akarmatrik Swaralipi Studio'}
              </p>
            </div>
          </div>
        </div>

        {/* Global Practice & Playback Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Taal Selector */}
          {canEdit ? (
            <select
              value={taal}
              onChange={(e) => handleTaalChange(e.target.value)}
              className="bg-gray-950 border border-gray-700 hover:border-purple-500 rounded-xl px-2.5 py-1.5 text-xs text-gray-200 outline-none cursor-pointer"
              title="Select Taal"
            >
              <option value="free">Free (Alankar / No Taal)</option>
              <option value="dadra">Dadra (3 | 3)</option>
              <option value="kaharwa">Kaharwa (4 | 4)</option>
              <option value="teental">Teental (4 | 4 | 4 | 4)</option>
              <option value="ektaal">Ektaal (3 | 3 | 3 | 3)</option>
            </select>
          ) : (
            <span className="px-2.5 py-1.5 rounded-xl bg-gray-900 border border-gray-800 text-xs font-semibold text-purple-300">
              তাল: {currentTaalObj.name}
            </span>
          )}

          {/* Scale Selector */}
          <select
            value={scaleOffset}
            onChange={(e) => setScaleOffset(Number(e.target.value))}
            className="bg-gray-950 border border-gray-700 hover:border-purple-500 rounded-xl px-2.5 py-1.5 text-xs text-gray-200 outline-none cursor-pointer"
            title="Harmonium Scale (Sa)"
          >
            {SCALE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Tempo Pill (BPM Slider) */}
          <div className="inline-flex items-center gap-1.5 bg-gray-950 border border-gray-700 rounded-xl px-2.5 py-1 text-xs text-gray-300 font-semibold shadow-inner">
            <span className="text-purple-400 font-mono">♩</span>
            <button
              type="button"
              onClick={() => setBpm(b => Math.max(40, b - 5))}
              className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-white font-bold flex items-center justify-center leading-none active:scale-90"
              title="Tempo -5"
            >
              −
            </button>
            <input
              type="range"
              min="40"
              max="200"
              step="2"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="w-16 accent-purple-500 cursor-pointer"
              title="Playback Tempo Slider"
            />
            <button
              type="button"
              onClick={() => setBpm(b => Math.min(200, b + 5))}
              className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-white font-bold flex items-center justify-center leading-none active:scale-90"
              title="Tempo +5"
            >
              +
            </button>
            <span className="font-mono text-purple-300 min-w-[50px] text-center font-bold">
              {bpm} BPM
            </span>
          </div>

          {/* Play / Stop Button */}
          <button
            onClick={handleTogglePlay}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
            }`}
          >
            {isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlaying ? 'Stop' : 'Play'}</span>
          </button>

          {/* White-Paper Print Button */}
          <button
            onClick={() => window.print()}
            className="px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
            title="Print sheet to crisp white paper (Ctrl+P / Cmd+P)"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {/* Teacher Student Mode Preview Toggle */}
          {isTeacher && isAuthor && (
            <button
              onClick={() => setPreviewStudentView(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all active:scale-95 ${
                previewStudentView
                  ? 'bg-purple-900/60 border-purple-500 text-purple-200'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'
              }`}
              title={previewStudentView ? 'Back to Composer Edit' : 'Preview Student Practice View'}
            >
              {previewStudentView ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{previewStudentView ? 'Edit' : 'Student View'}</span>
            </button>
          )}

          {/* Teacher Save Button */}
          {canEdit && (
            <button
              onClick={handleSaveHomework}
              disabled={savingDoc}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-900/40 transition-all active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingDoc ? 'Saving...' : 'Save Homework'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Sheet Container */}
      <main
        ref={sheetContainerRef}
        className={`flex-1 w-full max-w-4xl mx-auto p-3 sm:p-6 transition-all duration-200 ${
          canEdit && showKeypad ? 'pb-72 sm:pb-80' : 'pb-16'
        }`}
      >
        {/* Homework Metadata Bar: Single Line Row */}
        <div className="bg-gray-900/80 border border-gray-800/90 rounded-2xl p-2 sm:p-3 mb-4 flex items-center justify-between gap-2 shadow-lg no-print flex-nowrap">
          <div className="flex-1 min-w-0">
            {canEdit ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song / Alankar Title..."
                className="w-full bg-gray-950 border border-gray-800 focus:border-purple-500 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold text-white outline-none font-bengali"
              />
            ) : (
              <div>
                <h2 className="text-sm sm:text-base font-black text-white font-bengali truncate">{title || 'স্বরলিপি'}</h2>
                <p className="text-[11px] text-gray-400 truncate">
                  তাল: {currentTaalObj.name}  •  স্কেল: {SCALE_OPTIONS.find(s => s.value === scaleOffset)?.label}  •  লয়: {bpm} BPM
                </p>
              </div>
            )}
          </div>

          {/* Teacher Student Assignment Controls & Toggle Panel Button */}
          {canEdit && (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-gray-950 px-2 py-1.5 rounded-xl border border-gray-800 text-xs shrink-0">
                <GraduationCap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-gray-400 font-medium hidden md:inline text-[11px]">Assign:</span>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="bg-transparent text-gray-200 text-xs font-semibold outline-none cursor-pointer max-w-[100px] sm:max-w-[150px] truncate"
                >
                  <option value="" className="bg-gray-900">All My Students</option>
                  {assignedStudents.map(st => (
                    <option key={st.id} value={st.id} className="bg-gray-900">
                      {st.displayName || st.email || 'Student'}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleAddRow}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/70 text-purple-200 border border-purple-500/40 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shrink-0"
                title="Add New Row"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xs:inline">Add Line</span>
              </button>

              {/* Show / Hide Typing Panel Toggle Button */}
              <button
                type="button"
                onClick={() => setShowKeypad(prev => !prev)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shrink-0 ${
                  showKeypad
                    ? 'bg-purple-950/60 border-purple-500/60 text-purple-300'
                    : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'
                }`}
                title={showKeypad ? 'Hide Typing Panel' : 'Show Typing Panel'}
              >
                <Keyboard className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                <span className="hidden sm:inline">{showKeypad ? 'Hide Panel' : 'Show Panel'}</span>
              </button>

              <button
                type="button"
                onClick={handleClearSheet}
                className="p-1.5 sm:p-2 rounded-xl bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-500/30 text-xs transition-all active:scale-95 shrink-0"
                title="Clear All Notes"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Visual Akarmatrik Swaralipi Sheet Card */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-3 sm:p-6 shadow-2xl flex flex-col gap-4 print:bg-white print:border-none print:shadow-none print:p-0">
          {/* Printable White-Paper Header */}
          <div className="hidden print:block text-center pb-4 mb-4 border-b-2 border-black">
            <h1 className="text-2xl font-bold text-black font-bengali">{title || 'স্বরলিপি'}</h1>
            <p className="text-xs text-gray-800 mt-1">
              তাল: {currentTaalObj.name}  •  স্কেল: {SCALE_OPTIONS.find(s => s.value === scaleOffset)?.label}  •  লয়: {bpm} BPM  •  শিক্ষক: {teacherName || 'Alaapi Studio'}
            </p>
          </div>

          {/* Rows Container */}
          <div ref={rowsContainerRef} className="space-y-4">
            {rows.map((row, rIdx) => (
              <div
                key={rIdx}
                className="swara-row-wrap overflow-x-auto pb-2 border-b border-dashed border-gray-800/80 print:border-gray-300 print:overflow-visible"
              >
                <div className="swara-row relative flex items-stretch gap-1.5 pt-1 min-w-max">
                  {/* Bottom Meend SVG overlay (Curved slur arcs underneath swaras) */}
                  <svg className="meend-svg absolute top-[44px] left-0 w-full h-4 pointer-events-none overflow-visible z-10" />

                  {/* Line Number */}
                  <div className="w-5 text-[11px] font-bold text-gray-500 print:text-black flex items-center justify-center shrink-0">
                    {rIdx + 1}
                  </div>

                  {/* Cells */}
                  {row.map((cell, cIdx) => {
                    const isBarLine = currentTaalObj.bars.includes(cIdx);
                    const isActive = canEdit && cursor.r === rIdx && cursor.c === cIdx;
                    const isCellPlaying = playingCell && playingCell.r === rIdx && playingCell.c === cIdx;

                    return (
                      <React.Fragment key={cIdx}>
                        {/* Taal Division Bar Line */}
                        {isBarLine && (
                          <div className="w-[2px] bg-purple-500/50 print:bg-black my-1 rounded shrink-0" />
                        )}

                        {/* Note Cell */}
                        <div
                          data-r={rIdx}
                          data-c={cIdx}
                          onClick={() => {
                            if (canEdit) setCursor({ r: rIdx, c: cIdx });
                          }}
                          className={`cell min-w-[48px] max-w-[76px] flex-1 bg-gray-950 border rounded-xl p-1.5 flex flex-col items-center justify-between gap-1 transition-all select-none print:bg-white print:border-gray-300 ${
                            canEdit ? 'cursor-pointer hover:border-gray-600' : 'cursor-default'
                          } ${
                            isActive
                              ? 'border-purple-400 bg-purple-950/20 ring-2 ring-purple-500/30'
                              : 'border-gray-800'
                          } ${
                            isCellPlaying
                              ? 'border-emerald-400 bg-emerald-950/30 scale-105 shadow-md shadow-emerald-900/30'
                              : ''
                          }`}
                        >
                          {/* Swara Display with High (Tara) / Low (Mandra) Octave Dots */}
                          <div className="relative w-full h-8 mb-3.5 flex items-center justify-center font-bengali select-none print:text-black">
                            {cell.swara ? (
                              <>
                                {cell.oct >= 1 && (
                                  <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[13px] text-purple-400 print:text-black leading-none font-black pointer-events-none">
                                    •
                                  </span>
                                )}
                                <span className="text-white print:text-black font-bengali text-[22px] font-bold leading-none">
                                  {cell.swara}
                                </span>
                                {cell.oct <= -1 && (
                                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[13px] text-blue-400 print:text-black leading-none font-black pointer-events-none">
                                    •
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-700 print:text-transparent text-sm leading-none">·</span>
                            )}
                          </div>

                          {/* Lyrics Input / Display */}
                          {canEdit ? (
                            <input
                              type="text"
                              value={cell.lyric || ''}
                              placeholder="কথা"
                              onFocus={() => setCursor({ r: rIdx, c: cIdx })}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRows(prev => {
                                  const next = prev.map(r => r.map(c => ({ ...c })));
                                  next[rIdx][cIdx].lyric = val;
                                  return next;
                                });
                              }}
                              className="w-full bg-transparent border-t border-gray-800/80 pt-1 text-center text-xs font-medium text-gray-200 placeholder-gray-700 outline-none print:text-black print:border-gray-300 font-bengali"
                            />
                          ) : (
                            <div className="w-full border-t border-gray-800/80 pt-1 text-center text-xs text-gray-300 font-medium truncate min-h-[19px] print:text-black print:border-gray-300 font-bengali">
                              {cell.lyric || ''}
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}

                  {/* Taal End Double Bar */}
                  {taal !== 'free' && (
                    <div className="w-1.5 my-1 border-l-2 border-r-2 border-purple-500/60 print:border-black shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Sticky Bottom Dock: Harmonium Keyboard <-> Bengali Swara Pad (Teacher Composer Mode Only) */}
      {canEdit && (
        <div
          className={`fixed bottom-0 left-0 right-0 bg-gray-900/98 border-t border-gray-700/80 backdrop-blur-md px-2.5 pt-2 pb-[calc(10px+env(safe-area-inset-bottom,0px))] z-40 shadow-2xl no-print transition-all duration-300 ease-in-out transform ${
            showKeypad
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            {/* Dock Header Toolbar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Keyboard vs Swara Pad Mode Switch */}
              <div className="inline-flex bg-gray-950 border border-gray-700 rounded-xl p-0.5 gap-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setKeypadMode('kbd')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    keypadMode === 'kbd'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🎹 Keyboard
                </button>
                <button
                  type="button"
                  onClick={() => setKeypadMode('pad')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    keypadMode === 'pad'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  স্বর Pad
                </button>
              </div>

              {/* Quick Actions (Meend, Sustain, Pause, Half, Arrows, Erase) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* 1-Tap Meend (◡ মীড়) Toggle */}
                <button
                  type="button"
                  onClick={handleToggleMeend}
                  className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border transition-all active:scale-95 ${
                    isMeendArmed()
                      ? 'bg-amber-500 text-gray-950 border-amber-300 shadow-md shadow-amber-500/40'
                      : 'bg-amber-950/30 text-amber-300 border-amber-500/40 hover:bg-amber-900/40'
                  }`}
                  title="Toggle Meend glide on current or previous note"
                >
                  <span>◡ মীড়</span>
                </button>

                {/* Symbols */}
                <button
                  type="button"
                  onClick={() => handleInsertNote('া', -1, 0)}
                  className="px-2.5 py-1 rounded-xl bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold active:scale-95 transition-all"
                  title="Matra (Sustain)"
                >
                  া
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertNote('-', -2, 0)}
                  className="px-2.5 py-1 rounded-xl bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold active:scale-95 transition-all"
                  title="Pause / Rest"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertNote(':', -2, 0)}
                  className="px-2.5 py-1 rounded-xl bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold active:scale-95 transition-all"
                  title="Half Beat"
                >
                  :
                </button>

                {/* Navigation Arrows */}
                <button
                  type="button"
                  onClick={retreatCursor}
                  className="px-2 py-1 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-bold active:scale-95"
                  title="Previous Beat (◀)"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={advanceCursor}
                  className="px-2 py-1 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-bold active:scale-95"
                  title="Next Beat (▶)"
                >
                  ▶
                </button>

                {/* Erase */}
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="px-2.5 py-1 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/40 text-xs font-bold active:scale-95"
                  title="Erase Note (⌫)"
                >
                  ⌫
                </button>

                {/* Hide / Collapse Panel Button */}
                <button
                  type="button"
                  onClick={() => setShowKeypad(false)}
                  className="px-2 py-1 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                  title="Hide Typing Panel"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Hide</span>
                </button>
              </div>
            </div>

            {/* MODE 1: 2.5-Octave Mini Harmonium Keyboard */}
            {keypadMode === 'kbd' && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
                  <span>
                    Tap note → tap <strong className="text-amber-300">◡ মীড়</strong> → tap target note for smooth glide
                  </span>
                  <span>Swipe keys ◀ ▶</span>
                </div>
                <div
                  ref={kbdScrollerRef}
                  className="kbd-scroll overflow-x-auto overflow-y-hidden pb-1 select-none"
                >
                  <div className="relative flex h-[134px] w-max mx-auto bg-gray-950 p-1 border border-gray-700 rounded-2xl shadow-inner">
                    {pianoKeys.map(k => {
                      if (k.isBlack) {
                        return (
                          <button
                            key={k.midi}
                            type="button"
                            onClick={() => {
                              handleInsertNote(k.swara, k.semi, k.oct);
                              flashKey(k.midi);
                            }}
                            style={{ left: `${k.leftPx}px` }}
                            className={`black-key absolute top-1 w-[30px] h-[82px] rounded-b-lg z-20 flex flex-col justify-end items-center pb-2 transition-transform active:scale-95 shadow-lg border select-none ${
                              k.isSa
                                ? 'bg-gradient-to-b from-purple-700 to-purple-900 border-purple-300 text-white'
                                : pressedMidi === k.midi
                                ? 'bg-gradient-to-b from-purple-500 to-purple-800 border-purple-400 text-white'
                                : 'bg-gradient-to-b from-gray-800 to-gray-950 border-gray-600 text-gray-200'
                            }`}
                          >
                            <div className="relative w-full h-[32px] flex items-center justify-center font-bengali">
                              {k.oct >= 1 && (
                                <span className="absolute top-[0px] left-1/2 -translate-x-1/2 text-[12px] leading-none text-purple-300 font-black pointer-events-none">
                                  •
                                </span>
                              )}
                              <span className="text-[14px] font-bold leading-none text-white font-bengali">
                                {k.swara}
                              </span>
                              {k.oct <= -1 && (
                                <span className="absolute bottom-[0px] left-1/2 -translate-x-1/2 text-[12px] leading-none text-blue-300 font-black pointer-events-none">
                                  •
                                </span>
                              )}
                            </div>
                            <span className="text-[8px] opacity-70 font-mono font-semibold mt-0.5 leading-none text-gray-300">
                              {k.western}
                            </span>
                          </button>
                        );
                      }

                      return (
                        <button
                          key={k.midi}
                          type="button"
                          onClick={() => {
                            handleInsertNote(k.swara, k.semi, k.oct);
                            flashKey(k.midi);
                          }}
                          className={`white-key w-[44px] h-[128px] mr-[2px] rounded-b-xl flex flex-col justify-end items-center pb-2.5 transition-transform active:scale-95 border shrink-0 select-none ${
                            k.isSa
                              ? 'bg-gradient-to-b from-purple-100 to-purple-300 border-purple-600 text-purple-950'
                              : pressedMidi === k.midi
                              ? 'bg-gradient-to-b from-purple-300 to-purple-500 border-purple-600 text-white'
                              : 'bg-gradient-to-b from-white to-gray-200 border-gray-400 text-gray-900'
                          }`}
                        >
                          <div className="relative w-full h-[36px] flex items-center justify-center font-bengali">
                            {k.oct >= 1 && (
                              <span className="absolute top-[1px] left-1/2 -translate-x-1/2 text-[13px] leading-none text-purple-700 font-black pointer-events-none">
                                •
                              </span>
                            )}
                            <span
                              className={`text-[16px] font-bold leading-none font-bengali ${
                                k.isSa ? 'text-purple-900 font-black' : 'text-slate-900'
                              }`}
                            >
                              {k.swara}
                            </span>
                            {k.oct <= -1 && (
                              <span className="absolute bottom-[1px] left-1/2 -translate-x-1/2 text-[13px] leading-none text-blue-700 font-black pointer-events-none">
                                •
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[9px] font-mono font-semibold mt-0.5 leading-none ${
                              k.isSa ? 'text-purple-900 opacity-80' : 'text-slate-600 opacity-80'
                            }`}
                          >
                            {k.western}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* MODE 2: Bengali Swara Pad */}
            {keypadMode === 'pad' && (
              <div className="flex flex-col gap-1.5">
                {/* Saptak Selection */}
                <div className="inline-flex bg-gray-950 border border-gray-700 rounded-xl p-0.5 gap-1 self-start shadow-inner">
                  <button
                    type="button"
                    onClick={() => setCurrentOctave(-1)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      currentOctave === -1 ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    মন্দ্র (Low •)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentOctave(0)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      currentOctave === 0 ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    মধ্য (Mid)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentOctave(1)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      currentOctave === 1 ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    তারা (High •)
                  </button>
                </div>

                {/* Shuddha Swaras */}
                <div className="grid grid-cols-7 gap-1.5">
                  {[
                    { swara: 'স', semi: 0, western: 'Sa' },
                    { swara: 'র', semi: 2, western: 'Re' },
                    { swara: 'গ', semi: 4, western: 'Ga' },
                    { swara: 'ম', semi: 5, western: 'Ma' },
                    { swara: 'প', semi: 7, western: 'Pa' },
                    { swara: 'ধ', semi: 9, western: 'Dha' },
                    { swara: 'ন', semi: 11, western: 'Ni' }
                  ].map(k => (
                    <button
                      key={k.swara}
                      type="button"
                      onClick={() => handleInsertNote(k.swara, k.semi, currentOctave)}
                      className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl py-2 flex flex-col items-center justify-center font-bold text-lg text-white font-bengali active:scale-95 transition-all shadow"
                    >
                      <span>{k.swara}</span>
                      <span className="text-[9px] font-sans text-gray-400">{k.western}</span>
                    </button>
                  ))}
                </div>

                {/* Vikrit & Symbols */}
                <div className="grid grid-cols-8 gap-1.5">
                  {[
                    { swara: 'ঋ', semi: 1, western: 're', isKomal: true },
                    { swara: 'জ্ঞ', semi: 3, western: 'ga', isKomal: true },
                    { swara: 'হ্ম', semi: 6, western: 'Ma#', isKomal: true },
                    { swara: 'দ', semi: 8, western: 'dha', isKomal: true },
                    { swara: 'ণ', semi: 10, western: 'ni', isKomal: true },
                    { swara: 'া', semi: -1, western: 'Matra', isSym: true },
                    { swara: '-', semi: -2, western: 'Pause', isSym: true },
                    { swara: ':', semi: -2, western: 'Half', isSym: true }
                  ].map(k => (
                    <button
                      key={k.swara}
                      type="button"
                      onClick={() => handleInsertNote(k.swara, k.semi, currentOctave)}
                      className={`border rounded-xl py-2 flex flex-col items-center justify-center font-bold text-base font-bengali active:scale-95 transition-all shadow ${
                        k.isKomal
                          ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                          : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      }`}
                    >
                      <span>{k.swara}</span>
                      <span className="text-[8px] font-sans opacity-70">{k.western}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Button to Re-Open Typing Panel when Hidden */}
      {canEdit && (
        <div
          className={`fixed bottom-4 right-4 z-40 no-print transition-all duration-300 ease-in-out transform ${
            !showKeypad
              ? 'translate-y-0 opacity-100 pointer-events-auto scale-100'
              : 'translate-y-12 opacity-0 pointer-events-none scale-90'
          }`}
        >
          <button
            type="button"
            onClick={() => setShowKeypad(true)}
            className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-2xl shadow-purple-900/70 border border-purple-400/50 active:scale-95 transition-all"
            title="Open Typing Panel (Harmonium Keyboard & Swara Pad)"
          >
            <Keyboard className="w-4 h-4 text-purple-200" />
            <span>Show Keyboard</span>
            <ChevronUp className="w-4 h-4 text-purple-200" />
          </button>
        </div>
      )}

      {/* Print CSS overrides */}
      <style>{`
        @media print {
          body, html, #root {
            background: #ffffff !important;
            color: #000000 !important;
            overflow: visible !important;
            height: auto !important;
          }
          header, .no-print {
            display: none !important;
          }
          main {
            padding: 0 !important;
            max-width: 100% !important;
          }
          .cell {
            border-color: #cccccc !important;
            background: #ffffff !important;
            box-shadow: none !important;
          }
          .meend-path {
            stroke: #000000 !important;
            stroke-width: 2.2 !important;
            fill: none !important;
          }
          .meend-path.pending {
            display: none !important;
          }
        }
        .meend-path {
          fill: none;
          stroke: #f59e0b;
          stroke-width: 2.2;
          stroke-linecap: round;
        }
        .meend-path.pending {
          stroke-dasharray: 4 3;
          opacity: 0.75;
        }
      `}</style>
    </div>
  );
}
