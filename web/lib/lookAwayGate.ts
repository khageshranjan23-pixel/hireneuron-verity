/**
 * HireNeuron Verity — Precision Look-Away State Machine v2
 *
 * v2 Enhancements:
 * - 500ms threshold (was 1s) — catches cheating much faster
 * - Direction-specific sensitivity (DOWN = 400ms, most suspicious)
 * - Escalation tracking with violation counts and cumulative time
 * - Reading pattern detection (rapid horizontal eye oscillation)
 * - Severity levels: none → mild → moderate → severe
 * - New LOOK_AWAY_SEVERE state for prolonged deviation (>3s)
 * - Lip movement / speaking alerts integrated with look-away
 */

import type { HeadPoseResult, EyeGazeResult, HeadDirection, GazeDirection } from './proctorGeometry';

export type LookAwayState =
  | 'LOOKING_FORWARD'
  | 'POSSIBLE_LOOK_AWAY'
  | 'LOOK_AWAY_CONFIRMED'
  | 'LOOK_AWAY_SEVERE'
  | 'TRACKING_UNCERTAIN';

export type LookAwayDirection = HeadDirection | GazeDirection | 'UNKNOWN';
export type LookAwaySeverity = 'none' | 'mild' | 'moderate' | 'severe';

export interface LookAwaySample {
  /** Monotonic observation timestamp in ms from performance.now() */
  tMs: number;
  /** Whether face tracking is currently confident and valid */
  trackingValid: boolean;
  /** Whether the candidate is currently blinking (EAR < 0.19) */
  isBlinking: boolean;
  /** 3D Head Pose estimation */
  headPose: HeadPoseResult | null;
  /** Iris-based Eye Gaze estimation */
  eyeGaze: EyeGazeResult | null;
}

export interface LookAwayDecision {
  state: LookAwayState;
  direction: LookAwayDirection;
  changed: boolean;
  /** True when sustained look-away has exceeded the direction-specific threshold */
  isWarning: boolean;
  /** Polite, user-friendly amber message */
  message: string;
  /** Continuous look away duration in milliseconds */
  lookAwayDurationMs: number;
  /** How many times look-away has been confirmed in this session */
  violationCount: number;
  /** Cumulative total time spent looking away across all violations (ms) */
  totalLookAwayMs: number;
  /** Whether a horizontal reading pattern (LEFT↔RIGHT oscillation) was detected */
  readingPattern: boolean;
  /** Whether candidate appears to be speaking while looking away (coaching indicator) */
  speakingWhileAway: boolean;
  /** Severity level escalation */
  severity: LookAwaySeverity;
}

export interface LookAwayGateOptions {
  /** Default threshold to trigger look-away warning (default: 500ms) */
  lookAwayThresholdMs?: number;
  /** Time required in forward-facing position to clear warning (default: 500ms) */
  recoveryThresholdMs?: number;
  /** Maximum tracking interruption before TRACKING_UNCERTAIN (default: 300ms) */
  trackingGraceMs?: number;
}

// Direction-specific thresholds — looking DOWN is most suspicious (phone reading)
const DIRECTION_THRESHOLDS: Record<string, number> = {
  'DOWN': 400,
  'DOWN_LEFT': 400,
  'DOWN_RIGHT': 400,
  'LEFT': 600,
  'RIGHT': 600,
  'UP_LEFT': 700,
  'UP_RIGHT': 700,
  'UP': 800,        // Less suspicious — natural thinking gesture
  'UNKNOWN': 600,
  'CENTER': 99999,  // Should never trigger
};

const SEVERE_THRESHOLD_MS = 3000; // 3 seconds = severe deviation

export class LookAwayGate {
  private readonly defaultThresholdMs: number;
  private readonly recoveryThresholdMs: number;
  private readonly trackingGraceMs: number;

  private lastTMs = -Infinity;
  private state: LookAwayState = 'LOOKING_FORWARD';
  private prevState: LookAwayState = 'LOOKING_FORWARD';

  private currentDirection: LookAwayDirection = 'CENTER';
  private lookAwayStartMs: number | null = null;
  private centerSinceMs: number | null = null;
  private lastTrackingValidMs: number | null = null;

  // Escalation tracking
  private _violationCount = 0;
  private _totalLookAwayMs = 0;
  private _lastViolationEndMs = 0;

  // Reading pattern detection — track recent horizontal direction changes
  private _directionHistory: { tMs: number; dir: LookAwayDirection }[] = [];
  private _readingPatternActive = false;

  // Speaking-while-away detection
  private _speakingWhileAway = false;

  constructor(opts: LookAwayGateOptions = {}) {
    this.defaultThresholdMs = opts.lookAwayThresholdMs ?? 500;
    this.recoveryThresholdMs = opts.recoveryThresholdMs ?? 500;
    this.trackingGraceMs = opts.trackingGraceMs ?? 300;
  }

