export function createRoomController({ state, nextLesson, currentTutorLessons, navigate, toast, pad, useIcon }) {
  let localCameraStream = null;
  let localMicStream = null;
  let screenStream = null;
  let cameraEnabled = false;
  let micEnabled = false;
  let meetingTimer = null;
  let meetingStartedAt = 0;
  function startLesson(id) {
    state._activeLesson = state.lessons.find((lesson) => lesson.id === id) || nextLesson() || null;
    if (state._activeLesson?.boardId) state.currentBoardId = state._activeLesson.boardId;
    meetingStartedAt = Date.now();
    navigate('room');
    toast('Демо-комната готова', 'Включите камеру или покажите экран, когда будете готовы.');
  }
  function startRoomTimer() {
    window.clearInterval(meetingTimer);
    meetingStartedAt = meetingStartedAt || Date.now();
    const update = () => { const target = document.getElementById('roomTimer'); if (!target) return; const seconds = Math.floor((Date.now() - meetingStartedAt) / 1000); target.textContent = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`; };
    update(); meetingTimer = window.setInterval(update, 1000);
  }
  function stopRoomMedia() {
    window.clearInterval(meetingTimer); meetingTimer = null; meetingStartedAt = 0;
    [localCameraStream, localMicStream, screenStream].forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
    localCameraStream = null; localMicStream = null; screenStream = null; cameraEnabled = false; micEnabled = false;
  }
  async function toggleCamera(button) {
    if (cameraEnabled) {
      localCameraStream?.getTracks().forEach((track) => track.stop()); localCameraStream = null; cameraEnabled = false;
      const video = document.getElementById('localVideo'); if (video) { video.hidden = true; video.srcObject = null; }
      const avatar = document.querySelector('#tutorVideoTile .video-avatar'); if (avatar) avatar.hidden = false;
      button.classList.add('is-off'); button.classList.remove('is-on'); button.innerHTML = useIcon('cam-off');
      const stateLabel = document.getElementById('tutorVideoState'); if (stateLabel) stateLabel.innerHTML = `${useIcon('cam-off')} Камера выключена`;
      toast('Камера выключена'); return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Браузер не поддерживает камеру. Откройте страницу через localhost или HTTPS.');
      localCameraStream = await navigator.mediaDevices.getUserMedia({ video: true }); cameraEnabled = true;
      const video = document.getElementById('localVideo'); if (video) { video.srcObject = localCameraStream; video.hidden = false; }
      const avatar = document.querySelector('#tutorVideoTile .video-avatar'); if (avatar) avatar.hidden = true;
      button.classList.remove('is-off'); button.classList.add('is-on'); button.innerHTML = useIcon('cam');
      const stateLabel = document.getElementById('tutorVideoState'); if (stateLabel) stateLabel.innerHTML = `${useIcon('cam')} Камера включена`;
      toast('Камера включена', 'Изображение отображается только в этой демо-комнате.');
    } catch (error) { toast('Не удалось включить камеру', error.message || 'Проверьте разрешения браузера.'); }
  }
  async function toggleMic(button) {
    if (micEnabled) {
      localMicStream?.getTracks().forEach((track) => track.stop()); localMicStream = null; micEnabled = false;
      button.classList.add('is-off'); button.classList.remove('is-on'); button.innerHTML = useIcon('mic-off'); toast('Микрофон выключен'); return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Браузер не поддерживает доступ к микрофону.');
      localMicStream = await navigator.mediaDevices.getUserMedia({ audio: true }); micEnabled = true;
      button.classList.remove('is-off'); button.classList.add('is-on'); button.innerHTML = useIcon('mic');
      toast('Микрофон включён', 'Звук пока не передаётся другим участникам.');
    } catch (error) { toast('Не удалось включить микрофон', error.message || 'Проверьте разрешения браузера.'); }
  }
  async function shareScreen(button) {
    if (screenStream) { screenStream.getTracks().forEach((track) => track.stop()); screenStream = null; button.classList.remove('is-on'); restoreLocalVideo(); toast('Показ экрана завершён'); return; }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Демонстрация экрана доступна в браузере через localhost или HTTPS.');
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.getElementById('localVideo'); if (video) { video.srcObject = screenStream; video.hidden = false; }
      const avatar = document.querySelector('#tutorVideoTile .video-avatar'); if (avatar) avatar.hidden = true;
      const stateLabel = document.getElementById('tutorVideoState'); if (stateLabel) stateLabel.innerHTML = `${useIcon('monitor')} Экран показывается`;
      button.classList.add('is-on');
      screenStream.getVideoTracks()[0]?.addEventListener('ended', () => { screenStream = null; button.classList.remove('is-on'); restoreLocalVideo(); });
      toast('Демонстрация экрана включена', 'Она видна только в вашем окне прототипа.');
    } catch (error) { toast('Не удалось показать экран', error.message || 'Выберите экран или окно для демонстрации.'); }
  }
  function restoreLocalVideo() {
    const video = document.getElementById('localVideo'); const avatar = document.querySelector('#tutorVideoTile .video-avatar'); const label = document.getElementById('tutorVideoState');
    if (cameraEnabled && localCameraStream) { if (video) { video.srcObject = localCameraStream; video.hidden = false; } if (avatar) avatar.hidden = true; if (label) label.innerHTML = `${useIcon('cam')} Камера включена`; }
    else { if (video) { video.srcObject = null; video.hidden = true; } if (avatar) avatar.hidden = false; if (label) label.innerHTML = `${useIcon('cam-off')} Камера выключена`; }
  }

  return { startLesson, startRoomTimer, stopRoomMedia, toggleCamera, toggleMic, shareScreen };
}
