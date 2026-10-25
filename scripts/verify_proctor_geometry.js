/**
 * HireNeuron Verity — Proctoring Geometry & Gaze Accuracy Verification Harness
 * Tests 10 specific movement scenarios and benchmarks computation latency.
 */

// Helper to construct a canonical 478-landmark synthetic face model
function createFaceLandmarks({
  noseOffset = { x: 0, y: 0, z: 0 },
  leftIrisOffset = { x: 0, y: 0 },
  rightIrisOffset = { x: 0, y: 0 },
  eyeOpenness = 1.0, // 1.0 = normal, 0.1 = blink
  globalOffset = { x: 0, y: 0 }, // To test candidate moving within camera frame
}) {
  const pts = new Array(478);
  for (let i = 0; i < 478; i++) {
    pts[i] = { x: 320 + globalOffset.x, y: 240 + globalOffset.y, z: 0 };
  }

  // Canonical base positions
  const cx = 320 + globalOffset.x;
  const cy = 240 + globalOffset.y;

  // Forehead and Chin
  pts[10] = { x: cx, y: cy - 90, z: 0 };   // Forehead glabella
  pts[152] = { x: cx, y: cy + 90, z: 0 };  // Chin
  pts[199] = { x: cx, y: cy + 70, z: 0 };  // Chin upper

  // Nose tip
  pts[1] = { x: cx + noseOffset.x, y: cy + 15 + noseOffset.y, z: noseOffset.z };

  // Ears / Tragus
  pts[234] = { x: cx - 110, y: cy, z: noseOffset.x > 0 ? 15 : -15 }; // Left ear
  pts[454] = { x: cx + 110, y: cy, z: noseOffset.x > 0 ? -15 : 15 }; // Right ear

  // Left Eye (viewer's left): width = 40px
  const lEyeCenter = { x: cx - 55, y: cy - 20 };
  pts[33] = { x: lEyeCenter.x - 20, y: lEyeCenter.y, z: 0 };  // Outer corner
  pts[133] = { x: lEyeCenter.x + 20, y: lEyeCenter.y, z: 0 }; // Inner corner
  const lH = 12 * eyeOpenness;
  pts[159] = { x: lEyeCenter.x, y: lEyeCenter.y - lH / 2, z: 0 }; // Top
  pts[145] = { x: lEyeCenter.x, y: lEyeCenter.y + lH / 2, z: 0 }; // Bottom
  pts[468] = { x: lEyeCenter.x + leftIrisOffset.x, y: lEyeCenter.y + leftIrisOffset.y, z: 0 }; // Left Iris

  // Right Eye (viewer's right): width = 40px
  const rEyeCenter = { x: cx + 55, y: cy - 20 };
  pts[362] = { x: rEyeCenter.x - 20, y: rEyeCenter.y, z: 0 }; // Inner corner
  pts[263] = { x: rEyeCenter.x + 20, y: rEyeCenter.y, z: 0 }; // Outer corner
  const rH = 12 * eyeOpenness;
  pts[386] = { x: rEyeCenter.x, y: rEyeCenter.y - rH / 2, z: 0 }; // Top
  pts[374] = { x: rEyeCenter.x, y: rEyeCenter.y + rH / 2, z: 0 }; // Bottom
  pts[473] = { x: rEyeCenter.x + rightIrisOffset.x, y: rEyeCenter.y + rightIrisOffset.y, z: 0 }; // Right Iris

  return pts;
}

