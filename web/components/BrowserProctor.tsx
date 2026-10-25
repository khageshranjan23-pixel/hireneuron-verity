'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Maximize2, Minimize2, Copy, EyeOff } from 'lucide-react';

export default function BrowserProctor({
  onViolation
}: {
  onViolation?: (warning: string, severity: 'NEEDS_REVIEW' | 'NEEDS_REVIEW_HIGH' | 'OBSERVED_EVENT') => void;
}) {
  const [warning, setWarning] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    const onFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);

      if (!isNowFullscreen) {
        const warningMsg = 'Fullscreen exited. Please remain in fullscreen during interview.';
        setWarning('⚠️ ' + warningMsg);
        onViolation?.(warningMsg, 'NEEDS_REVIEW');
      } else {
        setWarning('');
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        const warningMsg = 'Tab switch detected: Candidate navigated away from interview.';
        setWarning('⚠️ ' + warningMsg);
        onViolation?.(warningMsg, 'NEEDS_REVIEW_HIGH');
      } else {
        setTimeout(() => setWarning(''), 3000);
      }
    };

    const onBlur = () => {
      if (document.hidden) {
        const warningMsg = 'Please keep the interview window active.';
        setWarning('ℹ️ ' + warningMsg);
      }
    };

    const onFocus = () => {
      setWarning('');
    };

    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      const warningMsg = 'Copying text is restricted during proctored interview.';
      setWarning('⚠️ ' + warningMsg);
      onViolation?.(warningMsg, 'NEEDS_REVIEW');
      setTimeout(() => setWarning(''), 3000);
    };

    const onCut = (e: ClipboardEvent) => {
      e.preventDefault();
      const warningMsg = 'Cutting text is restricted during proctored interview.';
      setWarning('⚠️ ' + warningMsg);
      onViolation?.(warningMsg, 'NEEDS_REVIEW');
      setTimeout(() => setWarning(''), 3000);
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const warningMsg = 'Pasting external content is restricted.';
      setWarning('⚠️ ' + warningMsg);
      onViolation?.(warningMsg, 'NEEDS_REVIEW');
      setTimeout(() => setWarning(''), 3000);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [onViolation]);

  return (
    <>
      {warning && (
        <div className="browserWarningToast">
          <AlertTriangle size={20} className="warningIconPulse" />
          <div className="toastText">
            <strong>Proctoring Notice</strong>
            <span>{warning}</span>
          </div>
        </div>
      )}

      {!isFullscreen && (
        <button
          onClick={enterFullscreen}
          type="button"
          className="fullscreenPromptBtn"
          title="Enter Fullscreen for optimal proctoring integrity"
        >
          <Maximize2 size={14} />
          <span>Enter Fullscreen</span>
        </button>
      )}
    </>
  );
}
