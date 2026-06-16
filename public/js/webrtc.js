// Voice + video calling over WebRTC, signaled through the backend WS relay.
// iOS Safari: playsinline on <video>, getUserMedia behind a user gesture,
// Google STUN server configured.

import { api } from './api.js';
import { state, emit, on } from './state.js';
import { send as wsSend } from './ws.js';
import { $, show, hide, announce, announceAlert, toast, comingSoon, uuid } from './ui.js';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// Call state machine.
let call = null;
/* call = {
     id, peerId, peerName, callType,
     role: 'caller'|'callee',
     status: 'ringing'|'incoming'|'connecting'|'active'|'ended',
     pc, localStream, startedAt, logged,
     pendingOffer  // for callee until accept
   } */

function resetCall() { call = null; }

// ---------------------------------------------------------------- UI helpers
function overlay() { return $('#call-overlay'); }
function setStatus(text) {
  $('#call-status-text').textContent = text;
}
function showOverlay(peerName, callType) {
  const ov = overlay();
  ov.classList.toggle('call-overlay--audio', callType === 'voice');
  $('#call-peer-name').textContent = peerName;
  show(ov);
}
function hideOverlay() {
  hide(overlay());
  $('#remote-video').srcObject = null;
  $('#local-video').srcObject = null;
}

function setControls({ accept, decline, mute, camera, end }) {
  $('#call-accept-btn').hidden = !accept;
  $('#call-decline-btn').hidden = !decline;
  $('#call-mute-btn').hidden = !mute;
  $('#call-camera-btn').hidden = !camera;
  $('#call-end-btn').hidden = !end;
  // Extended controls visible only during an in-progress/active call.
  const inCall = mute || end;
  const isVideo = call && call.callType === 'video';
  $('#call-speaker-btn').hidden = !inCall;
  $('#call-hold-btn').hidden = !inCall;
  $('#call-addparticipant-btn').hidden = !inCall;
  $('#call-switchvideo-btn').hidden = !(inCall && call && call.callType === 'voice');
  $('#call-switchcam-btn').hidden = !(inCall && isVideo);
  $('#call-pip-btn').hidden = !(inCall && isVideo);
}

// ---------------------------------------------------------------- media
async function getMedia(callType) {
  const constraints = callType === 'video'
    ? { audio: true, video: { facingMode: 'user' } }
    : { audio: true, video: false };
  return navigator.mediaDevices.getUserMedia(constraints);
}

function attachLocal(stream) {
  call.localStream = stream;
  const lv = $('#local-video');
  if (call.callType === 'video') { lv.srcObject = stream; lv.play?.().catch(() => {}); }
}

// ---------------------------------------------------------------- peer connection
function buildPeerConnection() {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  call.pc = pc;

  for (const track of call.localStream.getTracks()) pc.addTrack(track, call.localStream);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      wsSend({
        type: 'webrtc:ice', callId: call.id,
        from: state.userId, to: call.peerId, candidate: e.candidate,
      });
    }
  };

  pc.ontrack = (e) => {
    const rv = $('#remote-video');
    if (rv.srcObject !== e.streams[0]) {
      rv.srcObject = e.streams[0];
      rv.play?.().catch(() => {});
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      if (call && call.status !== 'active') {
        call.status = 'active';
        setStatus('Connected');
        announce('Call connected.');
      }
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      if (call && call.status === 'active') {
        setStatus('Connection lost');
      }
    }
  };
  return pc;
}

// ---------------------------------------------------------------- outgoing
async function startCall(peer, callType) {
  if (call) { toast('Already in a call.'); return; }
  try {
    const stream = await getMedia(callType);
    call = {
      id: uuid(), peerId: peer.id, peerName: peer.displayName, callType,
      role: 'caller', status: 'ringing', startedAt: Date.now(), logged: false,
    };
    attachLocal(stream);
    showOverlay(peer.displayName, callType);
    setStatus('Calling…');
    setControls({ end: true, mute: true, camera: callType === 'video' });
    announceAlert(`Calling ${peer.displayName}`);

    buildPeerConnection();
    const offer = await call.pc.createOffer();
    await call.pc.setLocalDescription(offer);

    wsSend({ type: 'call:invite', callId: call.id, from: state.userId, to: peer.id, callType });
    wsSend({ type: 'webrtc:offer', callId: call.id, from: state.userId, to: peer.id, sdp: offer });
  } catch (err) {
    toast(mediaError(err));
    teardown('missed', false);
  }
}

