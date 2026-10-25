/**
 * HireNeuron Verity — Production Face Presence & Camera Observation State Machine v2
 *
 * v2 Enhancements:
 * - Tighter thresholds: 1.5s missing confirm (was 3s), 2.5s out-of-view (was 4s)
 * - Departure counting and cumulative absent time tracking
 * - Rapid toggle detection (appearing/disappearing suspiciously)
 * - FACE_PARTIALLY_OBSCURED state for covered face detection
 * - Severity levels in decisions
 *
 * States:
 * - INITIALIZING / WARMING_UP
 * - CALIBRATING
 * - FACE_PRESENT
 * - TRACKING_UNCERTAIN
 * - FACE_NOT_VISIBLE
 * - FACE_PARTIALLY_OBSCURED (new v2)
 * - PERSON_OUT_OF_VIEW_CONFIRMED
 * - CAMERA_CONNECTION_LOST / COVERAGE_GAP
 * - MONITORING_UNAVAILABLE
 */

export type PresenceState =
  | 'INITIALIZING'
  | 'CALIBRATING'
  | 'FACE_PRESENT'
  | 'TRACKING_UNCERTAIN'
  | 'FACE_NOT_VISIBLE'
  | 'FACE_PARTIALLY_OBSCURED'
  | 'PERSON_OUT_OF_VIEW_CONFIRMED'
  | 'CAMERA_CONNECTION_LOST'
  | 'MONITORING_UNAVAILABLE';

export type PresenceSeverity = 'none' | 'low' | 'medium' | 'high';

export interface PresenceSample {
  /** Monotonic observation timestamp in ms from performance.now() */
  tMs: number;
  /** Whether the video element is actively decoding fresh, advancing frames */
  freshFrame: boolean;
  /** Whether the MediaStreamTrack is live and unmuted */
  cameraLive: boolean;
  /** Whether primary landmark detector found a face. null = error/unknown, NOT no-face */
  landmarksFace: boolean | null;
  /** Independent secondary face detector result; null = not run / unavailable */
  fallbackFace: boolean | null;
  /** Independent person / torso presence; null = unknown, true = body visible, false = body absent */
  personVisible: boolean | null;
  /** Whether manual or initial posture calibration is active */
  isCalibrating?: boolean;
}

export interface PresenceDecision {
  state: PresenceState;
  changed: boolean;
  /** Calm, professional message for candidate UI */
  message: string;
  /** True only when evidence corroborates the person physically left camera view */
  confirmedOutOfView: boolean;
  /** Elapsed duration of face missing in milliseconds, if applicable */
  faceMissingMs: number;
  /** Consecutive positive face detection streak */
  positiveStreak: number;
  /** How many times the person has departed camera view */
  departureCount: number;
  /** Cumulative time spent absent (ms) */
  totalAbsentMs: number;
  /** Times person appeared/disappeared rapidly (suspicious toggle behavior) */
  rapidToggleCount: number;
  /** Severity assessment */
  severity: PresenceSeverity;
}

export interface PresenceGateOptions {
  warmingUpMs?: number;
  missingConfirmMs?: number;
  outOfViewConfirmMs?: number;
  presentGraceMs?: number;
}

export class FacePresenceGate {
  private readonly startMs: number;
  private readonly warmingUpMs: number;
  private readonly missingConfirmMs: number;
  private readonly outOfViewConfirmMs: number;
  private readonly presentGraceMs: number;

  private lastTMs = -Infinity;
  private lastFreshMs: number;
  private faceMissingSince: number | null = null;
  private personMissingSince: number | null = null;
  private positiveStreak = 0;
  private lastPositiveFaceMs: number | null = null;

  private state: PresenceState = 'INITIALIZING';
  private prevState: PresenceState = 'INITIALIZING';

  // v2: Departure and absence tracking
  private _departureCount = 0;
  private _totalAbsentMs = 0;
  private _lastDepartureStartMs: number | null = null;
  private _wasPresent = false;

  // v2: Rapid toggle detection
  private _departureTimestamps: number[] = [];
  private _rapidToggleCount = 0;