  update(sample: LookAwaySample): LookAwayDecision {
    if (!Number.isFinite(sample.tMs) || sample.tMs < this.lastTMs) {
      throw new Error('Observation timestamps must be monotonically increasing (performance.now())');
    }
    this.lastTMs = sample.tMs;
    this.prevState = this.state;

    // 1. Handle Tracking Validity / Camera Failure
    if (!sample.trackingValid || !sample.headPose) {
      if (this.lastTrackingValidMs !== null && sample.tMs - this.lastTrackingValidMs > this.trackingGraceMs) {
        this.state = 'TRACKING_UNCERTAIN';
        this.currentDirection = 'UNKNOWN';
        this.lookAwayStartMs = null;
        this.centerSinceMs = null;
        return this.decision(0, sample);
      }
      // Within tracking grace period, hold previous state
      return this.decision(this.lookAwayStartMs !== null ? Math.max(0, sample.tMs - this.lookAwayStartMs) : 0, sample);
    }
    this.lastTrackingValidMs = sample.tMs;

    // 2. Natural Blink Rejection
    if (sample.isBlinking && sample.headPose.direction === 'CENTER') {
      if (this.state === 'LOOK_AWAY_CONFIRMED' || this.state === 'LOOK_AWAY_SEVERE' || this.state === 'POSSIBLE_LOOK_AWAY') {
        const duration = this.lookAwayStartMs !== null ? Math.max(0, sample.tMs - this.lookAwayStartMs) : 0;
        return this.decision(duration, sample);
      }
      this.state = 'LOOKING_FORWARD';
      this.currentDirection = 'CENTER';
      this.lookAwayStartMs = null;
      this.centerSinceMs = sample.tMs;
      return this.decision(0, sample);
    }

    // 3. Determine Instantaneous Direction (Head Pose priority, supplemented by Eye Gaze)
    let instantaneousDirection: LookAwayDirection = 'CENTER';

    if (sample.headPose.direction !== 'CENTER') {
      instantaneousDirection = sample.headPose.direction;
    } else if (
      sample.eyeGaze &&
      !sample.eyeGaze.isBlinking &&
      sample.eyeGaze.direction !== 'CENTER' &&
      sample.eyeGaze.direction !== 'UNKNOWN' &&
      sample.eyeGaze.direction !== 'BLINK' &&
      sample.eyeGaze.confidence >= 0.30  // Lowered from 0.35 for more sensitivity
    ) {
      // Eye-only glance off-screen
      instantaneousDirection = sample.eyeGaze.direction;
    }

    // Track speaking-while-away
    this._speakingWhileAway = instantaneousDirection !== 'CENTER' &&
      !!sample.eyeGaze?.isSpeaking;

    // 4. Update reading pattern detection
    this._updateReadingPattern(sample.tMs, instantaneousDirection);

    // 5. Temporal State Machine Transitions
    if (instantaneousDirection !== 'CENTER') {
      // Candidate is deviating away from center
      this.currentDirection = instantaneousDirection;
      this.centerSinceMs = null;

      if (this.lookAwayStartMs === null) {
        this.lookAwayStartMs = sample.tMs;
      }

      const elapsedLookAway = sample.tMs - this.lookAwayStartMs;

      // Get direction-specific threshold
      const dirKey = String(this.currentDirection);
      const threshold = DIRECTION_THRESHOLDS[dirKey] ?? this.defaultThresholdMs;

      if (elapsedLookAway >= SEVERE_THRESHOLD_MS) {
        // Prolonged deviation — SEVERE
        if (this.state !== 'LOOK_AWAY_SEVERE') {
          this._violationCount++;
        }
        this.state = 'LOOK_AWAY_SEVERE';
      } else if (elapsedLookAway >= threshold) {
        // Past direction-specific threshold — CONFIRMED
        if (this.state !== 'LOOK_AWAY_CONFIRMED' && this.state !== 'LOOK_AWAY_SEVERE') {
          this._violationCount++;
        }
        this.state = 'LOOK_AWAY_CONFIRMED';
      } else {
        this.state = 'POSSIBLE_LOOK_AWAY';
      }

      return this.decision(elapsedLookAway, sample);
    } else {
      // Candidate is observed looking CENTER
      if (this.centerSinceMs === null) {
        this.centerSinceMs = sample.tMs;
      }

      const elapsedCenter = sample.tMs - this.centerSinceMs;

      // Require 500ms of stable forward-facing observations to clear warning / reset
      if (elapsedCenter >= this.recoveryThresholdMs) {
        // Accumulate the look-away duration to total before resetting
        if (this.lookAwayStartMs !== null) {
          this._totalLookAwayMs += Math.max(0, sample.tMs - this.lookAwayStartMs);
          this._lastViolationEndMs = sample.tMs;
        }
        this.state = 'LOOKING_FORWARD';
        this.currentDirection = 'CENTER';
        this.lookAwayStartMs = null;
        this._speakingWhileAway = false;
        return this.decision(0, sample);
      } else {
        // Within recovery window: maintain current state
        const currentDuration = this.lookAwayStartMs !== null ? Math.max(0, sample.tMs - this.lookAwayStartMs) : 0;
        return this.decision(currentDuration, sample);
      }
    }
  }

