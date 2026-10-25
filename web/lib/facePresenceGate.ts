/**
 * HireNeuron Verity — Production Face Presence & Camera Observation State Machine
 *
 * Implements a robust temporal state machine separating:
 * - INITIALIZING / WARMING_UP
 * - CALIBRATING
 * - FACE_PRESENT
 * - TRACKING_UNCERTAIN
 * - FACE_NOT_VISIBLE
 * - PERSON_OUT_OF_VIEW_CONFIRMED
 * - CAMERA_CONNECTION_LOST / COVERAGE_GAP
 * - MONITORING_UNAVAILABLE
 *
 * Driven by monotonic performance.now() timestamps and decoded frame freshness.
 * Never treats a single dropped frame, detection error, or temporary glance as candidate absence.
 */

export type PresenceState =
  | 'INITIALIZING'
  | 'CALIBRATING'
  | 'FACE_PRESENT'
  | 'TRACKING_UNCERTAIN'
  | 'FACE_NOT_VISIBLE'
  | 'PERSON_OUT_OF_VIEW_CONFIRMED'
  | 'CAMERA_CONNECTION_LOST'
  | 'MONITORING_UNAVAILABLE';

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

  constructor(startMs: number, opts: PresenceGateOptions = {}) {
    this.startMs = startMs;
    this.lastFreshMs = startMs;
    this.warmingUpMs = opts.warmingUpMs ?? 1800;
    this.missingConfirmMs = opts.missingConfirmMs ?? 3000;
    this.outOfViewConfirmMs = opts.outOfViewConfirmMs ?? 4000;
    this.presentGraceMs = opts.presentGraceMs ?? 800;
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
      return this.decision();
    }
    this.lastFreshMs = input.tMs;

    // 2. Active calibration mode
    if (input.isCalibrating) {
      this.state = 'CALIBRATING';
      this.resetMissingEvidence();
      return this.decision();
    }

    // 3. Positive face evidence from either primary landmarks OR fallback detector
    const someFace = input.landmarksFace === true || input.fallbackFace === true;
    const bothFaceDetectorsSayNo = input.landmarksFace === false && input.fallbackFace === false;

    if (someFace) {
      this.resetMissingEvidence();
      this.positiveStreak += 1;
      this.lastPositiveFaceMs = input.tMs;
      // Require 2 consecutive positive frames to confirm full recovery from uncertainty
      this.state = this.positiveStreak >= 2 ? 'FACE_PRESENT' : 'TRACKING_UNCERTAIN';
      return this.decision();
    }
    this.positiveStreak = 0;

    // 4. Temporary visibility dropout grace period (avoids UI flicker on brief blinks / micro-glances)
    // Hold previous FACE_PRESENT status for up to presentGraceMs if camera is live
    if (
      this.prevState === 'FACE_PRESENT' &&
      this.lastPositiveFaceMs !== null &&
      input.tMs - this.lastPositiveFaceMs < this.presentGraceMs
    ) {
      // Begin counting reliable negative evidence in background
      if (bothFaceDetectorsSayNo) {
        if (this.faceMissingSince === null) this.faceMissingSince = input.tMs;
        if (input.personVisible === false && this.personMissingSince === null) {
          this.personMissingSince = input.tMs;
        }
      }
      this.state = 'FACE_PRESENT';
      return this.decision();
    }

    // 5. Initial warming up period
    if (input.tMs - this.startMs < this.warmingUpMs) {
      this.state = 'INITIALIZING';
      return this.decision();
    }

    // 6. Unknown / Detector Exception / Uncertainty (Lack of result is NOT absence)
    if (!bothFaceDetectorsSayNo) {
      this.resetMissingEvidence();
      this.state = 'TRACKING_UNCERTAIN';
      return this.decision();
    }

    // 7. Sustained absence evaluation
    if (this.faceMissingSince === null) this.faceMissingSince = input.tMs;
    const missingMs = input.tMs - this.faceMissingSince;

    // A person visibly present with head turned away or chin covered is FACE_NOT_VISIBLE, NOT out of view
    if (input.personVisible !== false) {
      this.personMissingSince = null;
      this.state = missingMs >= this.missingConfirmMs
        ? 'FACE_NOT_VISIBLE'
        : 'TRACKING_UNCERTAIN';
      return this.decision();
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

    return this.decision();
  }

  reset() {
    this.resetMissingEvidence();
    this.positiveStreak = 0;
    this.lastPositiveFaceMs = null;
    this.state = 'INITIALIZING';
    this.prevState = 'INITIALIZING';
  }

  private resetMissingEvidence() {
    this.faceMissingSince = null;
    this.personMissingSince = null;
  }

  private decision(): PresenceDecision {
    const messages: Record<PresenceState, string> = {
      INITIALIZING: 'Camera monitoring starting…',
      CALIBRATING: 'Adjusting posture baseline…',
      FACE_PRESENT: 'Camera ready · Monitoring active',
      TRACKING_UNCERTAIN: 'Checking camera view…',
      FACE_NOT_VISIBLE: 'Face temporarily not clearly visible; adjust position if needed',
      PERSON_OUT_OF_VIEW_CONFIRMED: 'Please return to camera view',
      CAMERA_CONNECTION_LOST: 'Camera connection interrupted',
      MONITORING_UNAVAILABLE: 'Monitoring temporarily unavailable'
    };

    const faceMissingMs = this.faceMissingSince !== null ? Math.max(0, this.lastTMs - this.faceMissingSince) : 0;

    return {
      state: this.state,
      changed: this.state !== this.prevState,
      message: messages[this.state] || 'Camera monitoring active',
      confirmedOutOfView: this.state === 'PERSON_OUT_OF_VIEW_CONFIRMED',
      faceMissingMs,
      positiveStreak: this.positiveStreak
    };
  }
}
