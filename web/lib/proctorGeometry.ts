/**
 * HireNeuron Verity — Production Facial Geometry & Eye Gaze Engine v2
 *
 * Mathematically rigorous, candidate-relative 3D head pose and iris-based eye gaze estimation.
 * Uses MediaPipe 468+10 landmark topology.
 *
 * v2 Enhancements:
 * - Tighter detection thresholds calibrated against real-world proctoring standards
 * - Diagonal/compound direction detection (DOWN_LEFT, DOWN_RIGHT, UP_LEFT, UP_RIGHT)
 * - Lip movement ratio (LMR) for speaking/coaching detection
 * - Mouth aspect ratio (MAR) for phone-speaking/yawning detection
 * - Improved blink rejection threshold (EAR < 0.19)
 */

export interface Keypoint3D {
  x: number;
  y: number;
  z?: number;
  score?: number;
  name?: string;
}

export type HeadDirection =
  | 'CENTER'
  | 'LEFT'
  | 'RIGHT'
  | 'UP'
  | 'DOWN'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT'
  | 'UP_LEFT'
  | 'UP_RIGHT';

export type GazeDirection =
  | 'CENTER'
  | 'LEFT'
  | 'RIGHT'
  | 'UP'
  | 'DOWN'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT'
  | 'UP_LEFT'
  | 'UP_RIGHT'
  | 'BLINK'
  | 'UNKNOWN';

export interface HeadPoseResult {
  yaw: number;        // Degrees: negative = turned left, positive = turned right
  pitch: number;      // Degrees: negative = looking down, positive = looking up
  roll: number;       // Degrees: negative = tilted left, positive = tilted right
  confidence: number; // 0.0 to 1.0
  direction: HeadDirection;
}

export interface EyeGazeResult {
  leftEAR: number;    // Left Eye Aspect Ratio (openness)
  rightEAR: number;   // Right Eye Aspect Ratio (openness)
  isBlinking: boolean;
  gazeX: number;      // Head-compensated horizontal gaze offset (-1 to 1)
  gazeY: number;      // Head-compensated vertical gaze offset (-1 to 1)
  direction: GazeDirection;
  confidence: number;
  /** Lip openness ratio (0 = closed, 1 = wide open) — detects speaking or being coached */
  lipMovement: number;
  /** Whether candidate appears to be speaking (lip ratio > 0.15) */
  isSpeaking: boolean;
  /** Whether mouth is wide open (MAR > 0.35) — yawning, phone speaking, surprise */
  mouthOpen: boolean;
}

export interface ProctorCalibration {
  baselineYaw: number;
  baselinePitch: number;
  baselineRoll: number;
  baselineGazeX: number;
  baselineGazeY: number;
}

export const DEFAULT_CALIBRATION: ProctorCalibration = {
  baselineYaw: 0,
  baselinePitch: 0,
  baselineRoll: 0,
  baselineGazeX: 0,
  baselineGazeY: 0,
};

// Keypoint Topology (MediaPipe FaceMesh 468 + 10 Iris indices)
export const LANDMARKS = {
  NOSE_TIP: 1,
  FOREHEAD_GLABELLA: 10,
  CHIN: 152,
  CHIN_UPPER: 199,
  LEFT_EAR_TRAGUS: 234,
  RIGHT_EAR_TRAGUS: 454,
  LEFT_MOUTH_CORNER: 61,
  RIGHT_MOUTH_CORNER: 291,

  // Left Eye (Subject's right, viewer's left)
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  LEFT_IRIS_CENTER: 468,

  // Right Eye (Subject's left, viewer's right)
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  RIGHT_IRIS_CENTER: 473,

  // Lip landmarks for speech/coaching detection
  UPPER_LIP_TOP: 13,
  LOWER_LIP_BOTTOM: 14,
  LEFT_INNER_LIP: 78,
  RIGHT_INNER_LIP: 308,
};

// ─── Thresholds (v2: tighter for real-world proctoring) ─────────────────────