  reset() {
    this.lastTMs = -Infinity;
    this.state = 'LOOKING_FORWARD';
    this.prevState = 'LOOKING_FORWARD';
    this.currentDirection = 'CENTER';
    this.lookAwayStartMs = null;
    this.centerSinceMs = null;
    this.lastTrackingValidMs = null;
    // Don't reset cumulative stats — they persist across the session
  }

  /** Full reset including all cumulative tracking */
  resetAll() {
    this.reset();
    this._violationCount = 0;
    this._totalLookAwayMs = 0;
    this._lastViolationEndMs = 0;
    this._directionHistory = [];
    this._readingPatternActive = false;
    this._speakingWhileAway = false;
  }

  private _updateReadingPattern(tMs: number, dir: LookAwayDirection) {
    // Only track horizontal oscillations (LEFT/RIGHT or eye-level diagonal)
    const isHorizontal = dir === 'LEFT' || dir === 'RIGHT' || dir === 'DOWN_LEFT' || dir === 'DOWN_RIGHT';
    if (isHorizontal) {
      this._directionHistory.push({ tMs, dir });
    }

    // Prune entries older than 4 seconds
    this._directionHistory = this._directionHistory.filter(d => tMs - d.tMs < 4000);

    // Count direction changes (LEFT→RIGHT or RIGHT→LEFT) within the window
    let oscillations = 0;
    for (let i = 1; i < this._directionHistory.length; i++) {
      const prev = this._directionHistory[i - 1].dir;
      const curr = this._directionHistory[i].dir;
      const isLeftish = (d: LookAwayDirection) => d === 'LEFT' || d === 'DOWN_LEFT';
      const isRightish = (d: LookAwayDirection) => d === 'RIGHT' || d === 'DOWN_RIGHT';
      if ((isLeftish(prev) && isRightish(curr)) || (isRightish(prev) && isLeftish(curr))) {
        oscillations++;
      }
    }

    // 3+ oscillations in 4 seconds = reading pattern
    this._readingPatternActive = oscillations >= 3;
  }

  private _computeSeverity(durationMs: number): LookAwaySeverity {
    if (this.state === 'LOOKING_FORWARD' || this.state === 'POSSIBLE_LOOK_AWAY') {
      return 'none';
    }
    if (this._readingPatternActive || this._violationCount >= 5 || durationMs > 5000) {
      return 'severe';
    }
    if (durationMs > 2000 || this._violationCount >= 3 || this._speakingWhileAway) {
      return 'moderate';
    }
    return 'mild';
  }

  private decision(durationMs: number, sample?: LookAwaySample): LookAwayDecision {
    const isWarning = this.state === 'LOOK_AWAY_CONFIRMED' || this.state === 'LOOK_AWAY_SEVERE';
    const severity = this._computeSeverity(durationMs);
    let message = '';

    if (isWarning) {
      const dirText =
        this.currentDirection === 'LEFT' ? 'Looking left'
        : this.currentDirection === 'RIGHT' ? 'Looking right'
        : this.currentDirection === 'UP' ? 'Looking up'
        : this.currentDirection === 'DOWN' ? 'Looking down'
        : this.currentDirection === 'DOWN_LEFT' ? 'Looking down-left'
        : this.currentDirection === 'DOWN_RIGHT' ? 'Looking down-right'
        : this.currentDirection === 'UP_LEFT' ? 'Looking up-left'
        : this.currentDirection === 'UP_RIGHT' ? 'Looking up-right'
        : '';

      if (this.state === 'LOOK_AWAY_SEVERE') {
        message = dirText
          ? `⚠️ Prolonged deviation detected. Please face the screen. (${dirText})`
          : '⚠️ Prolonged deviation detected. Please face the screen.';
      } else if (this._readingPatternActive) {
        message = '⚠️ Suspicious reading pattern detected. Please focus on the interview.';
      } else if (this._speakingWhileAway) {
        message = dirText
          ? `Speaking while looking away detected. (${dirText})`
          : 'Speaking while looking away detected.';
      } else {
        message = dirText
          ? `Please look towards the screen. (${dirText})`
          : 'Please look towards the screen.';
      }
    }

    // Compute currently-active look-away duration for totalLookAwayMs
    const activeDuration = this.lookAwayStartMs !== null ? Math.max(0, this.lastTMs - this.lookAwayStartMs) : 0;

    return {
      state: this.state,
      direction: this.currentDirection,
      changed: this.state !== this.prevState,
      isWarning,
      message,
      lookAwayDurationMs: Math.round(durationMs),
      violationCount: this._violationCount,
      totalLookAwayMs: Math.round(this._totalLookAwayMs + activeDuration),
      readingPattern: this._readingPatternActive,
      speakingWhileAway: this._speakingWhileAway,
      severity
    };
  }
}
