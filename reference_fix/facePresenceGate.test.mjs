import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FacePresenceGate } from './facePresenceGate.ts';
const frame = (tMs, landmarksFace=true, fallbackFace=null, personVisible=true, freshFrame=true, cameraLive=true) =>
  ({ tMs, landmarksFace, fallbackFace, personVisible, freshFrame, cameraLive });

test('Normal stable candidate never appears absent', () => {
  const gate = new FacePresenceGate(0);
  for(let t=0;t<=7000;t+=100) {
    const result=gate.update(frame(t));
    assert.notEqual(result.state,'OUT_OF_VIEW_CONFIRMED');
    assert.notEqual(result.state,'FACE_NOT_VISIBLE');
  }
});
test('Three or more brief missed landmarks do not declare absence', () => {
  const g=new FacePresenceGate(0);
  for(let t=0;t<=2500;t+=100) g.update(frame(t));
  for(let t=2600;t<=3200;t+=100) {
    const s=g.update(frame(t,false,false,true));
    assert.notEqual(s.state,'OUT_OF_VIEW_CONFIRMED');
    assert.notEqual(s.state,'FACE_NOT_VISIBLE');
  }
  assert.equal(g.update(frame(3300,true,false,true)).state,'TRACKING_UNCERTAIN');
  assert.equal(g.update(frame(3400,true,false,true)).state,'PRESENT');
});
test('Face tracking failure and fallback unavailable are uncertainty, not candidate absence', () => {
  const g=new FacePresenceGate(0);
  for(let t=0;t<=2500;t+=100) g.update(frame(t));
  for(let t=2600;t<=12000;t+=100) {
    assert.ok(['PRESENT','TRACKING_UNCERTAIN'].includes(g.update(frame(t,null,null,null)).state));
  }
});
test('Profile face found by fallback remains present',()=>{
  const g=new FacePresenceGate(0);
  for(let t=0;t<=2000;t+=100) g.update(frame(t));
  const s=g.update(frame(2100,false,true,true));
  assert.equal(s.state,'PRESENT');
  assert.equal(g.update(frame(2200,false,true,true)).state,'PRESENT');
});
test('Visible body but hidden face never means out-of-view',()=>{
  const g=new FacePresenceGate(0);
  for(let t=0;t<=2300;t+=100) g.update(frame(t));
  let s;
  for(let t=2400;t<=10000;t+=100) s=g.update(frame(t,false,false,true));
  assert.equal(s.state,'FACE_NOT_VISIBLE');
  assert.equal(s.confirmedOutOfView,false);
});
test('Confirmed person out-of-view requires sustained double-negative detectors and no body',()=>{
  const g=new FacePresenceGate(0);
  for(let t=0;t<=2500;t+=100) g.update(frame(t));
  let s;
  for(let t=2600;t<6600;t+=100) {
    s=g.update(frame(t,false,false,false));
    assert.equal(s.confirmedOutOfView,false);
  }
  s=g.update(frame(6600,false,false,false));
  assert.equal(s.state,'OUT_OF_VIEW_CONFIRMED');
  assert.equal(s.confirmedOutOfView,true);
});
test('Camera interruption is coverage gap not face absence',()=>{
  const g=new FacePresenceGate(0);
  for(let t=0;t<=2500;t+=100) g.update(frame(t));
  assert.equal(g.update(frame(2600,null,null,null,false,true)).state,'COVERAGE_GAP');
  assert.equal(g.update(frame(2800,null,null,null,false,false)).state,'COVERAGE_GAP');
});
