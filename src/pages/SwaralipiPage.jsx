import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import html2canvas from 'html2canvas';
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
  ChevronUp,
  Clock,
  Share2,
  Download,
  Copy,
  Check,
  X,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { AssignSwaralipiModal } from '../components/AssignSwaralipiModal';
import { ConfirmationModal } from '../components/ConfirmationModal';

// Clean WhatsApp Brand Icon SVG
function WhatsAppIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function createEmptyRow(beats) {
  return Array.from({ length: beats }, () => ({
    swara: '',
    semi: null,
    oct: 0,
    lyric: '',
    meend: false
  }));
}

// Checks if a row has zero swara notations and zero lyrics
function isRowEmpty(row) {
  if (!row) return true;
  return row.every(cell => !cell.swara && (!cell.lyric || !cell.lyric.trim()));
}

// Automatically removes trailing empty rows beyond the minimum (default 2 lines)
function pruneTrailingEmptyRows(currentRows, minRows = 2) {
  const trimmed = [...currentRows];
  while (trimmed.length > minRows && isRowEmpty(trimmed[trimmed.length - 1])) {
    trimmed.pop();
  }
  return trimmed;
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
  const [assignedTo, setAssignedTo] = useState([]);
  const [assignedStudentNames, setAssignedStudentNames] = useState([]);
  const [completions, setCompletions] = useState({});
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isUpdatingPractice, setIsUpdatingPractice] = useState(false);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [loadingDoc, setLoadingDoc] = useState(Boolean(id));
  const [savingDoc, setSavingDoc] = useState(false);
  const [statusNotice, setStatusNotice] = useState(null);

  // Snapshot ref to track unsaved changes
  const lastSavedSnapshotRef = useRef(null);

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
  const exportContainerRef = useRef(null);

  // Filter out any blank rows (no swara notations and no lyrics) for the clean portrait image export
  const exportRows = useMemo(() => {
    const nonEmpty = rows.filter(r => !isRowEmpty(r));
    return nonEmpty.length > 0 ? nonEmpty : [rows[0] || createEmptyRow(TAALS[taal]?.beats || 8)];
  }, [rows, taal]);

  // WhatsApp Image Export State
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [shareModalData, setShareModalData] = useState(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Auto-scroll to top when page mounts
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const scrollParent = document.querySelector('main.overflow-y-auto') || document.documentElement || document.body;
    if (scrollParent) {
      scrollParent.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, []);

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
          setAssignedTo(Array.isArray(data.assignedTo) ? data.assignedTo : (data.studentId && data.studentId !== 'MULTI' ? [data.studentId] : []));
          setAssignedStudentNames(Array.isArray(data.assignedStudentNames) ? data.assignedStudentNames : (data.studentName ? [data.studentName] : []));
          setCompletions(data.completions || {});

          let loadedRows = [];
          if (data.rowsJson) {
            try {
              const parsed = JSON.parse(data.rowsJson);
              if (Array.isArray(parsed) && parsed.length > 0) {
                loadedRows = parsed;
                setRows(parsed);
              }
            } catch (err) {
              console.error('Failed to parse rowsJson:', err);
            }
          }

          lastSavedSnapshotRef.current = JSON.stringify({
            title: (data.title || '').trim(),
            taal: data.taal || 'free',
            scaleOffset: typeof data.scaleOffset === 'number' ? data.scaleOffset : 10,
            bpm: data.bpm || 90,
            rows: loadedRows,
            assignedTo: Array.isArray(data.assignedTo) ? data.assignedTo : (data.studentId && data.studentId !== 'MULTI' ? [data.studentId] : [])
          });
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

  // Initialize snapshot for new composition
  useEffect(() => {
    if (mode === 'new') {
      const beats = TAALS.free?.beats || 8;
      lastSavedSnapshotRef.current = JSON.stringify({
        title: '',
        taal: 'free',
        scaleOffset: 10,
        bpm: 90,
        rows: [createEmptyRow(beats), createEmptyRow(beats)],
        assignedTo: []
      });
    }
  }, [mode]);

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
  const advanceCursor = useCallback(() => {
    const beats = TAALS[taal]?.beats || 8;
    setCursor(prev => {
      if (prev.c + 1 < beats) {
        return { r: prev.r, c: prev.c + 1 };
      } else {
        const nextR = prev.r + 1;
        setRows(rList => {
          if (nextR >= rList.length) {
            return [...rList, createEmptyRow(beats)];
          }
          return rList;
        });
        return { r: nextR, c: 0 };
      }
    });
  }, [taal]);

  const retreatCursor = useCallback(() => {
    const beats = TAALS[taal]?.beats || 8;
    setCursor(prev => {
      if (prev.c > 0) {
        return { r: prev.r, c: prev.c - 1 };
      } else if (prev.r > 0) {
        return { r: prev.r - 1, c: beats - 1 };
      }
      return prev;
    });
  }, [taal]);

  // Insert Note / Symbol into active cell
  const handleInsertNote = (swara, semi, oct) => {
    if (!canEdit) return;

    const beats = TAALS[taal]?.beats || 8;
    const curR = cursor.r;
    const curC = cursor.c;

    const nextC = curC + 1 < beats ? curC + 1 : 0;
    const nextR = curC + 1 < beats ? curR : curR + 1;

    setRows(prevRows => {
      const next = prevRows.map(row => row.map(cell => ({ ...cell })));
      while (next.length <= curR) {
        next.push(createEmptyRow(beats));
      }

      const curr = next[curR]?.[curC];
      if (!curr) return prevRows;

      let glideFrom = null;
      if (semi >= 0 && curC > 0) {
        const prev = next[curR][curC - 1];
        if (prev && prev.meend && prev.semi >= 0) {
          glideFrom = prev;
        }
      }

      curr.swara = swara;
      curr.semi = semi;
      curr.oct = semi >= 0 ? oct : 0;
      if (semi < 0) curr.meend = false;

      // If moving to next beat requires a new line
      if (nextR >= next.length) {
        next.push(createEmptyRow(beats));
      }

      return next;
    });

    setCursor({ r: nextR, c: nextC });

    if (semi >= 0) {
      const beatSec = 60 / bpm;
      playPreviewTone(scaleOffset, semi, oct, Math.min(0.50, beatSec * 0.88), null);
    }
  };

  // Backspace / Erase active cell with auto-deletion of empty lines 3 and onwards
  const handleBackspace = useCallback(() => {
    if (!canEdit) return;

    const beats = TAALS[taal]?.beats || 8;

    let targetR = cursor.r;
    let targetC = cursor.c;
    let shouldRetreat = false;

    const curr = rows[cursor.r]?.[cursor.c];

    if (curr && curr.swara) {
      // Clear note in active cell
      targetR = cursor.r;
      targetC = cursor.c;
      shouldRetreat = false;
    } else {
      // Current cell is already empty -> retreat and clear previous cell
      shouldRetreat = true;
      if (targetC > 0) {
        targetC = targetC - 1;
      } else if (targetR > 0) {
        targetR = targetR - 1;
        targetC = beats - 1;
      }
    }

    // Build updated rows with target cell cleared
    const next = rows.map((row, rIdx) =>
      row.map((cell, cIdx) => {
        if (rIdx === targetR && cIdx === targetC) {
          return { ...cell, swara: '', semi: null, meend: false };
        }
        return { ...cell };
      })
    );

    // Automatically prune empty rows from line 3 and onwards (preserving minimum 2 lines)
    const pruned = pruneTrailingEmptyRows(next, 2);

    // Adjust cursor cleanly
    let nextCursorR = shouldRetreat ? targetR : cursor.r;
    let nextCursorC = shouldRetreat ? targetC : cursor.c;

    if (nextCursorR >= pruned.length) {
      nextCursorR = Math.max(0, pruned.length - 1);
      nextCursorC = beats - 1;
    }

    setRows(pruned);
    setCursor({ r: nextCursorR, c: nextCursorC });
  }, [canEdit, cursor, rows, taal]);

  // Physical Keyboard Navigation & Backspace Support
  useEffect(() => {
    if (!canEdit) return;

    const handleKeyDown = (e) => {
      // If typing inside an input or textarea, let native text editing handle it
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        retreatCursor();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        advanceCursor();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, handleBackspace, retreatCursor, advanceCursor]);

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

  // Check if current sheet has unsaved changes compared to last saved state
  const hasUnsavedChanges = useCallback(() => {
    if (!canEdit) return false;
    const current = JSON.stringify({
      title: title.trim(),
      taal,
      scaleOffset: Number(scaleOffset),
      bpm: Number(bpm),
      rows,
      assignedTo: assignedTo || []
    });

    if (lastSavedSnapshotRef.current !== null) {
      return current !== lastSavedSnapshotRef.current;
    }

    const hasNotes = rows.some(r => r.some(c => c.swara || c.lyric));
    const hasTitle = Boolean(title.trim());
    return hasNotes || hasTitle;
  }, [canEdit, title, taal, scaleOffset, bpm, rows, assignedTo]);

  // Prevent accidental browser tab close or refresh
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Back to Dashboard with Confirmation if Unsaved
  const handleBackNavigation = () => {
    if (hasUnsavedChanges()) {
      setIsLeaveModalOpen(true);
    } else {
      navigate('/dashboard');
    }
  };

  // Clear sheet confirmation modal trigger
  const handleClearSheet = () => {
    setIsClearModalOpen(true);
  };

  const handleConfirmClearSheet = () => {
    const beats = TAALS[taal]?.beats || 8;
    setRows([createEmptyRow(beats), createEmptyRow(beats)]);
    setCursor({ r: 0, c: 0 });
    setIsClearModalOpen(false);
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

      // Student info resolution
      const finalStudentNames = assignedStudents
        .filter(s => assignedTo.includes(s.id))
        .map(s => s.displayName || s.email || 'Student');

      const payload = {
        title: title.trim() || 'স্বরলিপি',
        taal,
        scaleOffset: Number(scaleOffset),
        bpm: Number(bpm),
        rowsJson: JSON.stringify(rows),
        teacherId: currentUser.uid,
        teacherName: userProfile?.displayName || currentUser.displayName || 'Instructor',
        assignedTo: assignedTo || [],
        assignedStudentNames: finalStudentNames.length > 0 ? finalStudentNames : assignedStudentNames,
        // Legacy fields for backward compatibility
        studentId: assignedTo.length === 1 ? assignedTo[0] : (assignedTo.length > 1 ? 'MULTI' : ''),
        studentName: assignedTo.length === 1
          ? (finalStudentNames[0] || 'Student')
          : (assignedTo.length > 1 ? `${assignedTo.length} Students` : ''),
        completions: completions || {},
        updatedAt: serverTimestamp()
      };

      if (!id || mode === 'new') {
        payload.createdAt = serverTimestamp();
        await setDoc(docRef, payload);
        lastSavedSnapshotRef.current = JSON.stringify({
          title: title.trim(),
          taal,
          scaleOffset: Number(scaleOffset),
          bpm: Number(bpm),
          rows,
          assignedTo: assignedTo || []
        });
        setStatusNotice({
          type: 'success',
          message: assignedTo.length > 0
            ? `Swaralipi created and assigned to ${assignedTo.length} student(s)!`
            : 'Swaralipi saved to library for future use!'
        });
        setTimeout(() => {
          navigate(`/swaralipi/${targetDocId}`, { replace: true });
        }, 1200);
      } else {
        await updateDoc(docRef, payload);
        lastSavedSnapshotRef.current = JSON.stringify({
          title: title.trim(),
          taal,
          scaleOffset: Number(scaleOffset),
          bpm: Number(bpm),
          rows,
          assignedTo: assignedTo || []
        });
        setStatusNotice({
          type: 'success',
          message: assignedTo.length > 0
            ? 'Swaralipi and student assignments saved successfully!'
            : 'Swaralipi saved to library successfully!'
        });
        setTimeout(() => setStatusNotice(null), 3500);
      }
    } catch (err) {
      console.error('Error saving Swaralipi sheet:', err);
      setStatusNotice({ type: 'error', message: 'Failed to save: ' + err.message });
    } finally {
      setSavingDoc(false);
    }
  };

  // Student Practice Completion Toggle
  const handleToggleStudentPractice = async () => {
    if (!id || !currentUser) return;
    try {
      setIsUpdatingPractice(true);
      const isDone = Boolean(completions[currentUser.uid]?.completed);
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'swaralipi', id);
      const updatedCompletion = !isDone
        ? {
          completed: true,
          completedAt: new Date().toISOString(),
          studentName: userProfile?.displayName || currentUser.displayName || 'Student'
        }
        : {
          completed: false,
          uncompletedAt: new Date().toISOString(),
          studentName: userProfile?.displayName || currentUser.displayName || 'Student'
        };

      await updateDoc(docRef, {
        [`completions.${currentUser.uid}`]: updatedCompletion,
        updatedAt: serverTimestamp()
      });

      setCompletions(prev => ({
        ...prev,
        [currentUser.uid]: updatedCompletion
      }));

      setStatusNotice({
        type: 'success',
        message: !isDone ? '🎉 Great job! Marked as practiced.' : 'Marked practice as pending.'
      });
      setTimeout(() => setStatusNotice(null), 3000);
    } catch (err) {
      console.error('Failed to update practice completion:', err);
      setStatusNotice({ type: 'error', message: 'Failed to update status: ' + err.message });
    } finally {
      setIsUpdatingPractice(false);
    }
  };

  // Share Swaralipi as High-Resolution Compatible Image File via WhatsApp
  const handleShareWhatsApp = async () => {
    if (!exportContainerRef.current) return;
    setIsGeneratingImage(true);
    setCopiedToClipboard(false);

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      // Compute Meends specifically for the export container
      const exportContainer = exportContainerRef.current;
      const exportRowElements = exportContainer.querySelectorAll('.export-swara-row');
      exportRowElements.forEach((rowEl, rIdx) => {
        const svg = rowEl.querySelector('.export-meend-svg');
        if (!svg) return;
        svg.innerHTML = '';
        const row = exportRows[rIdx];
        if (!row) return;

        row.forEach((cell, cIdx) => {
          if (!cell.meend) return;
          const startEl = rowEl.querySelector(`.export-cell[data-c="${cIdx}"]`);
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
            const endEl = rowEl.querySelector(`.export-cell[data-c="${targetIdx}"]`);
            if (!endEl) return;
            const x2 = endEl.offsetLeft + endEl.offsetWidth / 2;
            const midX = (x1 + x2) / 2;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1},2 Q ${midX},16 ${x2},2`);
            path.setAttribute('stroke', '#d97706');
            path.setAttribute('stroke-width', '2.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-linecap', 'round');
            svg.appendChild(path);
          } else if (cIdx + 1 < row.length) {
            const nextEl = rowEl.querySelector(`.export-cell[data-c="${cIdx + 1}"]`);
            if (!nextEl) return;
            const x2 = nextEl.offsetLeft + nextEl.offsetWidth / 2;
            const midX = (x1 + x2) / 2;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1},2 Q ${midX},14 ${x2},2`);
            path.setAttribute('stroke', '#d97706');
            path.setAttribute('stroke-width', '2.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-dasharray', '4 3');
            svg.appendChild(path);
          }
        });
      });

      // Allow DOM to settle
      await new Promise(r => setTimeout(r, 80));

      const canvas = await html2canvas(exportContainer, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });

      // Generate JPEG blob for universal mobile/WhatsApp compatibility
      const jpegBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (!jpegBlob) throw new Error('Could not create JPEG image file');

      const safeTitle = (title || 'Swaralipi').trim().replace(/[/\\?%*:|"<>]/g, '_');
      const fileName = `${safeTitle}-Alaapi.jpg`;
      const file = new File([jpegBlob], fileName, { type: 'image/jpeg' });
      const imgUrl = URL.createObjectURL(jpegBlob);

      // Try Native Web Share API with JPEG file (Supported on Android Chrome & iOS Safari)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: title || 'স্বরলিপি',
            text: `🎶 ${title || 'স্বরলিপি'} (${currentTaalObj.name}, ${SCALE_OPTIONS.find(s => s.value === scaleOffset)?.label || ''}) — Alaapi Music Studio`
          });
          setIsGeneratingImage(false);
          return;
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') {
            setIsGeneratingImage(false);
            return;
          }
          console.warn('Native share error, falling back to modal:', shareErr);
        }
      }

      // Generate PNG blob for clipboard copy (ClipboardItem strictly requires image/png in desktop browsers)
      let pngBlob = null;
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob })
          ]);
          setCopiedToClipboard(true);
        }
      } catch (clipErr) {
        console.warn('Clipboard image write failed:', clipErr);
      }

      setShareModalData({ blob: jpegBlob, pngBlob, file, imgUrl, fileName });
    } catch (err) {
      console.error('Error generating WhatsApp image:', err);
      setStatusNotice({ type: 'error', message: 'Failed to generate WhatsApp image: ' + err.message });
    } finally {
      setIsGeneratingImage(false);
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
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border backdrop-blur-md ${statusNotice.type === 'error'
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
            onClick={handleBackNavigation}
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
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 ${isPlaying
              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40 animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
              }`}
          >
            {isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlaying ? 'Stop' : 'Play'}</span>
          </button>

          {/* Share via WhatsApp as Compatible Image File */}
          <button
            onClick={handleShareWhatsApp}
            disabled={isGeneratingImage}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold border border-emerald-500/80 flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-emerald-950/40 disabled:opacity-50"
            title="Share this Swaralipi sheet as a compatible image file on WhatsApp"
          >
            {isGeneratingImage ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden xs:inline">Generating...</span>
                <span className="xs:hidden">...</span>
              </>
            ) : (
              <>
                <WhatsAppIcon className="w-3.5 h-3.5 text-white shrink-0" />
                {/* <span className="hidden sm:inline">Share via WhatsApp</span> */}
                {/* <span className="sm:hidden">Share</span> */}
                <span>Share</span>
              </>
            )}
          </button>

          {/* Teacher Student Mode Preview Toggle */}
          {isTeacher && isAuthor && (
            <button
              onClick={() => setPreviewStudentView(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all active:scale-95 ${previewStudentView
                ? 'bg-purple-900/60 border-purple-500 text-purple-200'
                : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'
                }`}
              title={previewStudentView ? 'Back to Composer Edit' : 'Preview Student Practice View'}
            >
              {previewStudentView ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{previewStudentView ? 'Edit' : 'Student View'}</span>
            </button>
          )}

          {/* Student Practice Completion Button (Visible when student is viewing or practice mode) */}
          {id && currentUser && !canEdit && (
            <button
              onClick={handleToggleStudentPractice}
              disabled={isUpdatingPractice}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 ${completions[currentUser?.uid]?.completed
                ? 'bg-emerald-950/90 border border-emerald-500/70 text-emerald-300 hover:bg-emerald-900/80 shadow-emerald-950/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                }`}
              title={
                completions[currentUser?.uid]?.completed
                  ? 'Click to unmark practice completion'
                  : 'Mark this Swaralipi as practiced'
              }
            >
              <CheckCircle className={`w-3.5 h-3.5 ${completions[currentUser?.uid]?.completed ? 'text-emerald-400' : 'text-white'}`} />
              <span>
                {completions[currentUser?.uid]?.completed ? '✓ Practiced' : 'Mark Completed'}
              </span>
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
              <span>
                {savingDoc
                  ? 'Saving...'
                  : assignedTo.length > 0
                    ? 'Save & Assign'
                    : 'Save to Library'}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Main Sheet Container */}
      <div
        ref={sheetContainerRef}
        className={`flex-1 w-full max-w-4xl mx-auto p-3 sm:p-6 transition-all duration-200 ${canEdit && showKeypad ? 'pb-72 sm:pb-80' : 'pb-16'
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
              {/* Assign to Students Button (Opens Modal) - Icon only on mobile, text on sm+ */}
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(true)}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 border border-purple-500/60 text-purple-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
                title={
                  assignedTo.length === 0
                    ? 'Assign Students'
                    : `Assigned to ${assignedTo.length} student${assignedTo.length > 1 ? 's' : ''}`
                }
              >
                <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="hidden sm:inline">
                  {assignedTo.length === 0
                    ? 'Assign Students'
                    : `Assigned (${assignedTo.length})`}
                </span>
                {assignedTo.length > 0 && (
                  <span className="sm:hidden text-[10px] bg-purple-500/40 px-1 rounded-full text-purple-200 font-bold">
                    {assignedTo.length}
                  </span>
                )}
              </button>

              {/* Practice Progress Pill */}
              {assignedTo.length > 0 && (() => {
                const doneCount = assignedTo.filter(sId => completions[sId]?.completed).length;
                return (
                  <button
                    type="button"
                    onClick={() => setIsAssignModalOpen(true)}
                    className={`px-2 py-1 rounded-full border text-[10px] font-bold flex items-center gap-1 transition-all shrink-0 ${doneCount > 0
                      ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/80'
                      : 'bg-gray-950/80 border-gray-800 text-gray-400 hover:text-gray-300'
                      }`}
                    title="Click to view student practice status"
                  >
                    <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>{doneCount}/{assignedTo.length} Practiced</span>
                  </button>
                );
              })()}

              <button
                type="button"
                onClick={handleAddRow}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/70 text-purple-200 border border-purple-500/40 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shrink-0"
                title="Add New Row"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xs:inline">Add Line</span>
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

        {/* Student Completed Practice Banner */}
        {!canEdit && currentUser && completions[currentUser.uid]?.completed && (
          <div className="bg-emerald-950/50 border border-emerald-500/50 rounded-2xl p-2.5 px-3.5 flex items-center justify-between text-xs text-emerald-300 shadow-md mb-3 no-print">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                You marked this Swaralipi as <strong>Practiced</strong>!
                {completions[currentUser.uid]?.completedAt && (
                  <span className="text-emerald-400/80 text-[11px] ml-1">
                    ({new Date(completions[currentUser.uid].completedAt).toLocaleDateString()})
                  </span>
                )}
              </span>
            </div>
            <button
              onClick={handleToggleStudentPractice}
              disabled={isUpdatingPractice}
              className="text-[11px] text-emerald-400 hover:text-emerald-200 underline transition-colors"
            >
              Mark Incomplete
            </button>
          </div>
        )}

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
                          className={`cell min-w-[48px] max-w-[76px] flex-1 bg-gray-950 border rounded-xl p-1.5 flex flex-col items-center justify-between gap-1 transition-all select-none print:bg-white print:border-gray-300 ${canEdit ? 'cursor-pointer hover:border-gray-600' : 'cursor-default'
                            } ${isActive
                              ? 'border-purple-400 bg-purple-950/20 ring-2 ring-purple-500/30'
                              : 'border-gray-800'
                            } ${isCellPlaying
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
      </div>

      {/* Sticky Bottom Dock: Harmonium Keyboard <-> Bengali Swara Pad (Teacher Composer Mode Only) */}
      {canEdit && (
        <div
          className={`fixed bottom-0 left-0 right-0 bg-gray-900/98 border-t border-gray-700/80 backdrop-blur-md px-2.5 pt-2 pb-[calc(10px+env(safe-area-inset-bottom,0px))] z-40 shadow-2xl no-print transition-all duration-300 ease-in-out transform ${showKeypad
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${keypadMode === 'kbd'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                    }`}
                >
                  🎹 Keyboard
                </button>
                <button
                  type="button"
                  onClick={() => setKeypadMode('pad')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${keypadMode === 'pad'
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
                  className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border transition-all active:scale-95 ${isMeendArmed()
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
                            className={`black-key absolute top-1 w-[30px] h-[82px] rounded-b-lg z-20 flex flex-col justify-end items-center pb-2 transition-transform active:scale-95 shadow-lg border select-none ${k.isSa
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
                          className={`white-key w-[44px] h-[128px] mr-[2px] rounded-b-xl flex flex-col justify-end items-center pb-2.5 transition-transform active:scale-95 border shrink-0 select-none ${k.isSa
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
                              className={`text-[16px] font-bold leading-none font-bengali ${k.isSa ? 'text-purple-900 font-black' : 'text-slate-900'
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
                            className={`text-[9px] font-mono font-semibold mt-0.5 leading-none ${k.isSa ? 'text-purple-900 opacity-80' : 'text-slate-600 opacity-80'
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
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${currentOctave === -1 ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    মন্দ্র (Low •)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentOctave(0)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${currentOctave === 0 ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    মধ্য (Mid)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentOctave(1)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${currentOctave === 1 ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
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
                      className={`border rounded-xl py-2 flex flex-col items-center justify-center font-bold text-base font-bengali active:scale-95 transition-all shadow ${k.isKomal
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
          className={`fixed bottom-4 right-4 z-40 no-print transition-all duration-300 ease-in-out transform ${!showKeypad
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

      {/* Assign to Students Modal */}
      <AssignSwaralipiModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        sheet={{
          id: id && id !== 'new' ? id : null,
          title,
          assignedTo,
          assignedStudentNames,
          completions
        }}
        students={assignedStudents}
        onAssigned={(updated) => {
          setAssignedTo(updated.assignedTo || []);
          setAssignedStudentNames(updated.assignedStudentNames || []);
          setStatusNotice({
            type: 'success',
            message: updated.assignedTo?.length > 0
              ? `Assigned to ${updated.assignedTo.length} student(s) successfully! Click "Save Swaralipi" to finalize.`
              : 'Sheet saved to library (unassigned).'
          });
          setTimeout(() => setStatusNotice(null), 3000);
        }}
      />

      {/* Leave Without Saving Confirmation Modal */}
      <ConfirmationModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirm={() => {
          setIsLeaveModalOpen(false);
          navigate('/dashboard');
        }}
        title="Leave Without Saving?"
        message={`You have unsaved notations in "${title || 'স্বরলিপি'}". If you leave now, your changes will be discarded.`}
        subMessage="Save your work before leaving to keep it in your Swaralipi library."
        confirmText="Leave Without Saving"
        cancelText="Keep Editing"
        variant="warning"
        sheetPreview={{
          title,
          taal: TAALS[taal]?.name || taal,
          bpm
        }}
      />

      {/* Clear Notes Confirmation Modal */}
      <ConfirmationModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={handleConfirmClearSheet}
        title="Clear All Notes?"
        message="Are you sure you want to clear all swaras and lyrics from this sheet?"
        subMessage="This will reset the entire notation grid back to empty beats."
        confirmText="Clear All Notes"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Share via WhatsApp Modal (Desktop & Fallback Flow) */}
      {shareModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setShareModalData(null)}
          />

          {/* Modal Card */}
          <div className="relative z-10 bg-gray-900 border border-gray-700/80 rounded-3xl max-w-lg w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="shrink-0 p-4 sm:px-6 border-b border-gray-800 bg-gray-950/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
                  <WhatsAppIcon className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Share Swaralipi via WhatsApp</h3>
                  <p className="text-xs text-gray-400">High-resolution image ready to send</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareModalData(null)}
                className="text-gray-400 hover:text-white p-1.5 rounded-xl hover:bg-gray-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4 custom-scrollbar">
              {/* Clipboard Status Banner */}
              {copiedToClipboard ? (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-2xl text-xs text-emerald-300 flex items-start gap-2.5 shadow-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Image copied to your clipboard!</p>
                    <p className="text-emerald-400/90 text-[11px] mt-0.5 leading-relaxed">
                      Open WhatsApp Web below, choose your student or group chat, and simply press <strong>Ctrl + V</strong> (or Command + V) to paste and send the image instantly.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-2xl text-xs text-purple-200 flex items-center gap-2.5">
                  <WhatsAppIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-[11px] leading-relaxed">
                    Open WhatsApp Web below, then drag-and-drop the downloaded image or paste it into your student or group chat.
                  </p>
                </div>
              )}

              {/* High-Res Sheet Image Preview */}
              <div className="relative rounded-2xl border border-gray-700 bg-white p-2.5 overflow-hidden shadow-inner flex flex-col items-center justify-center">
                <img
                  src={shareModalData.imgUrl}
                  alt="Swaralipi Sheet Preview"
                  className="w-full max-h-56 object-contain rounded-lg shadow-sm"
                />
                <div className="absolute bottom-3 right-3 px-2 py-0.5 bg-gray-900/90 text-[10px] font-bold text-white rounded-md backdrop-blur border border-gray-700">
                  JPEG Image (Portrait HD)
                </div>
              </div>

              {/* Primary Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {/* Open WhatsApp Web */}
                <a
                  href={`https://web.whatsapp.com/send?text=${encodeURIComponent(
                    `🎶 *${title || 'স্বরলিপি'}*\nতাল: ${currentTaalObj.name} | স্কেল: ${SCALE_OPTIONS.find(s => s.value === scaleOffset)?.label || ''}\nআলাপী মিউজিক স্টুডিও`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold shadow-lg shadow-emerald-950/40 transition-all active:scale-95"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  <span>Open WhatsApp Web</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                {/* Download Image Button */}
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = shareModalData.imgUrl;
                    a.download = shareModalData.fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-950/40 transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Image (JPEG)</span>
                </button>
              </div>

              {/* Secondary Action: Copy Image to Clipboard */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (navigator.clipboard && window.ClipboardItem) {
                      await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': shareModalData.pngBlob || shareModalData.blob })
                      ]);
                      setCopiedToClipboard(true);
                    }
                  } catch (err) {
                    console.warn("Clipboard copy failed:", err);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition-all"
              >
                {copiedToClipboard ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedToClipboard ? 'Copied to Clipboard! (Press Ctrl+V in WhatsApp)' : 'Copy Image to Clipboard'}</span>
              </button>
            </div>

            {/* Modal Footer */}
            <div className="shrink-0 p-3 sm:px-6 border-t border-gray-800 bg-gray-950/60 flex items-center justify-between text-xs text-gray-400">
              <span className="truncate max-w-[280px] font-mono text-[11px]">{shareModalData.fileName}</span>
              <button
                type="button"
                onClick={() => setShareModalData(null)}
                className="text-gray-300 hover:text-white font-semibold px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Off-Screen Container specifically for generating high-res WhatsApp Portrait Image */}
      <div
        ref={exportContainerRef}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '800px',
          minHeight: '1100px',
          backgroundColor: '#ffffff',
          color: '#111827',
          padding: '36px 36px 28px',
          boxSizing: 'border-box',
          zIndex: -999,
          fontFamily: "'Noto Sans Bengali', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}
      >
        {/* Printable Score Header */}
        <div className="border-b-2 border-purple-600 pb-3 mb-5 shrink-0">
          <h1 className="text-3xl font-extrabold text-gray-900 font-bengali tracking-tight pb-1">
            {title || 'স্বরলিপি'}
          </h1>
          <div className="flex items-center gap-3 text-xs font-semibold text-gray-600 mt-1 flex-wrap">
            <span>তাল: <strong className="text-gray-900">{currentTaalObj.name}</strong></span>
            <span>•</span>
            <span>স্কেল: <strong className="text-gray-900">{SCALE_OPTIONS.find(s => s.value === scaleOffset)?.label}</strong></span>
            <span>•</span>
            <span>লয়: <strong className="text-gray-900">{bpm} BPM</strong></span>
            {teacherName && (
              <>
                <span>•</span>
                <span>শিক্ষক: <strong className="text-gray-900">{teacherName}</strong></span>
              </>
            )}
          </div>
        </div>

        {/* Rows Container */}
        <div className="space-y-4 flex-1">
          {exportRows.map((row, rIdx) => (
            <div key={rIdx} className="export-swara-row-wrap pb-2 border-b border-dashed border-gray-300">
              <div className="export-swara-row relative flex items-stretch gap-1.5 pt-1 min-w-full">
                {/* Meend SVG Arc Layer */}
                <svg className="export-meend-svg absolute top-[44px] left-0 w-full h-4 pointer-events-none overflow-visible z-10" />

                {/* Line Index */}
                <div className="w-5 text-xs font-bold text-gray-500 flex items-center justify-center shrink-0">
                  {rIdx + 1}
                </div>

                {/* Cells */}
                {row.map((cell, cIdx) => {
                  const isBarLine = currentTaalObj.bars.includes(cIdx);
                  return (
                    <React.Fragment key={cIdx}>
                      {isBarLine && (
                        <div className="w-[3px] bg-purple-700 my-1 rounded shrink-0" />
                      )}
                      <div
                        data-c={cIdx}
                        className="export-cell min-w-[36px] flex-1 bg-gray-50 border border-gray-300 rounded-xl p-1 flex flex-col items-center justify-between gap-1 select-none"
                      >
                        {/* Swara Display with High / Low Octave Dots */}
                        <div className="relative w-full h-8 mb-2 flex items-center justify-center font-bengali">
                          {cell.swara ? (
                            <>
                              {cell.oct >= 1 && (
                                <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[13px] text-purple-700 leading-none font-black">
                                  •
                                </span>
                              )}
                              <span className="text-gray-900 font-bengali text-[21px] font-bold leading-none">
                                {cell.swara}
                              </span>
                              {cell.oct <= -1 && (
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[13px] text-blue-700 leading-none font-black">
                                  •
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-300 text-sm leading-none">·</span>
                          )}
                        </div>

                        {/* Lyrics */}
                        <div className="w-full border-t border-gray-300 pt-1 text-center text-xs text-gray-800 font-medium truncate min-h-[18px] font-bengali">
                          {cell.lyric || ''}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}

                {/* Taal End Double Bar */}
                {taal !== 'free' && (
                  <div className="w-2 my-1 border-l-2 border-r-2 border-purple-700 shrink-0" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer with Website Link */}
        <div className="mt-auto pt-3 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-500 shrink-0">
          <div>
            <span>Akarmatrik Swaralipi notation generated on Alaapi • Practice online with Harmonium & Pitch Monitor: </span>
            <span className="font-bold text-purple-700 font-sans">https://alaapi.web.app/tuner/</span>
          </div>
          <div className="font-medium text-gray-400">
            {exportRows.length} {exportRows.length === 1 ? 'Line' : 'Lines'}
          </div>
        </div>
      </div>

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