// ---------------------------------------------------------------- incoming
function onIncoming({ callId, from, fromName, callType }) {
  if (call) {
    // already busy → auto-decline
    wsSend({ type: 'call:decline', callId, from: state.userId, to: from });
    return;
  }
  call = {
    id: callId, peerId: from, peerName: fromName || 'Caller', callType,
    role: 'callee', status: 'incoming', startedAt: Date.now(), logged: false,
    pendingOffer: null,
  };
  showOverlay(call.peerName, callType);
  setStatus(`Incoming ${callType} call`);
  setControls({ accept: true, decline: true });
  announceAlert(`Incoming ${callType} call from ${call.peerName}. Accept or decline.`);
}

async function acceptCall() {
  if (!call || call.role !== 'callee') return;
  try {
    const stream = await getMedia(call.callType);
    attachLocal(stream);
    call.status = 'connecting';
    setStatus('Connecting…');
    setControls({ end: true, mute: true, camera: call.callType === 'video' });

    buildPeerConnection();
    wsSend({ type: 'call:accept', callId: call.id, from: state.userId, to: call.peerId });

    if (call.pendingOffer) {
      await applyOffer(call.pendingOffer);
      call.pendingOffer = null;
    }
  } catch (err) {
    toast(mediaError(err));
    wsSend({ type: 'call:decline', callId: call.id, from: state.userId, to: call.peerId });
    teardown('declined', true);
  }
}

function declineCall() {
  if (!call) return;
  wsSend({ type: 'call:decline', callId: call.id, from: state.userId, to: call.peerId });
  teardown('declined', true);
}

async function applyOffer(sdp) {
  await call.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await call.pc.createAnswer();
  await call.pc.setLocalDescription(answer);
  wsSend({ type: 'webrtc:answer', callId: call.id, from: state.userId, to: call.peerId, sdp: answer });
}

// ---------------------------------------------------------------- signaling in
async function onOffer({ callId, sdp }) {
  if (!call || call.id !== callId) return;
  if (call.role === 'callee' && !call.pc) {
    // offer arrived before accept → buffer it
    call.pendingOffer = sdp;
    return;
  }
  if (call.pc) await applyOffer(sdp);
}

async function onAnswer({ callId, sdp }) {
  if (!call || call.id !== callId || !call.pc) return;
  await call.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  call.status = 'connecting';
  setStatus('Connecting…');
}