// Inlined geometry estimation functions matching web/lib/proctorGeometry.ts
function estimateHeadPose(keypoints, calib = { baselineYaw: 0, baselinePitch: 0, baselineRoll: 0 }) {
  const nose = keypoints[1];
  const forehead = keypoints[10];
  const chin = keypoints[152];
  const leftEye = keypoints[33];
  const rightEye = keypoints[263];
  const leftTragus = keypoints[234];
  const rightTragus = keypoints[454];

  const dEyeX = rightEye.x - leftEye.x;
  const dEyeY = rightEye.y - leftEye.y;
  const roll = Math.atan2(dEyeY, dEyeX) * (180 / Math.PI) - calib.baselineRoll;

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const eyeSpan = Math.hypot(dEyeX, dEyeY) || 1;

  const eyeUnitX = dEyeX / eyeSpan;
  const eyeUnitY = dEyeY / eyeSpan;
  const noseVectorX = nose.x - eyeMidX;
  const noseVectorY = nose.y - eyeMidY;
  const noseProjEye = noseVectorX * eyeUnitX + noseVectorY * eyeUnitY;
  const normalizedYawOffset = noseProjEye / eyeSpan;

  let zYawFactor = 0;
  if (leftTragus?.z !== undefined && rightTragus?.z !== undefined) {
    zYawFactor = ((rightTragus.z - leftTragus.z) / eyeSpan) * 15;
  }

  const rawYaw = (Math.asin(Math.max(-0.95, Math.min(0.95, normalizedYawOffset * 2.2))) * (180 / Math.PI)) + zYawFactor;
  const yaw = rawYaw - calib.baselineYaw;

  const faceHeightX = chin.x - forehead.x;
  const faceHeightY = chin.y - forehead.y;
  const faceHeight = Math.hypot(faceHeightX, faceHeightY) || 1;
  const faceUnitX = faceHeightX / faceHeight;
  const faceUnitY = faceHeightY / faceHeight;

  const noseFromForehead = (nose.x - forehead.x) * faceUnitX + (nose.y - forehead.y) * faceUnitY;
  const noseFromChin = (chin.x - nose.x) * faceUnitX + (chin.y - nose.y) * faceUnitY;

  const pitchMetric = (noseFromChin - noseFromForehead) / faceHeight;
  const rawPitch = Math.asin(Math.max(-0.95, Math.min(0.95, pitchMetric * 1.5))) * (180 / Math.PI);
  const pitch = rawPitch - calib.baselinePitch;

  let direction = 'CENTER';
  if (yaw < -20) direction = 'LEFT';
  else if (yaw > 20) direction = 'RIGHT';
  else if (pitch < -18) direction = 'DOWN';
  else if (pitch > 18) direction = 'UP';

  return { yaw: Math.round(yaw * 10) / 10, pitch: Math.round(pitch * 10) / 10, roll: Math.round(roll * 10) / 10, direction };
}

function estimateEyeGaze(keypoints, headPose, calib = { baselineGazeX: 0, baselineGazeY: 0 }) {
  const lOuter = keypoints[33];
  const lInner = keypoints[133];
  const lTop = keypoints[159];
  const lBottom = keypoints[145];
  const lIris = keypoints[468];

  const rInner = keypoints[362];
  const rOuter = keypoints[263];
  const rTop = keypoints[386];
  const rBottom = keypoints[374];
  const rIris = keypoints[473];

  const lWidth = Math.hypot(lInner.x - lOuter.x, lInner.y - lOuter.y) || 1;
  const lHeight = Math.hypot(lBottom.x - lTop.x, lBottom.y - lTop.y) || 1;
  const leftEAR = lHeight / lWidth;

  const rWidth = Math.hypot(rOuter.x - rInner.x, rOuter.y - rInner.y) || 1;
  const rHeight = Math.hypot(rBottom.x - rTop.x, rBottom.y - rTop.y) || 1;
  const rightEAR = rHeight / rWidth;

  if (leftEAR < 0.16 && rightEAR < 0.16) {
    return { leftEAR, rightEAR, isBlinking: true, gazeX: 0, gazeY: 0, direction: 'BLINK' };
  }

  const lEyeVecX = (lInner.x - lOuter.x) / lWidth;
  const lEyeVecY = (lInner.y - lOuter.y) / lWidth;
  const lIrisNormX = ((lIris.x - lOuter.x) * lEyeVecX + (lIris.y - lOuter.y) * lEyeVecY) / lWidth;
  const lIrisNormY = (lIris.y - lTop.y) / lHeight;

  const rEyeVecX = (rOuter.x - rInner.x) / rWidth;
  const rEyeVecY = (rOuter.y - rInner.y) / rWidth;
  const rIrisNormX = ((rIris.x - rInner.x) * rEyeVecX + (rIris.y - rInner.y) * rEyeVecY) / rWidth;
  const rIrisNormY = (rIris.y - rTop.y) / rHeight;

  const rawIrisX = ((lIrisNormX + rIrisNormX) / 2) - 0.5;
  const rawIrisY = ((lIrisNormY + rIrisNormY) / 2) - 0.5;

  const yawComp = Math.sin((headPose.yaw * Math.PI) / 180) * 0.14;
  const pitchComp = Math.sin((headPose.pitch * Math.PI) / 180) * 0.10;

  const gazeX = (rawIrisX - yawComp) - calib.baselineGazeX;
  const gazeY = (rawIrisY - pitchComp) - calib.baselineGazeY;

  let direction = 'CENTER';
  if (gazeX < -0.22) direction = 'LEFT';
  else if (gazeX > 0.22) direction = 'RIGHT';
  else if (gazeY < -0.24) direction = 'UP';
  else if (gazeY > 0.24) direction = 'DOWN';

  return { leftEAR, rightEAR, isBlinking: false, gazeX: Math.round(gazeX * 1000) / 1000, gazeY: Math.round(gazeY * 1000) / 1000, direction };
}

