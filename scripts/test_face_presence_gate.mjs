import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FacePresenceGate } from '../web/lib/facePresenceGate.ts';

const frame = (
  tMs,
  landmarksFace = true,
  fallbackFace = null,
  personVisible = true,
  freshFrame = true,
  cameraLive = true,
  isCalibrating = false
) => ({
  tMs,
  landmarksFace,
  fallbackFace,
  personVisible,
  freshFrame,
  cameraLive,
  isCalibrating
});

test('1. Normal stable candidate stays in FACE_PRESENT without alerts', () => {
  const gate = new FacePresenceGate(0);
  for (let t = 0; t <= 10000; t += 100) {
    const res = gate.update(frame(t));
    assert.notEqual(res.state, 'PERSON_OUT_OF_VIEW_CONFIRMED');
    assert.notEqual(res.state, 'FACE_NOT_VISIBLE');
    if (t > 2000) {
      assert.equal(res.state, 'FACE_PRESENT');
      assert.equal(res.confirmedOutOfView, false);
    }
  }
});

test('2. Brief missed landmarks (blinks, momentary drops) hold state during grace period', () => {
  const gate = new FacePresenceGate(0);
  for (let t = 0; t <= 2500; t += 100) gate.update(frame(t));

  // 600ms of negative face detections (< 800ms grace)
  for (let t = 2600; t <= 3100; t += 100) {
    const res = gate.update(frame(t, false, false, true));
    assert.equal(res.state, 'FACE_PRESENT', `Expected FACE_PRESENT at t=${t}`);
    assert.equal(res.confirmedOutOfView, false);
  }

  // Recovered with positive landmarks
  const s1 = gate.update(frame(3200, true, false, true));
  assert.equal(s1.state, 'TRACKING_UNCERTAIN'); // Streak 1
  const s2 = gate.update(frame(3300, true, false, true));
  assert.equal(s2.state, 'FACE_PRESENT'); // Streak 2 confirms
});

test('3. Tracking failure or detector exception produces TRACKING_UNCERTAIN, not absence', () => {
  const gate = new FacePresenceGate(0);
  for (let t = 0; t <= 2500; t += 100) gate.update(frame(t));

  for (let t = 2600; t <= 10000; t += 100) {
    const res = gate.update(frame(t, null, null, null));
    assert.ok(
      res.state === 'FACE_PRESENT' || res.state === 'TRACKING_UNCERTAIN',
      `Unexpected state ${res.state} during detector uncertainty`
    );
    assert.equal(res.confirmedOutOfView, false);
  }
});

test('4. Profile face found by fallback keeps candidate in FACE_PRESENT', () => {
  const gate = new FacePresenceGate(0);
  for (let t = 0; t <= 2000; t += 100) gate.update(frame(t));

  const s1 = gate.update(frame(2100, false, true, true));
  assert.equal(s1.state, 'FACE_PRESENT');
  const s2 = gate.update(frame(2200, false, true, true));
  assert.equal(s2.state, 'FACE_PRESENT');
});

test('5. Visible body but covered/turned face transitions to FACE_NOT_VISIBLE, never out of view', () => {
  const gate = new FacePresenceGate(0);
  for (let t = 0; t <= 2500; t += 100) gate.update(frame(t));

  let res;
  for (let t = 2600; t <= 8000; t += 100) {
    res = gate.update(frame(t, false, false, true));
  }
  assert.equal(res?.state, 'FACE_NOT_VISIBLE');
  assert.equal(res?.confirmedOutOfView, false);
});

test('6. Confirmed out of view requires sustained missing face AND missing body (> 4.0s)', () => {
  const gate = new FacePresenceGate(0);
  for (let t = 0; t <= 2500; t += 100) gate.update(frame(t));

  let res;
  // Between 2.6s and 6.5s (< 4s missing duration)
  for (let t = 2600; t < 6600; t += 100) {
    res = gate.update(frame(t, false, false, false));
    assert.equal(res.confirmedOutOfView, false, `Premature out of view at t=${t}`);
  }

  // At 6.6s (4.0s sustained absence of both face and body)
  res = gate.update(frame(6600, false, false, false));
  assert.equal(res.state, 'PERSON_OUT_OF_VIEW_CONFIRMED');
  assert.equal(res.confirmedOutOfView, true);
});

test('7. Camera frame freeze or track disconnection transitions to CAMERA_CONNECTION_LOST', () => {
  const gate = new FacePresenceGate(0);
  for (let t = 0; t <= 2500; t += 100) gate.update(frame(t));

  // Stalled frames (freshFrame = false)
  const res1 = gate.update(frame(2600, null, null, null, false, true));
  assert.equal(res1.state, 'CAMERA_CONNECTION_LOST');
  assert.equal(res1.confirmedOutOfView, false);

  // Muted track (cameraLive = false)
  const res2 = gate.update(frame(2700, null, null, null, true, false));
  assert.equal(res2.state, 'CAMERA_CONNECTION_LOST');
  assert.equal(res2.confirmedOutOfView, false);
});

test('8. Active calibration mode reflects CALIBRATING state', () => {
  const gate = new FacePresenceGate(0);
  for (let t = 0; t <= 2000; t += 100) gate.update(frame(t));

  const res = gate.update(frame(2100, true, null, true, true, true, true));
  assert.equal(res.state, 'CALIBRATING');
});