async function onIce({ callId, candidate }) {
  if (!call || call.id !== callId || !call.pc) return;
  try { await call.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
  catch (e) { /* ignore late candidates */ }
}

function onAccept({ callId }) {
  if (!call || call.id !== callId || call.role !== 'caller') return;
  call.status = 'connecting';
  setStatus('Connecting…');
}

function onRemoteDecline({ callId }) {
  if (!call || call.id !== callId) return;
  toast(`${call.peerName} declined.`);
  teardown('declined', false);
}

function onRemoteEnd({ callId }) {
  if (!call || call.id !== callId) return;
  toast('Call ended.');
  teardown('completed', false);
}

function onRemoteCancel({ callId }) {
  if (!call || call.id !== callId) return;
  toast('Caller cancelled.');
  teardown('missed', false);
}

function onUnavailable({ callId }) {
  if (!call || call.id !== callId) return;
  toast(`${call.peerName} is unavailable.`);
  teardown('missed', false);
}

// ---------------------------------------------------------------- hang up
function endCall() {
  if (!call) return;
  // notify peer depending on stage
  if (call.role === 'caller' && (call.status === 'ringing')) {
    wsSend({ type: 'call:cancel', callId: call.id, from: state.userId, to: call.peerId });
    teardown('missed', false);
  } else {
    wsSend({ type: 'call:end', callId: call.id, from: state.userId, to: call.peerId });
    teardown(call.status === 'active' || call.status === 'connecting' ? 'completed' : 'missed', false);
  }
}

// Tear down media + pc, log the call, reset UI.
function teardown(status, isDeclineByMe) {
  if (!call) { hideOverlay(); return; }
  const c = call;
  // stop media
  if (c.localStream) for (const t of c.localStream.getTracks()) t.stop();
  if (c.pc) { try { c.pc.close(); } catch {} }

  // log once (caller logs completed/missed; callee logs declined when they decline)
  logCall(c, status, isDeclineByMe);

  call = null;
  setControls({});
  hideOverlay();
  announce('Call ended.');
}

function logCall(c, status, isDeclineByMe) {
  if (c.logged) return;
  c.logged = true;
  // Avoid double logs: caller always logs; callee logs only if THEY declined.
  const iAmCaller = c.role === 'caller';
  if (!iAmCaller && !isDeclineByMe) {
    // callee on a completed/normal end: let caller own the log
    emit('calls:changed', null);
    return;
  }
  const callerId = iAmCaller ? state.userId : c.peerId;
  const calleeId = iAmCaller ? c.peerId : state.userId;
  api.logCall({
    callerId, calleeId,
    type: c.callType,
    status,
    startedAt: c.startedAt,
    endedAt: Date.now(),
  }).then(() => emit('calls:changed', null)).catch(() => {});
}

// ---------------------------------------------------------------- controls
function toggleMute() {
  if (!call || !call.localStream) return;
  const track = call.localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  const muted = !track.enabled;
  const btn = $('#call-mute-btn');
  btn.setAttribute('aria-pressed', String(muted));
  btn.setAttribute('aria-label', muted ? 'Unmute microphone' : 'Mute microphone');
  btn.querySelector('.callbtn__label').textContent = muted ? 'Unmute' : 'Mute';
  announce(muted ? 'Microphone muted' : 'Microphone unmuted');
}

function toggleCamera() {
  if (!call || !call.localStream) return;
  const track = call.localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  const off = !track.enabled;
  const btn = $('#call-camera-btn');
  btn.setAttribute('aria-pressed', String(off));
  btn.setAttribute('aria-label', off ? 'Turn camera on' : 'Turn camera off');
  btn.querySelector('.callbtn__label').textContent = off ? 'Cam on' : 'Camera';
  announce(off ? 'Camera off' : 'Camera on');
}

function mediaError(err) {
  if (err && err.name === 'NotAllowedError') return 'Camera/microphone permission denied.';
  if (err && err.name === 'NotFoundError') return 'No camera/microphone found.';
  return 'Could not access camera/microphone.';
}

// ---------------------------------------------------------------- extended controls
let facing = 'user';
async function switchCamera() {
  if (!call || !call.localStream || call.callType !== 'video') { comingSoon('Switch camera'); return; }
  const sender = call.pc && call.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
  facing = facing === 'user' ? 'environment' : 'user';
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) throw new Error('no track');
    if (sender) await sender.replaceTrack(newTrack);
    // swap into local stream + preview
    const old = call.localStream.getVideoTracks()[0];
    if (old) { call.localStream.removeTrack(old); old.stop(); }
    call.localStream.addTrack(newTrack);
    $('#local-video').srcObject = call.localStream;
    announce(`Switched to ${facing === 'user' ? 'front' : 'rear'} camera.`);
    toast(`${facing === 'user' ? 'Front' : 'Rear'} camera`);
  } catch (e) {
    facing = facing === 'user' ? 'environment' : 'user'; // revert
    comingSoon('Switch camera (not supported on this device)');
  }
}

async function togglePip() {
  const rv = $('#remote-video');
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (rv.requestPictureInPicture && document.pictureInPictureEnabled) {
      await rv.requestPictureInPicture();
      announce('Picture-in-picture enabled.');
    } else {
      comingSoon('Picture-in-picture');
    }
  } catch (e) {
    comingSoon('Picture-in-picture');
  }
}

// ---------------------------------------------------------------- init
export function initCalls() {
  $('#call-accept-btn').addEventListener('click', acceptCall);
  $('#call-decline-btn').addEventListener('click', declineCall);
  $('#call-end-btn').addEventListener('click', endCall);
  $('#call-mute-btn').addEventListener('click', toggleMute);
  $('#call-camera-btn').addEventListener('click', toggleCamera);

  // Extended controls
  $('#call-switchcam-btn').addEventListener('click', switchCamera);   // WORKING where supported
  $('#call-pip-btn').addEventListener('click', togglePip);            // WORKING where supported
  $('#call-speaker-btn').addEventListener('click', () => comingSoon('Speaker toggle'));
  $('#call-hold-btn').addEventListener('click', () => comingSoon('Hold'));
  $('#call-addparticipant-btn').addEventListener('click', () => comingSoon('Add participant'));
  $('#call-switchvideo-btn').addEventListener('click', () => comingSoon('Switch to video'));

  on('call:start', ({ peer, callType }) => startCall(peer, callType));

  // WS signaling
  on('call:incoming', onIncoming);
  on('call:accept', onAccept);
  on('call:decline', onRemoteDecline);
  on('call:end', onRemoteEnd);
  on('call:cancel', onRemoteCancel);
  on('call:unavailable', onUnavailable);
  on('webrtc:offer', onOffer);
  on('webrtc:answer', onAnswer);
  on('webrtc:ice', onIce);
}