  constructor(startMs: number, opts: PresenceGateOptions = {}) {
    this.startMs = startMs;
    this.lastFreshMs = startMs;
    this.warmingUpMs = opts.warmingUpMs ?? 1000;          // was 1800 → faster startup
    this.missingConfirmMs = opts.missingConfirmMs ?? 1500; // was 3000 → faster detection
    this.outOfViewConfirmMs = opts.outOfViewConfirmMs ?? 2500; // was 4000 → faster confirmation
    this.presentGraceMs = opts.presentGraceMs ?? 400;      // was 800 → less lenient
  }

  update(input: PresenceSample): PresenceDecision {
    if (!Number.isFinite(input.tMs) || input.tMs < this.lastTMs) {
      throw new Error('Use monotonically increasing observation timestamps (performance.now())');
    }
    this.lastTMs = input.tMs;
    this.prevState = this.state;

    // 1. Camera track connection lost or frame decoding stalled
    if (!input.cameraLive || !input.freshFrame) {
      this.state = 'CAMERA_CONNECTION_LOST';
      this.resetMissingEvidence();
      return this.buildDecision();
    }
    this.lastFreshMs = input.tMs;

    // 2. Active calibration mode
    if (input.isCalibrating) {
      this.state = 'CALIBRATING';
      this.resetMissingEvidence();
      return this.buildDecision();
    }

    // 3. Positive face evidence from either primary landmarks OR fallback detector
    const someFace = input.landmarksFace === true || input.fallbackFace === true;
    const landmarksMissed = input.landmarksFace === false;
    const fallbackFoundFace = input.fallbackFace === true;
    const bothFaceDetectorsSayNo = input.landmarksFace === false && input.fallbackFace === false;

    if (someFace) {
      // Track return from absence
      if (!this._wasPresent && this._lastDepartureStartMs !== null) {
        const absentDuration = input.tMs - this._lastDepartureStartMs;
        this._totalAbsentMs += absentDuration;
        this._lastDepartureStartMs = null;
      }
      this._wasPresent = true;

      this.resetMissingEvidence();
      this.positiveStreak += 1;
      this.lastPositiveFaceMs = input.tMs;

      // v2: Detect FACE_PARTIALLY_OBSCURED — fallback sees face but landmarks fail
      // This means the face is partially covered (hand over mouth, chin covered, etc.)
      if (landmarksMissed && fallbackFoundFace) {
        this.state = 'FACE_PARTIALLY_OBSCURED';
        return this.buildDecision();
      }

      // Require 2 consecutive positive frames to confirm full recovery from uncertainty
      this.state = this.positiveStreak >= 2 ? 'FACE_PRESENT' : 'TRACKING_UNCERTAIN';
      return this.buildDecision();
    }
    this.positiveStreak = 0;

    // 4. Temporary visibility dropout grace period
    if (
      this.prevState === 'FACE_PRESENT' &&
      this.lastPositiveFaceMs !== null &&
      input.tMs - this.lastPositiveFaceMs < this.presentGraceMs
    ) {
      if (bothFaceDetectorsSayNo) {
        if (this.faceMissingSince === null) this.faceMissingSince = input.tMs;
        if (input.personVisible === false && this.personMissingSince === null) {
          this.personMissingSince = input.tMs;
        }
      }
      this.state = 'FACE_PRESENT';
      return this.buildDecision();
    }

    // 5. Initial warming up period
    if (input.tMs - this.startMs < this.warmingUpMs) {
      this.state = 'INITIALIZING';
      return this.buildDecision();
    }

    // 6. Unknown / Detector Exception / Uncertainty
    if (!bothFaceDetectorsSayNo) {
      this.resetMissingEvidence();
      this.state = 'TRACKING_UNCERTAIN';
      return this.buildDecision();
    }

    // 7. Sustained absence evaluation
    if (this.faceMissingSince === null) this.faceMissingSince = input.tMs;
    const missingMs = input.tMs - this.faceMissingSince;

    // Track departure
    if (this._wasPresent && this._lastDepartureStartMs === null) {
      this._wasPresent = false;
      this._departureCount++;
      this._lastDepartureStartMs = input.tMs;
      this._recordDeparture(input.tMs);
    }

    // A person visibly present with head turned away or chin covered is FACE_NOT_VISIBLE
    if (input.personVisible !== false) {
      this.personMissingSince = null;
      this.state = missingMs >= this.missingConfirmMs
        ? 'FACE_NOT_VISIBLE'
        : 'TRACKING_UNCERTAIN';
      return this.buildDecision();
    }

    // Both face missing AND body missing
    if (this.personMissingSince === null) this.personMissingSince = input.tMs;
    const personMissingMs = input.tMs - this.personMissingSince;

    if (missingMs >= this.outOfViewConfirmMs && personMissingMs >= this.outOfViewConfirmMs) {
      this.state = 'PERSON_OUT_OF_VIEW_CONFIRMED';
    } else if (missingMs >= this.missingConfirmMs) {
      this.state = 'FACE_NOT_VISIBLE';
    } else {
      this.state = 'TRACKING_UNCERTAIN';
    }

    return this.buildDecision();
  }

