/**
 * HireNeuron Verity — reference temporal face-presence gate.
 *
 * IMPORTANT: This is a pure-state reference component for integration by Antigravity.
 * It is not a complete proctoring solution and must be connected to real decoded frames,
 * an independently checked fallback face detector, and an optional person detector.
 * Use a monotonic timestamp (performance.now()), not Date.now(), for samples.
 */
export type PresenceState =
  | 'WARMING_UP'
  | 'PRESENT'
  | 'TRACKING_UNCERTAIN'
  | 'FACE_NOT_VISIBLE'
  | 'OUT_OF_VIEW_CONFIRMED'
  | 'COVERAGE_GAP';

export interface PresenceSample {
  /** Actual observation time, milliseconds from performance.now(). */
  tMs: number;
  /** Is the camera track live and actually delivering new decoded frames? */
  freshFrame: boolean;
  /** Is the MediaStreamTrack live/usable? */
  cameraLive: boolean;
  /** Has inference succeeded on this frame? Null/error means unknown, NOT no-face. */
  landmarksFace: boolean | null;
  /** Independent face detector result; null = not run/unavailable. */
  fallbackFace: boolean | null;
  /** Optional independently verified person/torso detection; null = unknown. */
  personVisible: boolean | null;
}

export interface PresenceDecision {
  state: PresenceState;
  changed: boolean;
  /** Safe for UI only; DO NOT treat as a cheating verdict. */
  message: string;
  /** Whether evidence supports 'person actually out of view' claim. */
  confirmedOutOfView: boolean;
}

export class FacePresenceGate {
  private readonly startMs: number;
  private readonly warmingUpMs: number;
  private readonly missingConfirmMs: number;
  private readonly outOfViewConfirmMs: number;
  private lastTMs = -Infinity;
  private lastFreshMs: number;
  private faceMissingSince: number | null = null;
  private personMissingSince: number | null = null;
  private positiveStreak = 0;
  private lastPositiveFaceMs: number | null = null;
  private readonly presentGraceMs = 800;
  private state: PresenceState = 'WARMING_UP';
  private prevState: PresenceState = 'WARMING_UP';

  constructor(startMs: number, opts: {
    warmingUpMs?: number;
    missingConfirmMs?: number;
    outOfViewConfirmMs?: number;
  } = {}) {
    this.startMs = startMs;
    this.lastFreshMs = startMs;
    this.warmingUpMs = opts.warmingUpMs ?? 1800;
    this.missingConfirmMs = opts.missingConfirmMs ?? 3000;
    this.outOfViewConfirmMs = opts.outOfViewConfirmMs ?? 4000;
  }

  update(input: PresenceSample): PresenceDecision {
    if (!Number.isFinite(input.tMs) || input.tMs < this.lastTMs) {
      throw new Error('Use monotonically increasing observation timestamps');
    }
    this.lastTMs = input.tMs;
    this.prevState = this.state;

    // Camera and frame delivery failures are COVERAGE_GAP, NEVER FACE_ABSENT.
    if (!input.cameraLive || !input.freshFrame) {
      this.state = 'COVERAGE_GAP';
      this.resetMissingEvidence();
      return this.decision();
    }
    this.lastFreshMs = input.tMs;

    // One detector can miss while a second detects a profile face.
    const someFace = input.landmarksFace === true || input.fallbackFace === true;
    const bothFaceDetectorsSayNo = input.landmarksFace === false && input.fallbackFace === false;

    if (someFace) {
      this.resetMissingEvidence();
      this.positiveStreak += 1;
      this.lastPositiveFaceMs = input.tMs;
      // Two separate positive fresh-frame observations before declaring recovery.
      this.state = this.positiveStreak >= 2 ? 'PRESENT' : 'TRACKING_UNCERTAIN';
      return this.decision();
    }
    this.positiveStreak = 0;

    // Avoid UI flicker during a brief blink/partial occlusion/missed frame.
    // The camera must still be fresh and operational (checked above).
    if (this.prevState === 'PRESENT' && this.lastPositiveFaceMs !== null &&
        input.tMs - this.lastPositiveFaceMs < this.presentGraceMs) {
      // Count reliable negative evidence from its actual first occurrence, even
      // while the UI holds PRESENT through a brief visibility dropout.
      if (input.landmarksFace === false && input.fallbackFace === false) {
        if (this.faceMissingSince === null) this.faceMissingSince = input.tMs;
        if (input.personVisible === false && this.personMissingSince === null) {
          this.personMissingSince = input.tMs;
        }
      }
      this.state = 'PRESENT';
      return this.decision();
    }

    if (input.tMs - this.startMs < this.warmingUpMs) {
      this.state = 'WARMING_UP';
      return this.decision();
    }

    // Lack of a result, including model exceptions, is NOT a face-absence finding.
    if (!bothFaceDetectorsSayNo) {
      this.resetMissingEvidence();
      this.state = 'TRACKING_UNCERTAIN';
      return this.decision();
    }

    if (this.faceMissingSince === null) this.faceMissingSince = input.tMs;
    const missingMs = input.tMs - this.faceMissingSince;

    // A person still physically visible may have turned away or partially occluded face.
    // Never call them 'out of camera view' if the body is visibly present.
    if (input.personVisible !== false) {
      this.personMissingSince = null;
      this.state = missingMs >= this.missingConfirmMs
        ? 'FACE_NOT_VISIBLE'
        : 'TRACKING_UNCERTAIN';
      return this.decision();
    }

    if (this.personMissingSince === null) this.personMissingSince = input.tMs;
    const personMissingMs = input.tMs - this.personMissingSince;
    this.state = missingMs >= this.outOfViewConfirmMs &&
      personMissingMs >= this.outOfViewConfirmMs
      ? 'OUT_OF_VIEW_CONFIRMED'
      : missingMs >= this.missingConfirmMs
        ? 'FACE_NOT_VISIBLE'
        : 'TRACKING_UNCERTAIN';
    return this.decision();
  }

  private resetMissingEvidence() {
    this.faceMissingSince = null;
    this.personMissingSince = null;
  }

  private decision(): PresenceDecision {
    const messages: Record<PresenceState, string> = {
      WARMING_UP: 'Camera monitoring starting',
      PRESENT: 'Face visible',
      TRACKING_UNCERTAIN: 'Checking camera view',
      FACE_NOT_VISIBLE: 'Face not clearly visible; adjust position if needed',
      OUT_OF_VIEW_CONFIRMED: 'Person not visible in camera view; return when possible',
      COVERAGE_GAP: 'Camera or monitoring connection interrupted'
    };
    return {
      state: this.state,
      changed: this.state !== this.prevState,
      message: messages[this.state],
      confirmedOutOfView: this.state === 'OUT_OF_VIEW_CONFIRMED'
    };
  }
}