/** Head pose deadbands in degrees */
const HEAD_YAW_THRESHOLD = 14;       // was 20° — now catches subtle side glances
const HEAD_PITCH_THRESHOLD = 12;     // was 18° — now catches looking down at phone
const HEAD_DIAGONAL_THRESHOLD = 10;  // compound: if both yaw and pitch exceed this

/** Eye gaze deadbands (normalized 0-1 scale) */
const GAZE_THRESHOLD_H = 0.13;      // was 0.22 — now catches eye-only side glances
const GAZE_THRESHOLD_V = 0.15;      // was 0.24 — now catches reading phone below screen
const GAZE_DIAGONAL_THRESHOLD = 0.10; // compound: if both X and Y exceed this

/** Blink detection threshold */
const BLINK_EAR_THRESHOLD = 0.19;   // was 0.16 — better accuracy, fewer missed blinks

/** Lip/mouth thresholds */
const LIP_SPEAKING_THRESHOLD = 0.15; // lip openness ratio above this = speaking
const MOUTH_OPEN_MAR_THRESHOLD = 0.35; // mouth aspect ratio above this = mouth wide open


/**
 * Computes candidate-relative 3D Head Pose (Yaw, Pitch, Roll in degrees).
 *
 * Crucial: Pitch is computed relative to the candidate's own facial vertical axis
 * (Forehead-to-Chin vector), NOT from the video frame center.
 */