  reset() {
    this.resetMissingEvidence();
    this.positiveStreak = 0;
    this.lastPositiveFaceMs = null;
    this.state = 'INITIALIZING';
    this.prevState = 'INITIALIZING';
  }

  /** Full reset including cumulative tracking */
  resetAll() {
    this.reset();
    this._departureCount = 0;
    this._totalAbsentMs = 0;
    this._lastDepartureStartMs = null;
    this._wasPresent = false;
    this._departureTimestamps = [];
    this._rapidToggleCount = 0;
  }

  private resetMissingEvidence() {
    this.faceMissingSince = null;
    this.personMissingSince = null;
  }

  private _recordDeparture(tMs: number) {
    this._departureTimestamps.push(tMs);
    // Keep only departures within last 60 seconds
    this._departureTimestamps = this._departureTimestamps.filter(t => tMs - t < 60000);
    // 3+ departures in 60 seconds = rapid toggling
    if (this._departureTimestamps.length >= 3) {
      this._rapidToggleCount = this._departureTimestamps.length;
    }
  }

  private _computeSeverity(): PresenceSeverity {
    if (
      this.state === 'FACE_PRESENT' ||
      this.state === 'CALIBRATING' ||
      this.state === 'INITIALIZING'
    ) {
      return 'none';
    }

    const currentAbsentMs = this._lastDepartureStartMs !== null
      ? Math.max(0, this.lastTMs - this._lastDepartureStartMs)
      : 0;
    const totalAbsent = this._totalAbsentMs + currentAbsentMs;

    if (totalAbsent > 8000 || this._departureCount >= 3 || this._rapidToggleCount >= 3) {
      return 'high';
    }
    if (totalAbsent > 3000 || this._departureCount >= 2 || this.state === 'FACE_PARTIALLY_OBSCURED') {
      return 'medium';
    }
    // Any non-present, non-initializing state is at least low severity
    return 'low';
  }

  private buildDecision(): PresenceDecision {
    const messages: Record<PresenceState, string> = {
      INITIALIZING: 'Camera monitoring starting…',
      CALIBRATING: 'Adjusting posture baseline…',
      FACE_PRESENT: 'Camera ready · Monitoring active',
      TRACKING_UNCERTAIN: 'Checking camera view…',
      FACE_NOT_VISIBLE: 'Face temporarily not clearly visible; adjust position if needed',
      FACE_PARTIALLY_OBSCURED: 'Face partially covered — please ensure full face is visible',
      PERSON_OUT_OF_VIEW_CONFIRMED: 'Please return to camera view',
      CAMERA_CONNECTION_LOST: 'Camera connection interrupted',
      MONITORING_UNAVAILABLE: 'Monitoring temporarily unavailable'
    };

    const faceMissingMs = this.faceMissingSince !== null ? Math.max(0, this.lastTMs - this.faceMissingSince) : 0;
    const currentAbsentMs = this._lastDepartureStartMs !== null
      ? Math.max(0, this.lastTMs - this._lastDepartureStartMs)
      : 0;

    return {
      state: this.state,
      changed: this.state !== this.prevState,
      message: messages[this.state] || 'Camera monitoring active',
      confirmedOutOfView: this.state === 'PERSON_OUT_OF_VIEW_CONFIRMED',
      faceMissingMs,
      positiveStreak: this.positiveStreak,
      departureCount: this._departureCount,
      totalAbsentMs: Math.round(this._totalAbsentMs + currentAbsentMs),
      rapidToggleCount: this._rapidToggleCount,
      severity: this._computeSeverity()
    };
  }
}
