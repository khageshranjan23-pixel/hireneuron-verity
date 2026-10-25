'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { AlertTriangle, Maximize2, Minimize2, Copy, EyeOff, Shield, Monitor } from 'lucide-react';

/**
 * HireNeuron Verity — Browser-Level Proctoring Engine v2
 *
 * v2 Enhancements over v1:
 * - Right-click context menu blocking
 * - Keyboard shortcut detection (Ctrl+C/V/P/S/F, F12, PrintScreen, Alt+Tab)
 * - Window resize / split-screen detection
 * - DevTools open detection (outer-inner size heuristic)
 * - Mouse leaving window detection
 * - Network online/offline monitoring
 * - Cumulative violation counter and time-away tracking
 * - Enhanced warning UI with violation count badge
 */

interface BrowserViolation {
  type: string;
  message: string;
  severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT';
  timestamp: number;
}

export default function BrowserProctor({
  onViolation
}: {
  onViolation?: (warning: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT') => void;
}) {
  const [warning, setWarning] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [awayTimeMs, setAwayTimeMs] = useState(0);

  const awayStartRef = useRef<number | null>(null);
  const awayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastViolationRef = useRef<Map<string, number>>(new Map());
  const devToolsOpenRef = useRef(false);
  const initialScreenRef = useRef({ width: 0, height: 0 });

  // Throttled violation dispatch (2s dedup per type)
  const dispatchViolation = useCallback((type: string, msg: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT') => {
    const now = Date.now();
    const lastTime = lastViolationRef.current.get(type) || 0;
    if (now - lastTime > 2000) {
      lastViolationRef.current.set(type, now);
      setViolationCount(c => c + 1);
      setWarning('⚠️ ' + msg);
      onViolation?.(msg, severity);
      setTimeout(() => setWarning(prev => prev.includes(msg) ? '' : prev), 4000);
    }
  }, [onViolation]);

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
      setWarning('');
    } catch {
      setWarning('⚠️ Fullscreen permission denied');
    }
  };

  useEffect(() => {
    // Store initial screen dimensions
    initialScreenRef.current = {
      width: window.screen.availWidth,
      height: window.screen.availHeight
    };

    // ─── 1. Fullscreen Change ────────────────────────────────────────────
    const onFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      if (!isNowFullscreen) {
        dispatchViolation('FULLSCREEN_EXIT', 'Fullscreen exited. Please remain in fullscreen during interview.', 'NEEDS_REVIEW');
      }
    };

    // ─── 2. Tab Switch (Visibility Change) ───────────────────────────────
    const onVisibilityChange = () => {
      if (document.hidden) {
        awayStartRef.current = Date.now();
        // Start tracking away time
        awayTimerRef.current = setInterval(() => {
          if (awayStartRef.current) {
            setAwayTimeMs(Date.now() - awayStartRef.current);
          }
        }, 100);
        dispatchViolation('TAB_SWITCH', 'Tab switch detected: Candidate navigated away from interview.', 'NEEDS_REVIEW_HIGH');
      } else {
        // Calculate total away time
        if (awayStartRef.current) {
          const duration = Date.now() - awayStartRef.current;
          awayStartRef.current = null;
          if (awayTimerRef.current) clearInterval(awayTimerRef.current);
          setAwayTimeMs(0);
          if (duration > 3000) {
            dispatchViolation('TAB_SWITCH_PROLONGED', `Candidate was away from interview tab for ${(duration / 1000).toFixed(1)}s`, 'NEEDS_REVIEW_HIGH');
          }
        }
        setTimeout(() => setWarning(''), 3000);
      }
    };

    // ─── 3. Window Blur / Focus ──────────────────────────────────────────
    const onBlur = () => {
      if (!document.hidden) {
        dispatchViolation('WINDOW_BLUR', 'Interview window lost focus — possible Alt+Tab or window switch.', 'NEEDS_REVIEW');
      }
    };

    const onFocus = () => {
      if (!document.hidden) {
        setTimeout(() => setWarning(prev => prev.includes('focus') ? '' : prev), 2000);
      }
    };

    // ─── 4. Clipboard Operations ─────────────────────────────────────────
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      dispatchViolation('COPY_ATTEMPT', 'Copying text is restricted during proctored interview.', 'NEEDS_REVIEW');
    };

    const onCut = (e: ClipboardEvent) => {
      e.preventDefault();
      dispatchViolation('CUT_ATTEMPT', 'Cutting text is restricted during proctored interview.', 'NEEDS_REVIEW');
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      dispatchViolation('PASTE_ATTEMPT', 'Pasting external content is restricted.', 'NEEDS_REVIEW');
    };

    // ─── 5. Right-Click Context Menu ─────────────────────────────────────
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      dispatchViolation('CONTEXT_MENU', 'Right-click is disabled during proctored interview.', 'OBSERVED_EVENT');
    };

    // ─── 6. Keyboard Shortcut Detection ──────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      // DevTools: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (e.key === 'F12' || (ctrl && e.shiftKey && (key === 'i' || key === 'j' || key === 'c'))) {
        e.preventDefault();
        dispatchViolation('DEVTOOLS_SHORTCUT', 'Developer tools shortcut detected — this is not allowed.', 'NEEDS_REVIEW_HIGH');
        return;
      }

      // Print: Ctrl+P
      if (ctrl && key === 'p') {
        e.preventDefault();
        dispatchViolation('PRINT_ATTEMPT', 'Printing is restricted during proctored interview.', 'NEEDS_REVIEW');
        return;
      }

      // Save: Ctrl+S
      if (ctrl && key === 's') {
        e.preventDefault();
        dispatchViolation('SAVE_ATTEMPT', 'Saving page is restricted during proctored interview.', 'OBSERVED_EVENT');
        return;
      }

      // Find: Ctrl+F
      if (ctrl && key === 'f') {
        e.preventDefault();
        dispatchViolation('FIND_ATTEMPT', 'Find/search is restricted during proctored interview.', 'OBSERVED_EVENT');
        return;
      }

      // Select All: Ctrl+A (suspicious in interview context)
      if (ctrl && key === 'a') {
        e.preventDefault();
        dispatchViolation('SELECT_ALL', 'Select-all is restricted during proctored interview.', 'OBSERVED_EVENT');
        return;
      }

      // Screenshot: PrintScreen
      if (e.key === 'PrintScreen') {
        dispatchViolation('SCREENSHOT_ATTEMPT', 'Screenshot key detected — this is monitored.', 'NEEDS_REVIEW');
        return;
      }

      // Alt+Tab (detected as Alt keydown when focus will shift)
      if (e.altKey && key === 'tab') {
        dispatchViolation('ALT_TAB', 'Alt+Tab detected — possible application switching.', 'NEEDS_REVIEW');
        return;
      }

      // Ctrl+Tab (tab switching)
      if (ctrl && key === 'tab') {
        dispatchViolation('CTRL_TAB', 'Ctrl+Tab detected — tab switching attempt.', 'NEEDS_REVIEW');
        return;
      }

      // Escape (potential fullscreen exit intent)
      if (e.key === 'Escape' && document.fullscreenElement) {
        dispatchViolation('ESCAPE_KEY', 'Escape key pressed — fullscreen exit attempt.', 'OBSERVED_EVENT');
        return;
      }
    };

    // ─── 7. Window Resize / Split-Screen Detection ───────────────────────
    const onResize = () => {
      const screenW = window.screen.availWidth;
      const screenH = window.screen.availHeight;
      const winW = window.outerWidth;
      const winH = window.outerHeight;

      // If window is less than 80% of screen width or height, suspect split-screen
      if (winW < screenW * 0.8 || winH < screenH * 0.8) {
        dispatchViolation('WINDOW_RESIZE', `Window resized to ${Math.round(winW/screenW*100)}% width — possible split-screen layout.`, 'NEEDS_REVIEW');
      }
    };

    // ─── 8. DevTools Detection (outer vs inner size heuristic) ───────────
    let devToolsInterval: NodeJS.Timeout | null = null;
    devToolsInterval = setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      // Typical browser chrome is ~100-200px. DevTools adds 300+ px
      const devToolsLikelyOpen = widthDiff > 300 || heightDiff > 300;

      if (devToolsLikelyOpen && !devToolsOpenRef.current) {
        devToolsOpenRef.current = true;
        dispatchViolation('DEVTOOLS_DETECTED', 'Developer tools appear to be open — this is monitored.', 'NEEDS_REVIEW_HIGH');
      } else if (!devToolsLikelyOpen && devToolsOpenRef.current) {
        devToolsOpenRef.current = false;
      }
    }, 1000);

    // ─── 9. Mouse Leaving Window ─────────────────────────────────────────
    const onMouseLeave = (e: MouseEvent) => {
      // Only trigger if mouse actually left the viewport (not just moved to a scrollbar)
      if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        dispatchViolation('MOUSE_LEFT_WINDOW', 'Mouse cursor left the interview window.', 'OBSERVED_EVENT');
      }
    };

    // ─── 10. Network Online/Offline ──────────────────────────────────────
    const onOffline = () => {
      dispatchViolation('NETWORK_OFFLINE', 'Network connection lost — candidate went offline.', 'NEEDS_REVIEW');
    };

    const onOnline = () => {
      // Just a note, not a violation
      setWarning('ℹ️ Network connection restored.');
      setTimeout(() => setWarning(''), 3000);
    };

    // ─── Register All Event Listeners ────────────────────────────────────
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('resize', onResize);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (devToolsInterval) clearInterval(devToolsInterval);
      if (awayTimerRef.current) clearInterval(awayTimerRef.current);
    };
  }, [dispatchViolation]);

  return (
    <>
      {/* Warning Toast with Violation Count */}
      {warning && (
        <div className="browserWarningToast" style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100001,
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          color: '#ffffff',
          padding: '12px 24px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          maxWidth: 500,
          boxShadow: '0 8px 32px rgba(220, 38, 38, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          animation: 'fadeIn 0.2s ease-in-out',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          <AlertTriangle size={20} className="warningIconPulse" />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85 }}>
              Browser Security Alert
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>{warning}</span>
          </div>
          {violationCount > 0 && (
            <span style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              {violationCount} alert{violationCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Away Time Indicator */}
      {awayTimeMs > 0 && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100002,
          background: 'rgba(0, 0, 0, 0.95)',
          color: '#ef4444',
          padding: '40px 60px',
          borderRadius: 16,
          textAlign: 'center',
          fontSize: 28,
          fontWeight: 800,
          boxShadow: '0 0 80px rgba(239, 68, 68, 0.3)',
          border: '2px solid #ef4444'
        }}>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '2px' }}>
            ⚠️ You are away from the interview
          </div>
          <div>{(awayTimeMs / 1000).toFixed(1)}s</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 12 }}>
            Please return to the interview tab immediately.
          </div>
        </div>
      )}

      {/* Fullscreen Prompt Button */}
      {!isFullscreen && (
        <button
          onClick={enterFullscreen}
          type="button"
          className="fullscreenPromptBtn"
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 99998,
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
          }}
          title="Enter Fullscreen for optimal proctoring integrity"
        >
          <Maximize2 size={14} />
          <span>Enter Fullscreen</span>
        </button>
      )}

      {/* Persistent Violation Counter Badge */}
      {violationCount > 0 && !warning && (
        <div style={{
          position: 'fixed',
          top: 80,
          right: 24,
          zIndex: 99997,
          background: violationCount >= 5 ? '#dc2626' : violationCount >= 3 ? '#ea580c' : '#64748b',
          color: 'white',
          padding: '4px 10px',
          borderRadius: 16,
          fontSize: 11,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          opacity: 0.9
        }}>
          <Shield size={12} />
          {violationCount} browser alert{violationCount !== 1 ? 's' : ''}
        </div>
      )}
    </>
  );
}
