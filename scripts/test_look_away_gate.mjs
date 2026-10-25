import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LookAwayGate } from '../web/lib/lookAwayGate.ts';

const createSample = (tMs, {
  trackingValid = true,
  isBlinking = false,
  headDirection = 'CENTER',
  eyeDirection = 'CENTER',
  eyeConfidence = 0.8
} = {}) => ({
  tMs,
  trackingValid,
  isBlinking,
  headPose: trackingValid ? {
    yaw: headDirection === 'LEFT' ? -25 : headDirection === 'RIGHT' ? 25 : 0,
    pitch: headDirection === 'UP' ? 18 : headDirection === 'DOWN' ? -18 : 0,
    roll: 0,
    direction: headDirection,
    calibrated: true
  } : null,
  eyeGaze: trackingValid ? {
    horizontalRatio: eyeDirection === 'LEFT' ? 0.2 : eyeDirection === 'RIGHT' ? 0.8 : 0.5,
    verticalRatio: eyeDirection === 'UP' ? 0.2 : eyeDirection === 'DOWN' ? 0.8 : 0.5,
    direction: eyeDirection,
    confidence: eyeConfidence,
    isBlinking
  } : null
});

test('1. Candidate looking forward stays in LOOKING_FORWARD with zero warnings', () => {
  const gate = new LookAwayGate();
  for (let t = 0; t <= 5000; t += 100) {
    const res = gate.update(createSample(t));
    assert.equal(res.state, 'LOOKING_FORWARD');
    assert.equal(res.isWarning, false);
    assert.equal(res.direction, 'CENTER');
  }
});

test('2. Brief glance (0.3s - 0.8s) produces NO warning', () => {
  const gate = new LookAwayGate();
  // 1s looking forward
  for (let t = 0; t <= 1000; t += 100) {
    gate.update(createSample(t));
  }

  // 600ms look left (glance)
  for (let t = 1100; t <= 1700; t += 100) {
    const res = gate.update(createSample(t, { headDirection: 'LEFT' }));
    assert.equal(res.isWarning, false, `Glance at t=${t} must NOT trigger a warning`);
    assert.equal(res.state, 'POSSIBLE_LOOK_AWAY');
    assert.equal(res.direction, 'LEFT');
  }

  // Returns forward for 400ms (>300ms recovery)
  let finalRes;
  for (let t = 1800; t <= 2200; t += 100) {
    finalRes = gate.update(createSample(t));
  }
  assert.equal(finalRes.state, 'LOOKING_FORWARD');
  assert.equal(finalRes.isWarning, false);
});

test('3. Sustained look away (>= 1000ms) triggers warning immediately at threshold', () => {
  const gate = new LookAwayGate();

  // Stable forward
  gate.update(createSample(0));

  // Starts looking right at t=100
  let res;
  for (let t = 100; t < 1100; t += 100) {
    res = gate.update(createSample(t, { headDirection: 'RIGHT' }));
    assert.equal(res.isWarning, false, `t=${t} (${t-100}ms) is < 1000ms threshold`);
    assert.equal(res.state, 'POSSIBLE_LOOK_AWAY');
  }

  // Exactly at t=1100 (elapsed = 1000ms)
  res = gate.update(createSample(1100, { headDirection: 'RIGHT' }));
  assert.equal(res.isWarning, true, 'At 1000ms elapsed, warning MUST be active');
  assert.equal(res.state, 'LOOK_AWAY_CONFIRMED');
  assert.match(res.message, /Looking right/i);

  // Still looking away at 1500ms
  res = gate.update(createSample(1500, { headDirection: 'RIGHT' }));
  assert.equal(res.isWarning, true);
  assert.equal(res.state, 'LOOK_AWAY_CONFIRMED');
});

test('4. Returning to forward clears warning after exactly ~300ms recovery', () => {
  const gate = new LookAwayGate();
  gate.update(createSample(0));

  // Look away for 1200ms
  for (let t = 100; t <= 1300; t += 100) {
    gate.update(createSample(t, { headDirection: 'LEFT' }));
  }

  // At t=1400 (first forward sample, centerSince=1400, elapsed=0ms): still in recovery window
  let res = gate.update(createSample(1400, { headDirection: 'CENTER' }));
  assert.equal(res.isWarning, true, 'At 0ms of forward facing, warning must hold');

  // At t=1500 (100ms forward): still in recovery window
  res = gate.update(createSample(1500, { headDirection: 'CENTER' }));
  assert.equal(res.isWarning, true, 'At 100ms of forward facing, warning must hold');

  // At t=1600 (200ms forward): still in recovery window
  res = gate.update(createSample(1600, { headDirection: 'CENTER' }));
  assert.equal(res.isWarning, true, 'At 200ms of forward facing, warning must hold');

  // At t=1700 (300ms forward): recovery threshold reached, warning cleared
  res = gate.update(createSample(1700, { headDirection: 'CENTER' }));
  assert.equal(res.isWarning, false, 'At 300ms of forward facing, warning MUST clear');
  assert.equal(res.state, 'LOOKING_FORWARD');
  assert.equal(res.direction, 'CENTER');
});

test('5. Upward and downward head/eye deviations detect accurately', () => {
  const gate = new LookAwayGate();

  // UP for 1100ms
  for (let t = 0; t <= 1100; t += 100) {
    gate.update(createSample(t, { headDirection: 'UP' }));
  }
  let res = gate.update(createSample(1100, { headDirection: 'UP' }));
  assert.equal(res.isWarning, true);
  assert.match(res.message, /Looking up/i);

  gate.reset();

  // DOWN for 1100ms
  for (let t = 0; t <= 1100; t += 100) {
    gate.update(createSample(t, { headDirection: 'DOWN' }));
  }
  res = gate.update(createSample(1100, { headDirection: 'DOWN' }));
  assert.equal(res.isWarning, true);
  assert.match(res.message, /Looking down/i);
});

test('6. Eyes-only gaze off-screen (with forward head pose) triggers look-away after 1.0s', () => {
  const gate = new LookAwayGate();
  gate.update(createSample(0));

  // Head center, but eyes looking left for 1200ms
  for (let t = 100; t <= 1300; t += 100) {
    gate.update(createSample(t, { headDirection: 'CENTER', eyeDirection: 'LEFT', eyeConfidence: 0.85 }));
  }

  const res = gate.update(createSample(1300, { headDirection: 'CENTER', eyeDirection: 'LEFT', eyeConfidence: 0.85 }));
  assert.equal(res.isWarning, true);
  assert.equal(res.state, 'LOOK_AWAY_CONFIRMED');
  assert.match(res.message, /Looking left/i);
});

test('7. Natural blinking does not trigger look away', () => {
  const gate = new LookAwayGate();
  for (let t = 0; t <= 2000; t += 100) {
    const isBlinking = t >= 500 && t <= 700; // 200ms natural blink
    const res = gate.update(createSample(t, { isBlinking }));
    assert.equal(res.isWarning, false);
    assert.equal(res.state, 'LOOKING_FORWARD');
  }
});

test('8. Tracking failure / landmark loss transitions to TRACKING_UNCERTAIN, not look-away', () => {
  const gate = new LookAwayGate();
  gate.update(createSample(0));

  // Tracking lost for 500ms (> 300ms grace)
  for (let t = 100; t <= 500; t += 100) {
    gate.update(createSample(t, { trackingValid: false }));
  }

  const res = gate.update(createSample(500, { trackingValid: false }));
  assert.equal(res.state, 'TRACKING_UNCERTAIN');
  assert.equal(res.isWarning, false);
  assert.equal(res.direction, 'UNKNOWN');
});