export function estimateHeadPose(
  keypoints: Keypoint3D[],
  calibration: ProctorCalibration = DEFAULT_CALIBRATION
): HeadPoseResult {
  if (!keypoints || keypoints.length < 468) {
    return { yaw: 0, pitch: 0, roll: 0, confidence: 0, direction: 'CENTER' };
  }

  const nose = keypoints[LANDMARKS.NOSE_TIP];
  const forehead = keypoints[LANDMARKS.FOREHEAD_GLABELLA];
  const chin = keypoints[LANDMARKS.CHIN];
  const leftEye = keypoints[LANDMARKS.LEFT_EYE_OUTER];
  const rightEye = keypoints[LANDMARKS.RIGHT_EYE_OUTER];
  const leftTragus = keypoints[LANDMARKS.LEFT_EAR_TRAGUS];
  const rightTragus = keypoints[LANDMARKS.RIGHT_EAR_TRAGUS];

  if (!nose || !forehead || !chin || !leftEye || !rightEye) {
    return { yaw: 0, pitch: 0, roll: 0, confidence: 0, direction: 'CENTER' };
  }

  // 1. Roll (In-plane tilt)
  const dEyeX = rightEye.x - leftEye.x;
  const dEyeY = rightEye.y - leftEye.y;
  const rawRoll = Math.atan2(dEyeY, dEyeX) * (180 / Math.PI);
  const roll = rawRoll - calibration.baselineRoll;

  // 2. Yaw (Horizontal rotation)
  // Compute horizontal displacement of nose relative to eye midpoint normalized by inter-pupillary distance
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const eyeSpan = Math.hypot(dEyeX, dEyeY) || 1;

  // Normalized displacement along the eye-axis
  const eyeUnitX = dEyeX / eyeSpan;
  const eyeUnitY = dEyeY / eyeSpan;
  const noseVectorX = nose.x - eyeMidX;
  const noseVectorY = nose.y - eyeMidY;
  const noseProjEye = noseVectorX * eyeUnitX + noseVectorY * eyeUnitY;
  const normalizedYawOffset = noseProjEye / eyeSpan;

  // Supplement with 3D Z-depth if available from MediaPipe
  let zYawFactor = 0;
  if (leftTragus?.z !== undefined && rightTragus?.z !== undefined) {
    zYawFactor = ((rightTragus.z - leftTragus.z) / eyeSpan) * 15;
  }

  // Approximate yaw angle in degrees
  const rawYaw = (Math.asin(Math.max(-0.95, Math.min(0.95, normalizedYawOffset * 2.2))) * (180 / Math.PI)) + zYawFactor;
  const yaw = rawYaw - calibration.baselineYaw;

  // 3. Pitch (Vertical rotation relative to Face Axis)
  // Vector along face height (Forehead to Chin)
  const faceHeightX = chin.x - forehead.x;
  const faceHeightY = chin.y - forehead.y;
  const faceHeight = Math.hypot(faceHeightX, faceHeightY) || 1;
  const faceUnitX = faceHeightX / faceHeight;
  const faceUnitY = faceHeightY / faceHeight;

  // Project Nose position along Face Vertical Axis
  const noseFromForehead = (nose.x - forehead.x) * faceUnitX + (nose.y - forehead.y) * faceUnitY;
  const noseFromChin = (chin.x - nose.x) * faceUnitX + (chin.y - nose.y) * faceUnitY;

  // In neutral forward-looking human face, noseFromChin and noseFromForehead
  // are balanced relative to candidate's baseline.
  const pitchMetric = (noseFromChin - noseFromForehead) / faceHeight;
  const rawPitch = Math.asin(Math.max(-0.95, Math.min(0.95, pitchMetric * 1.5))) * (180 / Math.PI);
  const pitch = rawPitch - calibration.baselinePitch;

  // Confidence based on landmark presence and scale
  const confidence = Math.min(1.0, Math.max(0.2, (faceHeight / 120.0)));

  // Direction classification with tighter deadbands (v2)
  let direction: HeadDirection = 'CENTER';
  const absYaw = Math.abs(yaw);
  const absPitch = Math.abs(pitch);

  // Check compound diagonal directions first (both axes deviate)
  if (absYaw > HEAD_DIAGONAL_THRESHOLD && absPitch > HEAD_DIAGONAL_THRESHOLD) {
    if (pitch < 0 && yaw < 0) direction = 'DOWN_LEFT';
    else if (pitch < 0 && yaw > 0) direction = 'DOWN_RIGHT';
    else if (pitch > 0 && yaw < 0) direction = 'UP_LEFT';
    else if (pitch > 0 && yaw > 0) direction = 'UP_RIGHT';
  }
  // Then check single-axis directions with tighter thresholds
  else if (yaw < -HEAD_YAW_THRESHOLD) direction = 'LEFT';
  else if (yaw > HEAD_YAW_THRESHOLD) direction = 'RIGHT';
  else if (pitch < -HEAD_PITCH_THRESHOLD) direction = 'DOWN';
  else if (pitch > HEAD_PITCH_THRESHOLD) direction = 'UP';

  return {
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    roll: Math.round(roll * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    direction
  };
}

/**
 * Computes Genuine Eye-Only Gaze Tracking using Iris Landmarks.
 *
 * Compensates for head rotation to isolate true eyeball motion from head turns.
 * Includes Eye Aspect Ratio (EAR) blink rejection.
 *
 * v2: Adds lip movement ratio and mouth open detection for coaching/phone detection.
 */
export function estimateEyeGaze(
  keypoints: Keypoint3D[],
  headPose: HeadPoseResult,
  calibration: ProctorCalibration = DEFAULT_CALIBRATION
): EyeGazeResult {
  const emptyResult: EyeGazeResult = {
    leftEAR: 0,
    rightEAR: 0,
    isBlinking: false,
    gazeX: 0,
    gazeY: 0,
    direction: 'UNKNOWN',
    confidence: 0,
    lipMovement: 0,
    isSpeaking: false,
    mouthOpen: false
  };

  if (!keypoints || keypoints.length < 478) {
    return emptyResult;
  }

  // Left Eye Landmarks
  const lOuter = keypoints[LANDMARKS.LEFT_EYE_OUTER];
  const lInner = keypoints[LANDMARKS.LEFT_EYE_INNER];
  const lTop = keypoints[LANDMARKS.LEFT_EYE_TOP];
  const lBottom = keypoints[LANDMARKS.LEFT_EYE_BOTTOM];
  const lIris = keypoints[LANDMARKS.LEFT_IRIS_CENTER];

  // Right Eye Landmarks
  const rInner = keypoints[LANDMARKS.RIGHT_EYE_INNER];
  const rOuter = keypoints[LANDMARKS.RIGHT_EYE_OUTER];
  const rTop = keypoints[LANDMARKS.RIGHT_EYE_TOP];
  const rBottom = keypoints[LANDMARKS.RIGHT_EYE_BOTTOM];
  const rIris = keypoints[LANDMARKS.RIGHT_IRIS_CENTER];

  if (!lOuter || !lInner || !lTop || !lBottom || !lIris ||
      !rInner || !rOuter || !rTop || !rBottom || !rIris) {
    return emptyResult;
  }

  // 1. Eye Aspect Ratio (EAR)
  const lWidth = Math.hypot(lInner.x - lOuter.x, lInner.y - lOuter.y) || 1;
  const lHeight = Math.hypot(lBottom.x - lTop.x, lBottom.y - lTop.y) || 1;
  const leftEAR = lHeight / lWidth;

  const rWidth = Math.hypot(rOuter.x - rInner.x, rOuter.y - rInner.y) || 1;
  const rHeight = Math.hypot(rBottom.x - rTop.x, rBottom.y - rTop.y) || 1;
  const rightEAR = rHeight / rWidth;

  // ─── Lip Movement & Mouth Analysis ───────────────────────────────────
  let lipMovement = 0;
  let isSpeaking = false;
  let mouthOpen = false;

  const upperLip = keypoints[LANDMARKS.UPPER_LIP_TOP];
  const lowerLip = keypoints[LANDMARKS.LOWER_LIP_BOTTOM];
  const leftMouth = keypoints[LANDMARKS.LEFT_MOUTH_CORNER];
  const rightMouth = keypoints[LANDMARKS.RIGHT_MOUTH_CORNER];
  const leftInnerLip = keypoints[LANDMARKS.LEFT_INNER_LIP];
  const rightInnerLip = keypoints[LANDMARKS.RIGHT_INNER_LIP];

  if (upperLip && lowerLip && leftMouth && rightMouth) {
    // Lip Movement Ratio (LMR): vertical lip opening / mouth width
    const lipVertical = Math.hypot(lowerLip.x - upperLip.x, lowerLip.y - upperLip.y);
    const mouthWidth = Math.hypot(rightMouth.x - leftMouth.x, rightMouth.y - leftMouth.y) || 1;
    lipMovement = Math.min(1.0, lipVertical / mouthWidth);
    isSpeaking = lipMovement > LIP_SPEAKING_THRESHOLD;

    // Mouth Aspect Ratio (MAR) using inner lip landmarks for more precise wide-open detection
    if (leftInnerLip && rightInnerLip) {
      const innerWidth = Math.hypot(rightInnerLip.x - leftInnerLip.x, rightInnerLip.y - leftInnerLip.y) || 1;
      const innerHeight = lipVertical;
      const mar = innerHeight / innerWidth;
      mouthOpen = mar > MOUTH_OPEN_MAR_THRESHOLD;
    } else {
      mouthOpen = lipMovement > MOUTH_OPEN_MAR_THRESHOLD;
    }
  }

  // Blink check: if eyes are closed (EAR < 0.19), reject as blink rather than gaze deviation
  if (leftEAR < BLINK_EAR_THRESHOLD && rightEAR < BLINK_EAR_THRESHOLD) {
    return {
      leftEAR: Math.round(leftEAR * 100) / 100,
      rightEAR: Math.round(rightEAR * 100) / 100,
      isBlinking: true,
      gazeX: 0,
      gazeY: 0,
      direction: 'BLINK',
      confidence: 0.95,
      lipMovement: Math.round(lipMovement * 100) / 100,
      isSpeaking,
      mouthOpen
    };
  }

  // 2. Normalized Iris Coordinates within Eye Sockets
  // Left Eye: vector from outer to inner corner
  const lEyeVecX = (lInner.x - lOuter.x) / lWidth;
  const lEyeVecY = (lInner.y - lOuter.y) / lWidth;
  const lIrisVecX = lIris.x - lOuter.x;
  const lIrisVecY = lIris.y - lOuter.y;
  const lIrisNormX = (lIrisVecX * lEyeVecX + lIrisVecY * lEyeVecY) / lWidth; // 0.0 to 1.0 (0.5 = center)

  const lIrisNormY = (lIris.y - lTop.y) / lHeight;

  // Right Eye: vector from inner to outer corner
  const rEyeVecX = (rOuter.x - rInner.x) / rWidth;
  const rEyeVecY = (rOuter.y - rInner.y) / rWidth;
  const rIrisVecX = rIris.x - rInner.x;
  const rIrisVecY = rIris.y - rInner.y;
  const rIrisNormX = (rIrisVecX * rEyeVecX + rIrisVecY * rEyeVecY) / rWidth;

  const rIrisNormY = (rIris.y - rTop.y) / rHeight;

  // Raw average iris deviation from center (-0.5 to 0.5)
  const rawIrisX = ((lIrisNormX + rIrisNormX) / 2) - 0.5;
  const rawIrisY = ((lIrisNormY + rIrisNormY) / 2) - 0.5;

  // 3. Head Pose Compensation
  // When head turns yaw degrees, the eyeball naturally centers differently relative to the camera
  const yawCompensation = Math.sin((headPose.yaw * Math.PI) / 180) * 0.14;
  const pitchCompensation = Math.sin((headPose.pitch * Math.PI) / 180) * 0.10;

  const compensatedGazeX = (rawIrisX - yawCompensation) - calibration.baselineGazeX;
  const compensatedGazeY = (rawIrisY - pitchCompensation) - calibration.baselineGazeY;

  // Gaze confidence based on EAR and landmark validity
  const confidence = Math.min(1.0, Math.max(0.2, (leftEAR + rightEAR) * 1.8));

  // 4. Direction Classification (v2: tighter deadbands + diagonal detection)
  let direction: GazeDirection = 'CENTER';
  const absGazeX = Math.abs(compensatedGazeX);
  const absGazeY = Math.abs(compensatedGazeY);

  // Check compound diagonal directions first
  if (absGazeX > GAZE_DIAGONAL_THRESHOLD && absGazeY > GAZE_DIAGONAL_THRESHOLD) {
    if (compensatedGazeY > 0 && compensatedGazeX < 0) direction = 'DOWN_LEFT';
    else if (compensatedGazeY > 0 && compensatedGazeX > 0) direction = 'DOWN_RIGHT';
    else if (compensatedGazeY < 0 && compensatedGazeX < 0) direction = 'UP_LEFT';
    else if (compensatedGazeY < 0 && compensatedGazeX > 0) direction = 'UP_RIGHT';
  }
  // Then check single-axis with tighter thresholds
  else if (compensatedGazeX < -GAZE_THRESHOLD_H) {
    direction = 'LEFT';
  } else if (compensatedGazeX > GAZE_THRESHOLD_H) {
    direction = 'RIGHT';
  } else if (compensatedGazeY < -GAZE_THRESHOLD_V) {
    direction = 'UP';
  } else if (compensatedGazeY > GAZE_THRESHOLD_V) {
    direction = 'DOWN';
  }

  return {
    leftEAR: Math.round(leftEAR * 100) / 100,
    rightEAR: Math.round(rightEAR * 100) / 100,
    isBlinking: false,
    gazeX: Math.round(compensatedGazeX * 1000) / 1000,
    gazeY: Math.round(compensatedGazeY * 1000) / 1000,
    direction,
    confidence: Math.round(confidence * 100) / 100,
    lipMovement: Math.round(lipMovement * 100) / 100,
    isSpeaking,
    mouthOpen
  };
}
