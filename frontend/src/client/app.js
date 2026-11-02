import { state, persist, getStudent, getAccount, currentAccount, currentPlan, isStudentAccount, currentTutorId, linkedStudentIds, tutorLinkForStudent, currentTutorStudents, tasksForCurrentTutor, tasksForCurrentStudent, currentPlanner, currentBoard, studentName, studentColor, taskStatusLabel, nextLesson, currentTutorLessons } from './state.js';
import { pageNames, initialsByColor, pad, dateToISO, addDaysISO, escapeHTML, useIcon, initials, formatDate, dateLabel, dueLabel } from './utils.js';
import { wrapCanvasText, boardElementBounds, hitBoardElement, distanceToSegment, moveBoardElement } from './board-geometry.js';
import { createRoomController } from './room.js';
import { createViews } from './views.js';
import { createForms } from './forms.js';

  const appState = { currentView: 'overview', boardTextPosition: null };
  const uiState = { taskFilter: 'all', boardTool: 'pen', boardColor: '#314a2e', boardWidth: 3 };
  let boardHistory = [];
  let boardDrawing = false;
  let lastPoint = null;
  let boardPointerStart = null;
  let boardDragElementId = null;
  let boardDraftId = null;
  let boardSelectedId = null;
  let boardDirty = false;
  const pageContent = document.getElementById('pageContent');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalCard = document.getElementById('modalCard');
  const sidebar = document.getElementById('sidebar');

  function createBoard(name, lessonId = null) {
    const id = `board-${Date.now()}`;
    const board = { id, tutorId: currentTutorId(), name: name.trim() || 'Новая доска', lessonIds: lessonId ? [lessonId] : [], elements: [], updatedAt: Date.now() };
    state.boards.push(board);
    if (lessonId) { const lesson = state.lessons.find((item) => item.id === lessonId); if (lesson) lesson.boardId = id; }
    state.currentBoardId = id;
    persist();
    return board;
  }
  function openLessonBoard(lesson) {
    if (!lesson) return;
    let board = state.boards.find((item) => item.id === lesson.boardId);
    if (!board) board = createBoard(lesson.title, lesson.id);
    else if (!board.lessonIds.includes(lesson.id)) { board.lessonIds.push(lesson.id); lesson.boardId = board.id; persist(); }
    state.currentBoardId = board.id;
    persist();
    navigate('board');
  }

  const toast = (message, detail = '') => {
    const region = document.getElementById('toastRegion');
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `${escapeHTML(message)}${detail ? `<small>${escapeHTML(detail)}</small>` : ''}`;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 3500);
  };

  const room = createRoomController({ state, nextLesson, currentTutorLessons, navigate, toast, pad, useIcon });
  const views = createViews({ pageContent, escapeHTML, useIcon, state, getStudent, getAccount, tasksForCurrentStudent, initials, studentColor, pad, currentAccount, currentPlan, currentTutorStudents, currentTutorLessons, addDaysISO, nextLesson, tasksForCurrentTutor, linkedStudentIds, tutorLinkForStudent, isStudentAccount, currentTutorId, currentPlanner, taskStatusLabel, dueLabel, dateLabel, formatDate, uiState, createBoard, setupBoard, room, studentName, persist, toast });
  const forms = createForms({ state, pad, useIcon, currentTutorStudents, currentTutorLessons, escapeHTML, dateLabel, toast, addDaysISO, getStudent, getAccount, currentTutorId, currentPlanner, studentName, currentBoard, createBoard, pushBoardHistory, saveBoard, uiState, appState, persist, render, views, modalBackdrop, modalCard, initialsByColor });

  function render() {
    if (isStudentAccount() && ['students', 'lessons', 'subscription'].includes(appState.currentView)) appState.currentView = 'overview';
    const label = pageNames[appState.currentView] || pageNames.overview;
    const account = currentAccount(); const studentMode = account?.role === 'student'; const plan = currentPlan();
    document.getElementById('currentPageLabel').textContent = label;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === appState.currentView));
    document.querySelectorAll('[data-nav-tutor]').forEach((item) => { item.hidden = studentMode; });
    document.getElementById('sidebarPlan').hidden = studentMode;
    document.querySelector('.workspace-label').textContent = studentMode ? 'ЛИЧНЫЙ КАБИНЕТ' : 'РАБОЧЕЕ ПРОСТРАНСТВО';
    document.getElementById('studentCount').textContent = plan === 'extreme' ? String(currentTutorStudents().length) : 'EXT';
    document.getElementById('taskCount').textContent = studentMode ? String(tasksForCurrentStudent().filter((task) => task.status !== 'complete').length) : plan === 'extreme' ? String(tasksForCurrentTutor().filter((task) => task.status !== 'complete').length) : 'EXT';
    document.getElementById('taskNavLabel').textContent = studentMode ? 'Домашняя работа' : 'Планер';
    document.getElementById('lessonTier').hidden = plan === 'extreme' || studentMode;
    document.getElementById('sidePlanName').textContent = plan === 'extreme' ? 'Extreme' : 'Light';
    document.getElementById('sidePlanDescription').textContent = plan === 'extreme' ? 'Все инструменты для работы' : 'Созвоны и интерактивная доска';
    document.getElementById('profileName').textContent = account?.name || 'Гость';
    document.getElementById('profileRole').textContent = studentMode ? 'Ученик' : 'Репетитор';
    document.getElementById('profileInitials').textContent = initials(account?.name || '?');
    document.getElementById('topAvatar').textContent = initials(account?.name || '?');
    document.getElementById('topbarSpaceLabel').textContent = studentMode ? 'Личный кабинет ученика' : 'Пространство репетитора';
    document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date());
    document.getElementById('footerYear').textContent = new Date().getFullYear();
    ({ overview: views.renderOverview, students: views.renderStudents, lessons: views.renderLessons, board: views.renderBoard, tasks: views.renderTasks, subscription: views.renderSubscription, room: views.renderRoom }[appState.currentView] || views.renderOverview)();
    sidebar.classList.remove('is-open');
  }
  function navigate(view) {
    if (!pageNames[view]) return;
    if (appState.currentView === 'room' && view !== 'room') room.stopRoomMedia();
    appState.currentView = view;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setupBoard() {
    const canvas = document.getElementById('whiteboard');
    if (!canvas) return;
    const board = currentBoard();
    if (!board) return;
    const wrap = canvas.parentElement;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, wrap.clientWidth); const height = Math.max(1, wrap.clientHeight);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d'); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.lineCap = 'round'; context.lineJoin = 'round';
    boardHistory = [];
    drawBoardElements(context, board, width, height);
    const point = (event) => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    canvas.onpointerdown = (event) => {
      canvas.setPointerCapture(event.pointerId);
      const p = point(event); const normalized = { x: p.x / width, y: p.y / height };
      if (uiState.boardTool === 'select') {
        const hit = hitBoardElement(board, p.x, p.y, width, height);
        if (hit) pushBoardHistory(board);
        boardDragElementId = hit?.id || null; lastPoint = normalized; boardSelectedId = boardDragElementId;
        drawBoardElements(context, board, width, height); canvas.style.cursor = hit ? 'move' : 'default'; return;
      }
      if (uiState.boardTool === 'eraser') {
        const hit = hitBoardElement(board, p.x, p.y, width, height);
        if (hit) { pushBoardHistory(board); board.elements = board.elements.filter((element) => element.id !== hit.id); saveBoard(board); drawBoardElements(context, board, width, height); updateBoardElementCount(board); }
        return;
      }
      if (uiState.boardTool === 'text' || uiState.boardTool === 'sticky') { appState.boardTextPosition = normalized; forms.openForm(uiState.boardTool === 'text' ? 'board-text' : 'board-sticky'); return; }
      pushBoardHistory(board); boardDrawing = true; boardPointerStart = normalized; lastPoint = normalized;
      const element = { id: `element-${Date.now()}`, type: uiState.boardTool === 'pen' ? 'path' : uiState.boardTool, color: uiState.boardColor, width: uiState.boardWidth, points: [{ x: normalized.x, y: normalized.y }], x1: normalized.x, y1: normalized.y, x2: normalized.x, y2: normalized.y };
      if (uiState.boardTool === 'sticky' || uiState.boardTool === 'text') return;
      board.elements.push(element); boardDraftId = element.id;
    };
    canvas.onpointermove = (event) => {
      const p = point(event); const normalized = { x: p.x / width, y: p.y / height };
      if (boardDragElementId) {
        const element = board.elements.find((item) => item.id === boardDragElementId);
        if (element && lastPoint) { moveBoardElement(element, normalized.x - lastPoint.x, normalized.y - lastPoint.y); lastPoint = normalized; drawBoardElements(context, board, width, height); }
        return;
      }
      if (!boardDrawing) { if (uiState.boardTool === 'eraser') canvas.style.cursor = hitBoardElement(board, p.x, p.y, width, height) ? 'pointer' : 'crosshair'; return; }
      const element = board.elements.find((item) => item.id === boardDraftId); if (!element) return;
      const status = document.getElementById('boardSaveState'); if (status) status.textContent = 'Изменения…';
      if (uiState.boardTool === 'pen' && event.shiftKey) {
        const startX = boardPointerStart.x * width; const startY = boardPointerStart.y * height; const dx = p.x - startX; const dy = p.y - startY;
        const end = Math.abs(dx) >= Math.abs(dy) ? { x: normalized.x, y: boardPointerStart.y } : { x: boardPointerStart.x, y: normalized.y };
        element.type = 'line'; element.shiftLine = true; element.points = [boardPointerStart, end]; element.x1 = boardPointerStart.x; element.y1 = boardPointerStart.y; element.x2 = end.x; element.y2 = end.y;
      } else if (uiState.boardTool === 'pen') {
        if (element.shiftLine) { element.type = 'path'; element.shiftLine = false; element.points = [boardPointerStart]; }
        element.points.push(normalized);
      } else if (element.type === 'path') element.points.push(normalized);
      else { element.x2 = normalized.x; element.y2 = normalized.y; }
      drawBoardElements(context, board, width, height);
    };
    const finish = () => {
      if (boardDrawing) { boardDrawing = false; const draft = board.elements.find((element) => element.id === boardDraftId); if (draft) delete draft.shiftLine; boardDraftId = null; saveBoard(board); updateBoardElementCount(board); drawBoardElements(context, board, width, height); }
      if (boardDragElementId) { boardDragElementId = null; saveBoard(board); }
    };
    canvas.onpointerup = canvas.onpointercancel = finish;
    canvas.ondblclick = (event) => { const p = point(event); const hit = hitBoardElement(board, p.x, p.y, width, height); if (hit && (hit.type === 'text' || hit.type === 'sticky')) forms.openForm('board-edit', hit.id); };
    canvas.onpointerleave = () => { if (!boardDrawing && !boardDragElementId) canvas.style.cursor = uiState.boardTool === 'select' ? 'default' : 'crosshair'; };
    const color = document.getElementById('boardColor'); color?.addEventListener('input', () => { uiState.boardColor = color.value; });
    const size = document.getElementById('brushSize'); size?.addEventListener('input', () => { uiState.boardWidth = Number(size.value); const label = document.getElementById('boardWidthLabel'); if (label) label.textContent = `${uiState.boardWidth}px`; });
    document.getElementById('boardSelect')?.addEventListener('change', (event) => { state.currentBoardId = event.target.value; boardHistory = []; boardSelectedId = null; persist(); views.renderBoard(); });
  }

  function pushBoardHistory(board = currentBoard()) {
    if (!board) return;
    boardHistory.push(JSON.parse(JSON.stringify(board.elements)));
    if (boardHistory.length > 40) boardHistory.shift();
  }
  function saveBoard(board = currentBoard()) {
    if (!board) return;
    board.updatedAt = Date.now(); persist();
    const status = document.getElementById('boardSaveState'); if (status) status.textContent = 'Сохранено';
  }
  function updateBoardElementCount(board = currentBoard()) {
    const chip = document.querySelector('.board-page-chip'); if (chip && board) chip.textContent = `${board.elements.length} элементов`;
  }
  function drawBoardElements(context, board, width, height) {
    context.clearRect(0, 0, width, height);
    for (const element of board.elements) {
      const color = element.color || '#314a2e'; const lineWidth = element.width || 3;
      context.strokeStyle = color; context.fillStyle = color; context.lineWidth = lineWidth; context.lineCap = 'round'; context.lineJoin = 'round';
      if (element.type === 'path') {
        if (!element.points?.length) continue;
        context.beginPath(); context.moveTo(element.points[0].x * width, element.points[0].y * height);
        element.points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height)); context.stroke();
      } else if (element.type === 'line' || element.type === 'arrow') {
        const x1 = element.x1 * width; const y1 = element.y1 * height; const x2 = element.x2 * width; const y2 = element.y2 * height;
        context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
        if (element.type === 'arrow') { const angle = Math.atan2(y2 - y1, x2 - x1); const head = Math.max(10, lineWidth * 3); context.beginPath(); context.moveTo(x2, y2); context.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6)); context.moveTo(x2, y2); context.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6)); context.stroke(); }
      } else if (element.type === 'rect' || element.type === 'ellipse') {
        const x1 = element.x1 * width; const y1 = element.y1 * height; const x2 = element.x2 * width; const y2 = element.y2 * height;
        const x = Math.min(x1, x2); const y = Math.min(y1, y2); const w = Math.abs(x2 - x1); const h = Math.abs(y2 - y1);
        context.beginPath(); if (element.type === 'rect') context.rect(x, y, w, h); else context.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); context.stroke();
      } else if (element.type === 'sticky') {
        const x = element.x * width; const y = element.y * height; const w = element.w * width; const h = element.h * height;
        context.fillStyle = element.fill || '#fff1a8'; context.fillRect(x, y, w, h); context.strokeStyle = 'rgba(80,70,30,.14)'; context.strokeRect(x, y, w, h);
        context.fillStyle = '#3c4137'; context.font = '500 14px system-ui'; wrapCanvasText(context, element.text || '', x + 12, y + 22, w - 22, 19, 5);
      } else if (element.type === 'text') {
        context.fillStyle = color; context.font = `600 ${element.fontSize || 20}px system-ui`; const lines = String(element.text || '').split('\n'); lines.forEach((line, index) => context.fillText(line, element.x * width, element.y * height + index * ((element.fontSize || 20) * 1.35)));
      }
      if (element.id === boardSelectedId) { const box = boardElementBounds(element, width, height); context.save(); context.strokeStyle = '#7496cc'; context.lineWidth = 1; context.setLineDash([4, 3]); context.strokeRect(box.x - 5, box.y - 5, box.w + 10, box.h + 10); context.restore(); }
    }
  }
  function undoBoard() {
    const board = currentBoard(); const canvas = document.getElementById('whiteboard'); if (!canvas || !board) return;
    const elements = boardHistory.pop(); if (!elements) { toast('Пока нечего отменять'); return; }
    board.elements = elements; saveBoard(board); drawBoardElements(canvas.getContext('2d'), board, canvas.clientWidth, canvas.clientHeight); updateBoardElementCount(board);
  }
  function clearBoard() {
    const board = currentBoard(); const canvas = document.getElementById('whiteboard'); if (!canvas || !board) return;
    pushBoardHistory(board); board.elements = []; boardSelectedId = null; saveBoard(board); drawBoardElements(canvas.getContext('2d'), board, canvas.clientWidth, canvas.clientHeight); updateBoardElementCount(board);
  }
  function exportBoard() {
    const canvas = document.getElementById('whiteboard'); if (!canvas) return;
    const board = currentBoard(); const output = document.createElement('canvas'); output.width = canvas.clientWidth * (window.devicePixelRatio || 1); output.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    const context = output.getContext('2d'); context.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight); drawBoardElements(context, board, canvas.clientWidth, canvas.clientHeight);
    const link = document.createElement('a'); link.download = `tandem-доска-${dateToISO(new Date())}.png`; link.href = output.toDataURL('image/png'); link.click();
  }

  document.addEventListener('click', async (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { event.preventDefault(); navigate(viewButton.dataset.view); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'menu') sidebar.classList.toggle('is-open');
    else if (action === 'open-modal') forms.openForm(button.dataset.modal);
    else if (action === 'close-modal') forms.closeModal();
    else if (action === 'start-lesson') room.startLesson(id);
    else if (action === 'choose-plan') { const account = currentAccount(); if (account) account.plan = button.dataset.plan; state.plan = button.dataset.plan; persist(); render(); toast(`${currentPlan() === 'light' ? 'Light' : 'Extreme'} выбран в демо-режиме`, 'Платёжный модуль пока не подключён.'); }
    else if (action === 'task-filter') { uiState.taskFilter = button.dataset.filter; views.renderTasks(); }
    else if (action === 'task-status') { const task = state.tasks.find((item) => item.id === id); if (task) { task.status = task.kind === 'personal' ? (task.status === 'complete' ? 'todo' : 'complete') : (({ todo: 'submitted', submitted: 'complete', complete: 'todo' })[task.status] || 'todo'); persist(); render(); toast(task.kind === 'personal' ? (task.status === 'complete' ? 'Личная задача выполнена' : 'Личная задача возвращена в список') : `Статус: ${taskStatusLabel(task.status)}`, task.title); } }
    else if (action === 'student-task-status') { const task = state.tasks.find((item) => item.id === id); if (task && task.studentId === currentAccount()?.studentId) { task.status = task.status === 'submitted' ? 'todo' : 'submitted'; persist(); views.renderTasks(); toast(task.status === 'submitted' ? 'Задание отправлено репетитору' : 'Задание возвращено в работу'); } }
    else if (action === 'copy-task') forms.openForm('copy-task', id);
    else if (action === 'lesson-board') { const lesson = state.lessons.find((item) => item.id === id); openLessonBoard(lesson); }
    else if (action === 'toggle-camera') await room.toggleCamera(button);
    else if (action === 'toggle-mic') await room.toggleMic(button);
    else if (action === 'share-screen') await room.shareScreen(button);
    else if (action === 'open-board') { const lesson = state._activeLesson || nextLesson(); if (lesson) openLessonBoard(lesson); else navigate('board'); room.stopRoomMedia(); toast('Доска открыта', 'В этой доске можно продолжить работу на следующих занятиях.'); }
    else if (action === 'leave-room') { room.stopRoomMedia(); navigate('overview'); toast('Вы вышли из демо-комнаты'); }
    else if (action === 'board-tool') { uiState.boardTool = button.dataset.tool; boardSelectedId = null; document.querySelectorAll('[data-tool]').forEach((tool) => tool.classList.toggle('active', tool === button)); const canvas = document.getElementById('whiteboard'); if (canvas) { canvas.style.cursor = uiState.boardTool === 'select' ? 'default' : 'crosshair'; drawBoardElements(canvas.getContext('2d'), currentBoard(), canvas.clientWidth, canvas.clientHeight); } }
    else if (action === 'board-undo') undoBoard();
    else if (action === 'board-clear') clearBoard();
    else if (action === 'board-export') exportBoard();
    else if (action === 'board-new') forms.openForm('board-new');
    else if (action === 'board-attach') forms.openForm('board-attach');
    else if (action === 'planner-add') views.addPlannerBlock(button.dataset.type);
    else if (action === 'planner-toggle') { const block = currentPlanner().blocks.find((item) => item.id === id); if (block) { block.checked = !block.checked; persist(); views.renderTasks(); } }
    else if (action === 'planner-up') views.reorderPlannerBlock(id, -1);
    else if (action === 'planner-down') views.reorderPlannerBlock(id, 1);
    else if (action === 'planner-remove') views.deletePlannerBlock(id);
    else if (action === 'account-login') forms.openForm('account-login');
    else if (action === 'account-register') forms.openForm('account-register');
    else if (action === 'google-login') toast('Нужна настройка Google OAuth', 'Подключение выполняется через OAuth Client ID и серверный callback.');
    else if (action === 'student-note') { const student = getStudent(id); const link = tutorLinkForStudent(id); if (student) { forms.showModal(escapeHTML(student.name), 'Заметка доступна только в вашем профиле преподавателя.', `<form class="form-grid" data-form="student-note" data-id="${escapeHTML(id)}"><div class="form-field"><label for="editNote">Личная заметка</label><textarea class="form-textarea" id="editNote" name="note">${escapeHTML(link?.note || '')}</textarea></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button type="submit" class="button button-primary">Сохранить заметку</button></div></form>`); } }
    else if (action === 'profile') forms.openForm('account-login');
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]'); if (!form) return;
    event.preventDefault();
    if (form.dataset.form === 'student-note') { const link = tutorLinkForStudent(form.dataset.id); if (link) { link.note = new FormData(form).get('note').trim(); persist(); forms.closeModal(); if (appState.currentView === 'students') views.renderStudents(); else render(); toast('Заметка сохранена'); } return; }
    forms.submitForm(form);
  });
  document.getElementById('studentSearch')?.addEventListener('input', filterStudents);
  document.addEventListener('input', (event) => {
    if (event.target.id === 'studentSearch' || event.target.id === 'subjectFilter') filterStudents();
    if (event.target.matches('[data-planner-edit]')) { const block = currentPlanner().blocks.find((item) => item.id === event.target.dataset.plannerEdit); if (block) block.text = event.target.innerText; }
    if (event.target.matches('[data-planner-title]')) currentPlanner().title = event.target.innerText;
    if (event.target.matches('[data-planner-edit],[data-planner-title]')) {
      const status = document.getElementById('plannerSaveState'); if (status) status.textContent = 'Сохраняем…';
      window.clearTimeout(plannerPersistTimer); plannerPersistTimer = window.setTimeout(() => { persist(); const saveLabel = document.getElementById('plannerSaveState'); if (saveLabel) saveLabel.textContent = 'Сохранено'; }, 350);
    }
  });
  function filterStudents() {
    const search = (document.getElementById('studentSearch')?.value || '').toLowerCase().trim();
    const subject = document.getElementById('subjectFilter')?.value || 'all';
    document.querySelectorAll('[data-student-card]').forEach((card) => { card.hidden = !(card.dataset.name.includes(search) && (subject === 'all' || card.dataset.subject === subject)); });
  }
  modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) forms.closeModal(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modalBackdrop.hidden) forms.closeModal();
    if ((event.key === 'Delete' || event.key === 'Backspace') && appState.currentView === 'board' && boardSelectedId && !event.target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
      const board = currentBoard(); const canvas = document.getElementById('whiteboard');
      if (board && canvas) { pushBoardHistory(board); board.elements = board.elements.filter((item) => item.id !== boardSelectedId); boardSelectedId = null; saveBoard(board); drawBoardElements(canvas.getContext('2d'), board, canvas.clientWidth, canvas.clientHeight); updateBoardElementCount(board); }
    }
  });
  window.addEventListener('resize', () => { if (appState.currentView === 'board') setupBoard(); });

  render();