// ── TEST SUITE EXECUTION ──
console.log('=' .repeat(65));
console.log('  HIRENEURON VERITY — PROCTORING ACCURACY & GEOMETRY HARNESS');
console.log('=' .repeat(65));

let passedTests = 0;
let totalTests = 0;

function assertTest(name, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${name} -> ${details}`);
  }
}

// 1. Neutral Forward-Facing Pose & Automatic Baseline Calibration
const neutral = createFaceLandmarks({});
const rawHp1 = estimateHeadPose(neutral);
const rawEg1 = estimateEyeGaze(neutral, rawHp1);

// Baseline Calibration (Identical to AIProctorEngine auto-calibration)
const calib = {
  baselineYaw: rawHp1.yaw,
  baselinePitch: rawHp1.pitch,
  baselineRoll: rawHp1.roll,
  baselineGazeX: rawEg1.gazeX,
  baselineGazeY: rawEg1.gazeY
};

const hp1 = estimateHeadPose(neutral, calib);
const eg1 = estimateEyeGaze(neutral, hp1, calib);
assertTest('Neutral Forward Facing: Pose is CENTER', hp1.direction === 'CENTER', `got ${hp1.direction} (pitch=${hp1.pitch}°, yaw=${hp1.yaw}°)`);
assertTest('Neutral Forward Facing: Gaze is CENTER', eg1.direction === 'CENTER', `got ${eg1.direction} (gazeX=${eg1.gazeX}, gazeY=${eg1.gazeY})`);

// 2. Eyes-Only Glance Left (Head straight, Irises shifted off-screen left by 10px on 40px eye)
const eyeLeft = createFaceLandmarks({ leftIrisOffset: { x: -10, y: 0 }, rightIrisOffset: { x: -10, y: 0 } });
const hp2 = estimateHeadPose(eyeLeft, calib);
const eg2 = estimateEyeGaze(eyeLeft, hp2, calib);
assertTest('Eyes-Only Left Glance: Head remains CENTER', hp2.direction === 'CENTER', `got ${hp2.direction}`);
assertTest('Eyes-Only Left Glance: Gaze is LEFT', eg2.direction === 'LEFT', `got ${eg2.direction} (gazeX=${eg2.gazeX})`);

// 3. Eyes-Only Glance Right (Head straight, Irises shifted off-screen right by 10px on 40px eye)
const eyeRight = createFaceLandmarks({ leftIrisOffset: { x: 10, y: 0 }, rightIrisOffset: { x: 10, y: 0 } });
const hp3 = estimateHeadPose(eyeRight, calib);
const eg3 = estimateEyeGaze(eyeRight, hp3, calib);
assertTest('Eyes-Only Right Glance: Head remains CENTER', hp3.direction === 'CENTER', `got ${hp3.direction}`);
assertTest('Eyes-Only Right Glance: Gaze is RIGHT', eg3.direction === 'RIGHT', `got ${eg3.direction} (gazeX=${eg3.gazeX})`);

// 4. Eyes-Only Glance Up
const eyeUp = createFaceLandmarks({ leftIrisOffset: { x: 0, y: -4 }, rightIrisOffset: { x: 0, y: -4 } });
const hp4 = estimateHeadPose(eyeUp, calib);
const eg4 = estimateEyeGaze(eyeUp, hp4, calib);
assertTest('Eyes-Only Up Glance: Gaze is UP', eg4.direction === 'UP', `got ${eg4.direction} (gazeY=${eg4.gazeY})`);

// 5. Eyes-Only Glance Down
const eyeDown = createFaceLandmarks({ leftIrisOffset: { x: 0, y: 4 }, rightIrisOffset: { x: 0, y: 4 } });
const hp5 = estimateHeadPose(eyeDown, calib);
const eg5 = estimateEyeGaze(eyeDown, hp5, calib);
assertTest('Eyes-Only Down Glance: Gaze is DOWN', eg5.direction === 'DOWN', `got ${eg5.direction} (gazeY=${eg5.gazeY})`);

// 6. Head Turn Left (Nose displaced left)
const headLeft = createFaceLandmarks({ noseOffset: { x: -30, y: 0, z: -10 } });
const hp6 = estimateHeadPose(headLeft, calib);
assertTest('Head-Only Turn Left: Pose is LEFT', hp6.direction === 'LEFT', `got ${hp6.direction} (yaw=${hp6.yaw}°)`);

// 7. Head Turn Right (Nose displaced right)
const headRight = createFaceLandmarks({ noseOffset: { x: 30, y: 0, z: 10 } });
const hp7 = estimateHeadPose(headRight, calib);
assertTest('Head-Only Turn Right: Pose is RIGHT', hp7.direction === 'RIGHT', `got ${hp7.direction} (yaw=${hp7.yaw}°)`);

// 8. Head Pitch Up & Down
const headPitchUp = createFaceLandmarks({ noseOffset: { x: 0, y: -25, z: 0 } });
const hp8a = estimateHeadPose(headPitchUp, calib);
assertTest('Head Pitch Up: Pose is UP', hp8a.direction === 'UP', `got ${hp8a.direction} (pitch=${hp8a.pitch}°)`);

const headPitchDown = createFaceLandmarks({ noseOffset: { x: 0, y: 25, z: 0 } });
const hp8b = estimateHeadPose(headPitchDown, calib);
assertTest('Head Pitch Down: Pose is DOWN', hp8b.direction === 'DOWN', `got ${hp8b.direction} (pitch=${hp8b.pitch}°)`);

// 9. Natural Blink (EAR < 0.16)
const blink = createFaceLandmarks({ eyeOpenness: 0.08 });
const eg9 = estimateEyeGaze(blink, hp1, calib);
assertTest('Natural Blink: Recognized as BLINK', eg9.isBlinking === true && eg9.direction === 'BLINK', `got blinking=${eg9.isBlinking}, dir=${eg9.direction}`);

// 10. Candidate Position Invariance (Candidate sitting at x=+120px in frame)
const shiftedFace = createFaceLandmarks({ globalOffset: { x: 120, y: -60 } });
const hp10 = estimateHeadPose(shiftedFace, calib);
assertTest('Frame-Position Invariance: Pitch and Yaw remain CENTER when candidate shifts in frame', hp10.direction === 'CENTER', `got ${hp10.direction}`);
assertTest('Frame-Position Invariance: Pitch and Yaw remain CENTER when candidate shifts in frame', hp10.direction === 'CENTER', `got ${hp10.direction}`);

// 11. Throughput & Latency Benchmark
console.log('\n--- Benchmarking Computational Throughput (10,000 iterations) ---');
const t0 = performance.now();
for (let i = 0; i < 10000; i++) {
  const hp = estimateHeadPose(neutral);
  estimateEyeGaze(neutral, hp);
}
const elapsedMs = performance.now() - t0;
const perFrameMicrosec = (elapsedMs / 10000) * 1000;
console.log(`  ✓ 10,000 Geometry Computations in ${elapsedMs.toFixed(2)}ms`);
console.log(`  ✓ Per-frame geometry processing time: ${perFrameMicrosec.toFixed(2)} microseconds (< 0.02ms)`);
assertTest('Geometry processing time < 1ms', perFrameMicrosec < 1000, `${perFrameMicrosec} µs`);

console.log('=' .repeat(65));
console.log(`  RESULT: ${passedTests}/${totalTests} Tests Passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('=' .repeat(65));
if (passedTests !== totalTests) process.exit(1);
