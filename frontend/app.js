(() => {
  const STORAGE_KEY = 'tandem-tutor-prototype-v2';
  const LEGACY_STORAGE_KEY = 'tandem-tutor-prototype-v1';
  const pageNames = { overview: 'Обзор', students: 'Ученики', lessons: 'Занятия', messages: 'Сообщения', board: 'Интерактивная доска', videos: 'Видеоуроки', homework: 'Домашние задания', tasks: 'Планер', notion: 'Notion', subscription: 'Тарифы', room: 'Звонки' };
  const initialsByColor = ['avatar--mint', 'avatar--lilac', 'avatar--sky', 'avatar--rose', 'avatar--gold'];
  const pad = (value) => String(value).padStart(2, '0');
  const dateToISO = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const addDaysISO = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return dateToISO(date); };
  const sampleState = () => ({
    plan: 'light', students: [], lessons: [], tasks: [], videos: [], currentAccountId: null,
    accounts: [], tutorLinks: [], boards: [], currentBoardId: null, plannerByTutor: {}, notesByOwner: {},
  });
  const loadState = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!stored) return sampleState();
      const value = JSON.parse(stored);
      const fresh = sampleState();
      return {
        ...fresh, ...value,
        students: Array.isArray(value.students) ? value.students : [],
        lessons: Array.isArray(value.lessons) ? value.lessons : [],
        tasks: Array.isArray(value.tasks) ? value.tasks : [],
        videos: Array.isArray(value.videos) ? value.videos : [],
        accounts: Array.isArray(value.accounts) ? value.accounts : [],
        tutorLinks: Array.isArray(value.tutorLinks) ? value.tutorLinks : [],
        boards: Array.isArray(value.boards) ? value.boards : [],
        plannerByTutor: value.plannerByTutor && typeof value.plannerByTutor === 'object' ? value.plannerByTutor : {},
        notesByOwner: value.notesByOwner && typeof value.notesByOwner === 'object' ? value.notesByOwner : {},
        currentAccountId: typeof value.currentAccountId === 'string' ? value.currentAccountId : null,
        currentBoardId: typeof value.currentBoardId === 'string' ? value.currentBoardId : null,
      };
    } catch (_) { return sampleState(); }
  };
  const state = loadState();
  state.tasks.forEach((task) => { if (task.kind !== 'personal') { task.reviewStatus ||= task.status === 'complete' ? 'correct' : 'unchecked'; task.reviewComment ||= ''; } });
  let authenticatedAccountId = null;
  let accountDataReady = false;
  let accountSyncTimer = null;
  let accountSyncFailed = false;
  let linkedAccountsLoaded = false;
  let activeConferenceId = null;
  let currentView = 'overview';
  let taskFilter = 'all';
  let boardTool = 'pen';
  let boardColor = '#314a2e';
  let boardWidth = 3;
  let boardFont = 'Arial';
  let boardZoom = 1;
  const boardHistories = new Map();
  let boardDrawing = false;
  let lastPoint = null;
  let boardPointerStart = null;
  let boardDragElementId = null;
  let boardDraftId = null;
  let boardSelectedId = null;
  let boardDirty = false;
  let boardTextPosition = null;
  let boardInlineElementId = null;
  let boardResizeState = null;
  let boardPanState = null;
  let boardSpaceDown = false;
  let boardGestureRecorded = false;
  let collaboration = { groups: [], messages: [], files: [] };
  let collaborationLoaded = false;
  let collaborationPollTimer = null;
  let collaborationRefreshing = false;
  let activeConversation = '';
  let localCameraStream = null;
  let localMicStream = null;
  let screenStream = null;
  let liveKitRoom = null;
  let screenShareEnabled = false;
  let screenShareLeaseTimer = null;
  let cameraEnabled = false;
  let micEnabled = false;
  let meetingTimer = null;
  let meetingStartedAt = 0;
  const pageContent = document.getElementById('pageContent');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalCard = document.getElementById('modalCard');
  const sidebar = document.getElementById('sidebar');
  const callDock = document.createElement('aside');
  callDock.className = 'call-dock';
  callDock.setAttribute('aria-label', 'Текущий звонок');
  callDock.hidden = true;
  document.body.append(callDock);
  const fileViewer = document.createElement('aside');
  fileViewer.className = 'file-viewer'; fileViewer.hidden = true; fileViewer.setAttribute('aria-label', 'Просмотр файла'); document.body.append(fileViewer);

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const useIcon = (name, cls = '') => `<svg${cls ? ` class="${cls}"` : ''}><use href="#i-${name}"/></svg>`;
  function openFileViewer(url, name, type = '') {
    if (!url) return;
    const safeUrl = escapeHTML(url); const safeName = escapeHTML(name || 'Файл');
    const previewable = type.startsWith('image/') || type === 'application/pdf' || /\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(name || '');
    fileViewer.hidden = false; fileViewer.classList.remove('is-minimized');
    fileViewer.innerHTML = `<header><button data-action="file-viewer-close" aria-label="Закрыть">×</button><strong>${safeName}</strong><button data-action="file-viewer-minimize" aria-label="Свернуть">—</button></header><div class="file-viewer-body">${previewable ? (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name || '') ? `<img src="${safeUrl}" alt="${safeName}">` : `<iframe src="${safeUrl}" title="${safeName}"></iframe>`) : `<div class="empty-state"><strong>Предпросмотр этого формата недоступен</strong><a class="button button-primary" href="${safeUrl}" download>Скачать файл</a></div>`}</div>`;
  }
  function applyTheme(theme, save = true) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = dark ? '#1F231F' : '#F3EFE7';
    const button = document.getElementById('themeToggle');
    const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
    if (button) {
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML = useIcon(dark ? 'sun' : 'moon');
    }
    if (save) { try { localStorage.setItem('tutdesk-theme', dark ? 'dark' : 'light'); } catch (_) { /* storage can be disabled */ } }
  }
  const persist = () => {
    let serialized;
    try { serialized = JSON.stringify(authenticatedAccountId ? { ...state, videos: [] } : state); } catch (_) { return; }
    if (authenticatedAccountId) {
      if (!accountDataReady) return;
      window.clearTimeout(accountSyncTimer);
      accountSyncTimer = window.setTimeout(async () => {
        try {
          const response = await fetch('/api/account-data', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: JSON.parse(serialized) }),
          });
          if (!response.ok) throw new Error('Account data save failed');
          accountSyncFailed = false;
        } catch {
          if (!accountSyncFailed) toast('Не удалось сохранить данные кабинета', 'Проверьте соединение и войдите в аккаунт снова.');
          accountSyncFailed = true;
        }
      }, 400);
      return;
    }
    try { localStorage.setItem(STORAGE_KEY, serialized); } catch (_) { /* storage can be disabled */ }
  };
  const getStudent = (id) => state.students.find((student) => student.id === id);
  const getAccount = (id) => state.accounts.find((account) => account.id === id);
  const currentAccount = () => getAccount(state.currentAccountId) || null;
  const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timeZoneForAccount = (accountId) => accountId === authenticatedAccountId
    ? (currentAccount()?.timeZone || browserTimeZone())
    : (state.accounts.find((account) => account.id === accountId)?.timeZone || browserTimeZone());
  const zoneLabel = (zone) => `${zone} · ${new Intl.DateTimeFormat('ru-RU', { timeZone: zone, timeZoneName: 'short' }).format(new Date())}`;
  function localDateTimeInZone(date, time, zone) {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    let instant = desired;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
      const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
      const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
      instant += desired - represented;
    }
    return new Date(instant);
  }
  function refreshLinkedAccounts() {
    linkedAccountsLoaded = false;
    if (!authenticatedAccountId) return;
    fetch('/api/tutor-students', { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('connections_unavailable');
      const { accounts = [] } = await response.json();
      const me = currentAccount();
      if (!me) return;
      if (me.role === 'tutor') {
        for (const account of accounts) {
          const studentId = `student-${account.id}`;
          if (!state.students.some((student) => student.id === studentId)) state.students.push({ id: studentId, name: account.name, email: account.email, subject: '', grade: 'Ученик', note: '', lessons: 0, progress: 0, color: state.students.length % initialsByColor.length, timeZone: account.timeZone || browserTimeZone() });
          if (!state.tutorLinks.some((link) => link.tutorId === me.id && link.studentId === studentId)) state.tutorLinks.push({ tutorId: me.id, studentId });
          await syncSharedAccountData(account, studentId);
        }
      } else {
        for (const account of accounts) {
          const model = accountModel(account);
          if (!state.accounts.some((item) => item.id === account.id)) state.accounts.push(model);
          const linkId = me.studentId;
          if (!state.tutorLinks.some((link) => link.tutorId === account.id && link.studentId === linkId)) state.tutorLinks.push({ tutorId: account.id, studentId: linkId });
          await syncSharedAccountData(account, linkId);
        }
      }
      linkedAccountsLoaded = true;
      const activeEditor = document.activeElement?.closest('form,[contenteditable="true"]');
      if (!activeEditor) render();
    }).catch(() => { linkedAccountsLoaded = true; });
  }
  async function syncSharedAccountData(account, studentId) {
    const response = await fetch(`/api/account-data?account=${encodeURIComponent(account.id)}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return;
    const { data: savedData } = await response.json();
    const data = savedData && typeof savedData === 'object' ? savedData : {};
    if (account.role === 'tutor' && Array.isArray(data.boards)) {
      for (const board of data.boards.filter((item) => item.lessonIds?.some((id) => data.lessons?.some((lesson) => lesson.id === id && lesson.studentId === studentId)))) {
        const index = state.boards.findIndex((item) => item.id === board.id);
        if (index < 0) state.boards.push(board); else state.boards[index] = board;
      }
    }
    if (account.role === 'student') {
      let student = data.students?.find((item) => item.email?.toLowerCase() === account.email?.toLowerCase())
        || { id: studentId, name: account.name, email: account.email, subject: '', grade: '', note: '', lessons: 0, progress: 0, color: 0, timeZone: account.time_zone || browserTimeZone() };
      const response = await fetch(`/api/profile?account=${encodeURIComponent(account.id)}`, { credentials: 'same-origin', cache: 'no-store' });
      if (response.ok) student = { ...student, ...(await response.json()).profile };
      const existing = state.students.find((item) => item.id === studentId);
      const profile = { ...student, id: studentId };
      if (existing) Object.assign(existing, profile); else state.students.push(profile);
    }
    const otherAccount = getAccount(account.id);
    if (otherAccount) Object.assign(otherAccount, accountModel(account));
    const tutorId = account.role === 'tutor' ? account.id : currentAccount()?.id;
    const tutorData = account.role === 'tutor' ? data : null;
    if (tutorData && Array.isArray(tutorData.lessons) && tutorId) {
      for (const lesson of tutorData.lessons.filter((item) => item.tutorId === tutorId && item.studentId === studentId)) {
        if (account.role === 'student' && lesson.studentAccountId !== currentAccount()?.id) continue;
        const hydrated = { ...lesson, tutorTimeZone: lesson.tutorTimeZone || timeZoneForAccount(tutorId), studentTimeZone: lesson.studentTimeZone || currentAccount()?.timeZone || browserTimeZone() };
        const index = state.lessons.findIndex((item) => item.id === lesson.id);
        if (index < 0) state.lessons.push(hydrated); else state.lessons[index] = { ...state.lessons[index], ...hydrated };
      }
    }
    const ownedLessons = Array.isArray(data.lessons) ? data.lessons.filter((lesson) => lesson.tutorId === account.id && lesson.studentId === studentId).map((lesson) => ({ ...lesson, studentAccountId: currentAccount()?.role === 'student' ? currentAccount().id : account.id, tutorTimeZone: lesson.tutorTimeZone || timeZoneForAccount(account.id), studentTimeZone: lesson.studentTimeZone || timeZoneForAccount(account.role === 'student' ? account.id : studentId.slice('student-'.length)) })) : [];
    for (const lesson of ownedLessons) {
      if (account.role === 'student' && lesson.studentAccountId !== currentAccount()?.id) continue;
      const index = state.lessons.findIndex((item) => item.id === lesson.id);
      if (index < 0) state.lessons.push(lesson); else state.lessons[index] = { ...state.lessons[index], ...lesson };
    }
    if (account.role === 'tutor' && Array.isArray(data.tasks)) {
      for (const task of data.tasks.filter((item) => item.studentId === studentId && item.kind !== 'personal')) {
        const index = state.tasks.findIndex((item) => item.id === task.id);
        if (index < 0) state.tasks.push(task); else state.tasks[index] = { ...state.tasks[index], ...task };
      }
    }
  }
  function accountModel(account) {
    return {
      id: account.id,
      role: account.role,
      name: account.name || 'Пользователь',
      email: account.email || '',
      studentId: account.role === 'student' ? (account.studentId || `student-${account.id}`) : null,
      timeZone: account.time_zone || account.timeZone || browserTimeZone(),
      ...(account.role === 'tutor' ? { plan: account.plan || 'light' } : {}),
    };
  }
  function emptyAccountData(account) {
    const model = accountModel(account);
    return {
      ...sampleState(),
      plan: model.plan || 'light',
      students: model.role === 'student' ? [{
        id: model.studentId, name: model.name, email: model.email, subject: '', grade: '', note: '',
        lessons: 0, progress: 0, color: 0,
      }] : [],
      lessons: [],
      tasks: [],
      videos: [],
      accounts: [model],
      currentAccountId: model.id,
      tutorLinks: [],
      boards: [],
      currentBoardId: null,
      plannerByTutor: model.role === 'tutor' ? { [model.id]: { title: 'План на неделю', blocks: [] } } : {},
    };
  }
  function useAccountData(savedData, account) {
    const defaults = emptyAccountData(account);
    const restored = savedData && typeof savedData === 'object' && !Array.isArray(savedData)
      ? { ...defaults, ...savedData }
      : defaults;
    for (const key of ['students', 'lessons', 'tasks', 'videos', 'tutorLinks', 'boards']) {
      restored[key] = Array.isArray(restored[key])
        ? restored[key].filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        : [];
    }
    restored.tasks.forEach((task) => { if (task.kind !== 'personal') { task.reviewStatus ||= task.status === 'complete' ? 'correct' : 'unchecked'; task.reviewComment ||= ''; } });
    restored.boards = restored.boards.map((board) => ({
      ...board,
      lessonIds: Array.isArray(board.lessonIds) ? board.lessonIds.filter((id) => typeof id === 'string') : [],
      elements: Array.isArray(board.elements) ? board.elements.filter((element) => element && typeof element === 'object' && !Array.isArray(element)) : [],
    }));
    if (!restored.plannerByTutor || typeof restored.plannerByTutor !== 'object' || Array.isArray(restored.plannerByTutor)) {
      restored.plannerByTutor = {};
    } else {
      restored.plannerByTutor = Object.fromEntries(Object.entries(restored.plannerByTutor).map(([id, planner]) => [
        id,
        planner && typeof planner === 'object' && !Array.isArray(planner)
          ? { ...planner, blocks: Array.isArray(planner.blocks) ? planner.blocks.filter((block) => block && typeof block === 'object' && !Array.isArray(block)) : [] }
          : { title: 'План на неделю', blocks: [] },
      ]));
    }
    const model = accountModel(account);
    const savedAccounts = Array.isArray(restored.accounts)
      ? restored.accounts.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      : [];
    const savedOwnAccount = savedAccounts.find((item) => item.id === model.id);
    restored.accounts = [{ ...model, ...(savedOwnAccount ? { plan: savedOwnAccount.plan || model.plan } : {}) }];
    restored.currentAccountId = model.id;
      if (model.role === 'student' && !restored.students.some((student) => student.id === model.studentId)) {
      restored.students.push({ id: model.studentId, name: model.name, email: model.email, subject: '', grade: '', note: '', lessons: 0, progress: 0, color: 0 });
    }
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, restored);
  }
  async function refreshOwnProfile() {
    const account = currentAccount();
    if (account?.role !== 'student') return;
    try {
      const response = await fetch('/api/profile', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return;
      const { profile } = await response.json();
      const student = getStudent(account.studentId);
      if (student && profile) Object.assign(student, profile);
      if (profile?.name) account.name = profile.name;
    } catch { /* The saved account data remains available offline. */ }
  }
  async function refreshVideos(renderAfter = false) {
    if (!authenticatedAccountId) return;
    try {
      const response = await fetch('/api/videos', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('video_library_unavailable');
      const result = await response.json();
      state.videos = Array.isArray(result.videos) ? result.videos : [];
      if (renderAfter) render();
    } catch {
      toast('Не удалось загрузить видеоуроки', 'Повторите попытку позже.');
    }
  }
  async function activateAccount(account) {
    if (!account?.id) throw new Error('account_missing');
    authenticatedAccountId = account.id;
    collaborationLoaded = false; collaboration = { groups: [], messages: [] }; activeConversation = '';
    accountDataReady = false;
    let savedData = null;
    try {
      const response = await fetch('/api/account-data', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('account_data_load_failed');
      savedData = (await response.json()).data;
      accountDataReady = true;
    } catch {
      toast('Не удалось загрузить данные кабинета', 'Изменения не будут сохранены, пока связь с базой данных не восстановится.');
    }
    useAccountData(savedData, account);
    await refreshOwnProfile();
    await refreshVideos();
    await loadCollaboration();
    refreshLinkedAccounts();
    currentView = activeConferenceId ? 'room' : 'overview';
    closeModal();
    render();
    if (!account.role) openAccountRoleForm(account);
    else if (accountDataReady && !savedData) persist();
  }
  function openAccountRoleForm(account) {
    showModal('Настроить личный кабинет', 'Укажите имя, роль и класс, если вы ученик.', `<form class="form-grid" data-form="auth-role"><div class="form-field"><label for="authAccountName">Имя и фамилия</label><input class="form-control" id="authAccountName" name="name" value="${escapeHTML(account.name || '')}" required maxlength="80" /></div><div class="form-field"><label for="authAccountRole">Я в Tutdesk</label><select class="form-control" id="authAccountRole" name="role" required><option value="tutor">Репетитор</option><option value="student">Ученик</option></select></div><div class="form-field" id="authGradeWrap" hidden><label for="authGrade">Класс</label><select class="form-control" id="authGrade" name="grade"><option value="">Выберите класс</option>${Array.from({ length: 11 }, (_, index) => `<option value="${index + 1} класс">${index + 1} класс</option>`).join('')}<option value="Студент">Студент</option><option value="Другое">Другое</option></select></div><div class="form-actions"><button class="button button-primary" type="submit">Продолжить</button></div></form>`);
    const role = document.getElementById('authAccountRole'); const gradeWrap = document.getElementById('authGradeWrap'); const grade = document.getElementById('authGrade');
    role?.addEventListener('change', () => { if (gradeWrap) gradeWrap.hidden = role.value !== 'student'; if (grade) grade.required = role.value === 'student'; });
  }
  async function completeAccountSetup(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch('/api/auth/role', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: data.role, name: String(data.name || '').trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.account) throw new Error(result.error || 'profile_setup_failed');
      useAccountData(null, result.account);
      if (result.account.role === 'student' && data.grade) {
        const profile = getStudent(result.account.studentId);
        if (profile) profile.grade = data.grade;
        await fetch('/api/profile', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade: data.grade }) });
      }
      closeModal();
      currentView = activeConferenceId ? 'room' : 'overview';
      render();
      persist();
      toast('Личный кабинет готов', result.account.role === 'student' ? 'Роль: ученик' : 'Роль: репетитор');
    } catch {
      toast('Не удалось сохранить профиль', 'Попробуйте ещё раз.');
    }
  }
  async function initializeAuth() {
    const query = new URLSearchParams(window.location.search);
    const authError = query.get('auth_error');
    const passwordResetToken = query.get('reset');
    const requestedConferenceId = query.get('conference') || '';
    activeConferenceId = /^[A-Za-z0-9_-]{1,64}$/.test(requestedConferenceId) ? requestedConferenceId : null;
    const verificationToken = query.get('verify');
    const emailChangeToken = query.get('email_change');
    if (emailChangeToken) {
      try {
        const response = await fetch('/api/profile/email/confirm', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: emailChangeToken }) });
        if (!response.ok) toast('Не удалось изменить email', 'Войдите в нужный аккаунт и проверьте, что ссылка не устарела.');
        else { toast('Email изменён', 'Новый адрес подтверждён.'); window.location.reload(); }
      } catch { toast('Не удалось подтвердить email', 'Попробуйте открыть ссылку ещё раз.'); }
      query.delete('email_change');
      history.replaceState(null, document.title, `${location.pathname}${query.size ? `?${query}` : ''}${location.hash}`);
    }
    if (verificationToken) {
      try {
        const verificationResponse = await fetch('/api/auth/verify', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: verificationToken }),
        });
        const verification = await verificationResponse.json().catch(() => ({}));
        if (!verificationResponse.ok) toast(verification.message || 'Не удалось подтвердить email', 'Запросите новое письмо и откройте актуальную ссылку.');
        else toast('Email подтверждён', 'Теперь можно войти в личный кабинет Tutdesk.');
      } catch { toast('Не удалось подтвердить email', 'Проверьте подключение и попробуйте открыть ссылку ещё раз.'); }
      query.delete('verify');
      history.replaceState(null, document.title, `${location.pathname}${query.size ? `?${query}` : ''}${location.hash}`);
    }
    if (passwordResetToken) {
      query.delete('reset');
      history.replaceState(null, document.title, `${location.pathname}${query.size ? `?${query}` : ''}${location.hash}`);
    }
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (response.ok) {
        const result = await response.json();
        if (result.account) {
          authenticatedAccountId = result.account.id;
          accountDataReady = false;
          let savedData = null;
          try {
            const dataResponse = await fetch('/api/account-data', { credentials: 'same-origin', cache: 'no-store' });
            if (!dataResponse.ok) throw new Error('account_data_load_failed');
            savedData = (await dataResponse.json()).data;
            accountDataReady = true;
          } catch {
            toast('Не удалось загрузить данные кабинета', 'Изменения не будут сохранены, пока связь с базой данных не восстановится.');
          }
          useAccountData(savedData, result.account);
          await refreshOwnProfile();
          await refreshVideos();
          const pendingGrade = sessionStorage.getItem('tutdesk-pending-grade');
          if (result.account.role === 'student' && pendingGrade) {
            try {
              await fetch('/api/profile', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: result.account.name, grade: pendingGrade }) });
              const student = getStudent(result.account.studentId); if (student) student.grade = pendingGrade;
              sessionStorage.removeItem('tutdesk-pending-grade');
            } catch { /* retain pending grade for the next sign in */ }
          }
          refreshLinkedAccounts();
          if (activeConferenceId) currentView = 'room';
          render();
          if (!result.account.role) openAccountRoleForm(result.account);
          else if (accountDataReady && !savedData) persist();
        } else {
          if (activeConferenceId) currentView = 'room';
          render();
        }
      } else {
        if (activeConferenceId) currentView = 'room';
        render();
      }
    } catch {
      if (activeConferenceId) currentView = 'room';
      render();
    }
    if (authError) {
      const errors = {
        provider_not_configured: 'Сервис авторизации ещё не настроен. Попробуйте позже.',
        oauth_state: 'Не удалось подтвердить запрос входа. Начните вход ещё раз.',
        oauth_failed: 'Провайдер не завершил вход. Попробуйте ещё раз.',
        oauth_cancelled: 'Вы отменили вход через провайдера.',
      };
      toast('Не удалось войти', errors[authError] || 'Проверьте подключение и попробуйте снова.');
    }
    if (query.has('auth') || authError) {
      query.delete('auth');
      query.delete('auth_error');
      const search = query.toString();
      history.replaceState(null, document.title, `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
    }
    if (passwordResetToken) openForm('password-reset', passwordResetToken);
  }
  const currentPlan = () => currentAccount()?.plan || state.plan || 'light';
  const isStudentAccount = () => currentAccount()?.role === 'student';
  const currentTutorId = () => isStudentAccount() ? null : currentAccount()?.id;
  const linkedStudentIds = (tutorId = currentTutorId()) => state.tutorLinks.filter((link) => link.tutorId === tutorId).map((link) => link.studentId);
  const tutorLinkForStudent = (studentId, tutorId = currentTutorId()) => state.tutorLinks.find((link) => link.tutorId === tutorId && link.studentId === studentId);
  const currentTutorStudents = () => linkedStudentIds().map(getStudent).filter(Boolean);
  const tasksForCurrentTutor = () => state.tasks.filter((task) => task.tutorId === currentTutorId());
  const tasksForCurrentStudent = () => state.tasks.filter((task) => task.kind !== 'personal' && task.studentId === currentAccount()?.studentId);
  const currentPlanner = () => { const tutorId = currentTutorId() || 'student-planner'; state.plannerByTutor ||= {}; return state.plannerByTutor[tutorId] ||= { title: 'План на неделю', blocks: [] }; };
  const currentBoard = () => state.boards.find((board) => board.id === state.currentBoardId) || state.boards[0];
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
  const studentName = (id) => getStudent(id)?.name || 'Ученик';
  const studentColor = (student) => initialsByColor[(student?.color ?? 0) % initialsByColor.length];
  const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const formatDate = (iso, options = { day: 'numeric', month: 'long' }) => {
    const date = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat('ru-RU', options).format(date);
  };
  const dateLabel = (iso) => {
    const today = addDaysISO(0);
    const tomorrow = addDaysISO(1);
    if (iso === today) return 'Сегодня';
    if (iso === tomorrow) return 'Завтра';
    const formatted = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`));
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };
  const dueLabel = (iso) => {
    if (!iso) return 'Без срока';
    const days = Math.round((new Date(`${iso}T12:00:00`) - new Date(`${addDaysISO(0)}T12:00:00`)) / 86400000);
    if (days < 0) return 'Просрочено';
    if (days === 0) return 'Сегодня';
    if (days === 1) return 'Завтра';
    return formatDate(iso, { day: 'numeric', month: 'short' });
  };
  const taskStatusLabel = (status) => ({ todo: 'Назначено', submitted: 'Сдано', complete: 'Проверено' }[status] || 'Назначено');
  const lessonInstant = (lesson) => lesson.startsAt ? new Date(lesson.startsAt) : new Date(`${lesson.date}T${lesson.time || '00:00'}:00`);
  const lessonViewerZone = (lesson, account = currentAccount()) => account?.id === lesson.tutorId
    ? (lesson.tutorTimeZone || account?.timeZone || browserTimeZone())
    : account?.id === lesson.studentAccountId
      ? (lesson.studentTimeZone || account?.timeZone || browserTimeZone())
      : (account?.timeZone || browserTimeZone());
  const lessonTimeForViewer = (lesson, account = currentAccount()) => {
    const zone = lessonViewerZone(lesson, account);
    return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(lessonInstant(lesson));
  };
  const lessonDateForViewer = (lesson, account = currentAccount()) => {
    const zone = lessonViewerZone(lesson, account);
    return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(lessonInstant(lesson));
  };
  const nextLesson = () => {
    const studentIds = isStudentAccount() ? [currentAccount()?.studentId] : linkedStudentIds();
    return state.lessons.filter((lesson) => studentIds.includes(lesson.studentId) && lessonInstant(lesson).getTime() >= Date.now()).sort((a, b) => lessonInstant(a) - lessonInstant(b))[0];
  };
  const currentTutorLessons = () => state.lessons.filter((lesson) => linkedStudentIds().includes(lesson.studentId) && lesson.tutorId === currentTutorId());
  const toast = (message, detail = '') => {
    const region = document.getElementById('toastRegion');
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `${escapeHTML(message)}${detail ? `<small>${escapeHTML(detail)}</small>` : ''}`;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 3500);
  };

  const pageHeading = (kicker, title, description, actions = '') => `<div class="page-heading"><div><div class="heading-kicker">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
  const studentAvatar = (student, extra = '') => `<span class="avatar ${studentColor(student)} ${extra}">${escapeHTML(initials(student?.name || '?'))}</span>`;
  const lessonCard = (lesson) => {
    const student = getStudent(lesson.studentId);
    const date = lessonDateForViewer(lesson);
    const day = new Date(`${date}T12:00:00`).getDate();
    const month = new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(`${date}T12:00:00`)).replace('.', '');
    return `<article class="lesson-feature"><div class="lesson-date-chip"><strong>${pad(day)}</strong><span>${month}</span></div><div><div class="lesson-title">${escapeHTML(lesson.title)}</div><div class="lesson-meta"><span>${useIcon('clock')}${escapeHTML(lessonTimeForViewer(lesson))} · ${lesson.duration} мин</span><span>${useIcon('users')}${escapeHTML(student?.subject || 'Занятие')}</span></div><div class="lesson-participants">${studentAvatar(student, 'mini-avatar')}<span class="mini-avatar mini-avatar--peach">А</span><span class="participant-caption">Вы и ${escapeHTML(student?.name || 'ученик')}</span></div></div><button class="button button-primary lesson-start" data-action="start-lesson" data-id="${escapeHTML(lesson.id)}">${useIcon('video')} Войти</button></article>`;
  };
  const tutorPromoSection = () => `<section class="tutor-promo-section"><div class="promo-section-head"><div><span class="heading-kicker">РЕКОМЕНДАЦИИ</span><h2>Лучшие репетиторы</h2></div><small>Демонстрационные места для будущей рекламы</small></div><div class="tutor-promo-grid"><article class="tutor-promo-card"><span class="promo-avatar">Фото</span><div><span class="promo-badge">Рекламное место</span><h3>Профиль репетитора</h3><p>Предмет, опыт и короткое описание появятся после подключения каталога.</p></div><button class="button button-light button-small" disabled>Скоро</button></article><article class="tutor-promo-card"><span class="promo-avatar">Фото</span><div><span class="promo-badge">Рекламное место</span><h3>Профиль репетитора</h3><p>Здесь будет второй рекомендованный специалист и ссылка на его анкету.</p></div><button class="button button-light button-small" disabled>Скоро</button></article></div></section>`;

  function renderLightOverview() {
    const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const firstName = currentAccount()?.name.split(' ')[0] || 'Репетитор';
    pageContent.innerHTML = `<div class="page-heading"><div><div class="heading-kicker">${escapeHTML(today)}</div><h1>Доброе утро, ${escapeHTML(firstName)} <span class="heading-wave">✳</span></h1><p>Комната и доска готовы к следующему занятию.</p></div></div><section class="welcome-banner"><div class="welcome-copy"><div class="eyebrow-green">БАЗОВЫЙ ТАРИФ</div><h2>Ваше место для живых уроков.</h2><p>Встречайтесь с учеником по ссылке, планируйте занятия и разбирайте задачи на интерактивной доске.</p></div><div class="welcome-action"><button class="button button-light" data-view="board">${useIcon('board')} Открыть доску</button><button class="button button-lime" data-action="start-lesson">${useIcon('video')} Начать созвон</button></div></section><section class="stats-grid"><article class="stat-card"><div><div class="stat-label">Видеокомната</div><div class="stat-value">Готова</div><div class="stat-hint">Созвон, камера и микрофон</div></div><span class="stat-icon">${useIcon('video')}</span></article><article class="stat-card"><div><div class="stat-label">Демонстрация экрана</div><div class="stat-value">Доступна</div><div class="stat-hint">Показывайте материалы ученику</div></div><span class="stat-icon stat-icon--blue">${useIcon('monitor')}</span></article><article class="stat-card"><div><div class="stat-label">Интерактивная доска</div><div class="stat-value">Сохранена</div><div class="stat-hint">Можно продолжить в любое время</div></div><span class="stat-icon stat-icon--orange">${useIcon('board')}</span></article></section><div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h3>Запланируйте занятие</h3><p>Создайте урок в расписании и откройте комнату в нужное время.</p></div>${useIcon('calendar')}</div><div class="light-feature-card"><div class="light-feature-icon">${useIcon('calendar')}</div><div><strong>Расписание занятий</strong><span>Создание, перенос и быстрый вход в урок</span></div><button class="button button-primary button-small" data-view="lessons">Открыть</button></div></section><section class="panel"><div class="panel-heading"><div><h3>Работайте на доске</h3><p>Материалы доски сохраняются в личном кабинете.</p></div>${useIcon('board')}</div><div class="light-feature-card light-feature-card--board"><div class="light-feature-icon">${useIcon('edit')}</div><div><strong>Общая доска занятия</strong><span>Рисуйте и возвращайтесь к материалам</span></div><button class="button button-light button-small" data-view="board">Открыть</button></div></section></div><section class="students-strip plan-teaser"><div class="students-strip-head"><h3>Нужно больше инструментов?</h3><button class="subtle-link" data-view="subscription">Сравнить тарифы →</button></div><div class="plan-teaser-copy">В «Продвинутом» доступны карточки учеников, домашние задания, группы и расширенные рабочие инструменты.</div></section>`;
    pageContent.querySelector('.stats-grid')?.remove();
    pageContent.querySelector('.welcome-banner')?.insertAdjacentHTML('afterend', tutorPromoSection());
  }

  function renderFeatureGate(title, description, items) {
    pageContent.innerHTML = `${pageHeading('ВОЗМОЖНОСТИ ПРОДВИНУТОГО ТАРИФА', title, description)}<section class="feature-gate"><span class="feature-gate-icon">${useIcon('spark')}</span><div><h2>Этот раздел входит в «Продвинутый».</h2><p>Откройте расширенные инструменты для работы с учениками. Раздел доступен после выбора тарифа «Продвинутый».</p></div><div class="feature-gate-list">${items.map((item) => `<span>${useIcon('check')}${escapeHTML(item)}</span>`).join('')}</div><div class="feature-gate-actions"><button class="button button-primary" data-action="choose-plan" data-plan="extreme">Выбрать «Продвинутый»</button><button class="button button-light" data-view="subscription">Сравнить тарифы</button></div></section>`;
  }

  function renderOverview() {
    if (isStudentAccount()) { renderStudentOverview(); return; }
    if (currentPlan() !== 'extreme') { renderLightOverview(); return; }
    const upcoming = nextLesson();
    const tutorTasks = tasksForCurrentTutor();
    const activeTasks = tutorTasks.filter((task) => task.status !== 'complete').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 2);
    const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const firstName = currentAccount()?.name.split(' ')[0] || 'Репетитор';
    const lessonCount = currentTutorLessons().filter((lesson) => lessonInstant(lesson).getTime() >= Date.now()).length;
    const taskPreview = currentPlan() === 'extreme'
      ? `<section class="panel"><div class="panel-heading"><div><h3>Задачи на контроле</h3><p>Ваши дела и домашние задания</p></div><button class="subtle-link" data-view="tasks">Все задачи →</button></div><div class="deadline-list">${activeTasks.length ? activeTasks.map((task) => `<div class="deadline-item"><span class="deadline-mark ${task.status === 'submitted' ? 'deadline-mark--green' : ''}">${useIcon(task.status === 'submitted' ? 'check' : 'clock')}</span><div class="deadline-copy"><strong>${escapeHTML(task.title)}</strong><span>${task.kind === 'personal' ? 'Личная задача' : `${escapeHTML(studentName(task.studentId))} · ${escapeHTML(taskStatusLabel(task.status))}`}</span></div><span class="deadline-time ${task.status === 'submitted' ? 'deadline-time--green' : ''}">${escapeHTML(dueLabel(task.due))}</span></div>`).join('') : `<div class="empty-state"><strong>Пока всё спокойно</strong>Открытых задач нет.</div>`}</div></section>`
      : `<section class="panel"><div class="panel-heading"><div><h3>Домашние задания</h3><p>Планируйте задания и следите за ответами</p></div>${useIcon('check')}</div><div class="locked-promo"><div class="locked-promo-icon">${useIcon('spark')}</div><div><strong>Больше порядка между уроками</strong><p>Задания, проверка ответов и копирование для других учеников доступны в «Продвинутом».</p></div><button class="button button-light button-small" data-view="subscription">Узнать о тарифе</button></div></section>`;
    pageContent.innerHTML = `
      <div class="page-heading"><div><div class="heading-kicker">${escapeHTML(today)}</div><h1>Доброе утро, ${escapeHTML(firstName)} <span class="heading-wave">✳</span></h1><p>Ваше пространство для уроков и спокойной работы с учениками.</p></div><div class="heading-actions"><button class="button button-light" data-action="open-modal" data-modal="lesson">${useIcon('plus')} Запланировать</button></div></div>
      <section class="welcome-banner"><div class="welcome-copy"><div class="eyebrow-green">ВАШЕ ПРОСТРАНСТВО ДЛЯ УРОКОВ</div><h2>Хороший урок начинается<br class="desktop-break"/> с удобного места.</h2><p>Встречайтесь, объясняйте сложное на доске и возвращайтесь к материалам, когда удобно.</p></div><div class="welcome-action"><button class="button button-light" data-view="board">${useIcon('board')} Открыть доску</button><button class="button button-lime" data-action="start-lesson">${useIcon('video')} Начать созвон</button></div></section>
      <section class="tutor-promo-section"><div class="promo-section-head"><div><span class="heading-kicker">РЕКОМЕНДАЦИИ</span><h2>Лучшие репетиторы</h2></div><small>Демонстрационные места для будущей рекламы</small></div><div class="tutor-promo-grid"><article class="tutor-promo-card"><span class="promo-avatar">Фото</span><div><span class="promo-badge">Рекламное место</span><h3>Профиль репетитора</h3><p>Предмет, опыт и короткое описание появятся после подключения каталога.</p></div><button class="button button-light button-small" disabled>Скоро</button></article><article class="tutor-promo-card"><span class="promo-avatar">Фото</span><div><span class="promo-badge">Рекламное место</span><h3>Профиль репетитора</h3><p>Здесь будет второй рекомендованный специалист и ссылка на его анкету.</p></div><button class="button button-light button-small" disabled>Скоро</button></article></div></section>
      <div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h3>Следующее занятие</h3><p>${upcoming ? `${escapeHTML(dateLabel(lessonDateForViewer(upcoming)))} · ${escapeHTML(lessonTimeForViewer(upcoming))} (${escapeHTML(currentAccount()?.timeZone || browserTimeZone())})` : 'Добавьте занятие в расписание'}</p></div><button class="subtle-link" data-view="lessons">Расписание →</button></div>${upcoming ? lessonCard(upcoming) : `<div class="empty-state"><strong>В расписании пока пусто</strong>Запланируйте первое занятие.</div>`}</section>${taskPreview}</div>
      <section class="students-strip"><div class="students-strip-head"><h3>Ваши ученики</h3><button class="subtle-link" data-view="students">Все ученики →</button></div><div class="student-mini-grid">${currentTutorStudents().slice(0, 3).map((student) => `<article class="student-mini">${studentAvatar(student)}<div class="student-mini-copy"><strong>${escapeHTML(student.name)}</strong><span>${escapeHTML(student.subject)} · ${escapeHTML(student.grade)}</span></div></article>`).join('') || `<div class="empty-state"><strong>Пока нет учеников</strong>Добавьте первого ученика, чтобы запланировать занятие.</div>`}</div></section>`;
  }

  function renderStudentOverview() {
    const account = currentAccount(); const profile = getStudent(account.studentId); const tasks = tasksForCurrentStudent();
    const tutors = state.tutorLinks.filter((link) => link.studentId === account.studentId).map((link) => getAccount(link.tutorId)).filter(Boolean);
    const next = nextLesson();
    const lessonPanel = next
      ? `<section class="panel student-next-lesson"><div class="panel-heading"><div><h3>Следующее занятие</h3><p>${escapeHTML(dateLabel(lessonDateForViewer(next)))} · ${escapeHTML(lessonTimeForViewer(next))} (${escapeHTML(account.timeZone || browserTimeZone())})</p></div>${useIcon('video')}</div><div class="light-feature-card"><div class="light-feature-icon">${useIcon('calendar')}</div><div><strong>${escapeHTML(next.title)}</strong><span>${escapeHTML(getAccount(next.tutorId)?.name || 'Репетитор')} · ${next.duration} мин</span></div><button class="button button-primary button-small" data-action="start-lesson" data-id="${escapeHTML(next.id)}">Подключиться</button></div></section>`
      : `<section class="panel student-next-lesson"><div class="panel-heading"><div><h3>Следующее занятие</h3><p>Когда репетитор добавит урок, здесь появится кнопка входа.</p></div>${useIcon('video')}</div><div class="empty-state"><strong>Предстоящих занятий нет</strong>Попросите репетитора запланировать урок в вашем расписании.</div></section>`;
    pageContent.innerHTML = `${pageHeading('КАБИНЕТ УЧЕНИКА', `Здравствуйте, ${escapeHTML(account.name.split(' ')[0])}.`, 'Ваши занятия, доски и домашняя работа собраны здесь.')}<section class="welcome-banner"><div class="welcome-copy"><div class="eyebrow-green">МОЙ УЧЕБНЫЙ ПРОГРЕСС</div><h2>${escapeHTML(profile?.subject || 'Учёба')} — шаг за шагом.</h2><p>Открывайте сохранённые доски и следите за заданиями от разных репетиторов.</p></div><div class="welcome-action"><button class="button button-lime" data-view="tasks">Мои задания ${useIcon('arrow')}</button></div></section><section class="stats-grid"><article class="stat-card"><div><div class="stat-label">Мои репетиторы</div><div class="stat-value">${tutors.length}</div><div class="stat-hint">Каждый ведёт занятия отдельно</div></div><span class="stat-icon">${useIcon('users')}</span></article><article class="stat-card"><div><div class="stat-label">Нужно сдать</div><div class="stat-value">${tasks.filter((task) => task.status !== 'complete').length}</div><div class="stat-hint">Домашние задания</div></div><span class="stat-icon stat-icon--orange">${useIcon('check')}</span></article><article class="stat-card"><div><div class="stat-label">Следующий урок</div><div class="stat-value">${next ? escapeHTML(lessonTimeForViewer(next, account)) : '—'}</div><div class="stat-hint">${next ? escapeHTML(dateLabel(lessonDateForViewer(next, account))) : 'Расписание пока пусто'}</div></div><span class="stat-icon stat-icon--blue">${useIcon('calendar')}</span></article></section>${lessonPanel}<div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h3>Мои репетиторы</h3><p>Один ученик может заниматься у нескольких преподавателей</p></div></div><div class="deadline-list">${tutors.map((tutor) => `<div class="deadline-item"><span class="avatar avatar--mint">${escapeHTML(initials(tutor.name))}</span><div class="deadline-copy"><strong>${escapeHTML(tutor.name)}</strong><span>${escapeHTML(tutor.email)}</span></div><span class="status-pill">Репетитор</span></div>`).join('') || '<div class="empty-state"><strong>Пока нет связанных репетиторов</strong>Попросите преподавателя добавить ваш адрес электронной почты.</div>'}</div></section><section class="panel"><div class="panel-heading"><div><h3>Последние задания</h3><p>От всех ваших репетиторов</p></div><button class="subtle-link" data-view="tasks">Все задания →</button></div><div class="deadline-list">${tasks.slice(0, 3).map((task) => `<div class="deadline-item"><span class="deadline-mark">${useIcon('check')}</span><div class="deadline-copy"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(getAccount(task.tutorId)?.name || 'Репетитор')} · ${escapeHTML(taskStatusLabel(task.status))}</span></div><span class="deadline-time">${escapeHTML(dueLabel(task.due))}</span></div>`).join('') || '<div class="empty-state"><strong>Заданий пока нет</strong></div>'}</div></section></div><section class="students-strip"><div class="students-strip-head"><h3>Доски занятий</h3><button class="subtle-link" data-view="board">Открыть доски →</button></div><div class="plan-teaser-copy">Сохранённые доски прикреплены к занятиям. Если у нескольких занятий одна доска, вы продолжите с того же места.</div></section>`;
    pageContent.querySelector('.stats-grid')?.remove();
    pageContent.querySelector('.welcome-banner')?.insertAdjacentHTML('afterend', tutorPromoSection());
  }

  function renderStudents() {
    if (isStudentAccount()) { renderStudentOverview(); return; }
    if (isStudentAccount()) { renderStudentOverview(); return; }
    if (currentPlan() !== 'extreme') { renderFeatureGate('Карточки ваших учеников.', 'Соберите заметки, предметы и прогресс каждого ученика в одном месте.', ['Профили учеников', 'Заметки к занятиям', 'Предметы и уровни', 'История уроков']); return; }
    const actions = `<button class="button button-primary" data-action="open-modal" data-modal="student">${useIcon('plus')} Добавить ученика</button>`;
    const students = currentTutorStudents();
    pageContent.innerHTML = `${pageHeading('ВАШИ УЧЕНИКИ', 'Люди, ради которых вы здесь.', 'Добавляйте существующий ученический профиль по email — один ученик может заниматься у нескольких репетиторов.', actions)}<div class="toolbar-row"><label class="search-field">${useIcon('search')}<input id="studentSearch" type="search" placeholder="Найти ученика…" autocomplete="off" /></label><span class="toolbar-spacer"></span><select class="filter-select" id="subjectFilter" aria-label="Фильтр по предмету"><option value="all">Все предметы</option>${[...new Set(students.map((student) => student.subject))].map((subject) => `<option value="${escapeHTML(subject)}">${escapeHTML(subject)}</option>`).join('')}</select></div><div class="cards-grid" id="studentCards">${students.map((student) => studentCard(student)).join('') || `<div class="empty-state"><strong>Создайте первую карточку</strong>Так будет проще планировать занятия и вести заметки.</div>`}</div>`;
  }
  function studentCard(student) {
    const link = tutorLinkForStudent(student.id); const note = link?.note || '';
    const lessonCount = currentTutorLessons().filter((lesson) => lesson.studentId === student.id).length;
    return `<article class="student-card" data-student-card data-name="${escapeHTML(student.name.toLowerCase())}" data-subject="${escapeHTML(student.subject)}"><div class="student-card-top"><div class="student-card-person">${studentAvatar(student)}<div><h3>${escapeHTML(student.name)}</h3><p>${escapeHTML(student.subject)} · ${escapeHTML(student.grade)}</p></div></div><button class="card-more" data-action="student-edit" data-id="${escapeHTML(student.id)}" aria-label="Изменить ученика">${useIcon('edit')}</button></div><p class="student-card-note">${escapeHTML(note || 'Добавьте личную заметку об ученике.')}</p><div class="student-card-stats"><span>Проведено уроков</span><strong>${lessonCount}</strong></div><div class="progress-track"><span style="width:${Math.min(100, Math.max(0, Number(link?.progress) || 0))}%"></span></div></article>`;
  }

  const accountIdForStudent = (studentId) => String(studentId || '').startsWith('student-') ? String(studentId).slice(8) : String(studentId || '');
  async function loadCollaboration({ silent = false } = {}) {
    if (!authenticatedAccountId || collaborationRefreshing) return false;
    collaborationRefreshing = true;
    try {
      const [groupsResponse, messagesResponse, filesResponse] = await Promise.all([
        fetch('/api/groups', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/messages', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/files', { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      if (!groupsResponse.ok || !messagesResponse.ok || !filesResponse.ok) throw new Error('collaboration_unavailable');
      const nextGroups = (await groupsResponse.json()).groups || [];
      const nextMessages = (await messagesResponse.json()).messages || [];
      const nextFiles = (await filesResponse.json()).files || [];
      const changed = JSON.stringify(collaboration.groups) !== JSON.stringify(nextGroups) || JSON.stringify(collaboration.messages) !== JSON.stringify(nextMessages) || JSON.stringify(collaboration.files) !== JSON.stringify(nextFiles);
      collaboration.groups = nextGroups;
      collaboration.messages = nextMessages;
      collaboration.files = nextFiles;
      collaborationLoaded = true;
      return changed;
    } catch { collaborationLoaded = true; if (!silent) toast('Не удалось загрузить сообщения', 'Проверьте соединение и повторите попытку.'); return false; }
    finally { collaborationRefreshing = false; }
  }
  function stopCollaborationPolling() {
    window.clearInterval(collaborationPollTimer);
    collaborationPollTimer = null;
  }
  function startCollaborationPolling() {
    stopCollaborationPolling();
    collaborationPollTimer = window.setInterval(async () => {
      if (currentView !== 'messages' || document.hidden) return;
      const changed = await loadCollaboration({ silent: true });
      if (changed && currentView === 'messages') renderMessages();
    }, 2500);
  }
  function directContacts() {
    if (!isStudentAccount()) return currentTutorStudents().map((student) => ({ id: accountIdForStudent(student.id), name: student.name, subtitle: student.subject || 'Ученик' }));
    const studentId = currentAccount()?.studentId;
    return state.tutorLinks.filter((link) => link.studentId === studentId).map((link) => getAccount(link.tutorId)).filter(Boolean).map((tutor) => ({ id: tutor.id, name: tutor.name, subtitle: 'Репетитор' }));
  }
  function renderMessages() {
    if (!collaborationLoaded) {
      pageContent.innerHTML = `${pageHeading('СООБЩЕНИЯ', 'Переписка.', 'Личные и групповые беседы с участниками занятий.')}<div class="empty-state"><strong>Загружаем беседы…</strong></div>`;
      loadCollaboration().then(() => { if (currentView === 'messages') renderMessages(); });
      return;
    }
    startCollaborationPolling();
    const contacts = directContacts(); const groups = collaboration.groups;
    const conversations = [
      ...contacts.map((item) => ({ key: `direct:${item.id}`, title: item.name, subtitle: item.subtitle, icon: initials(item.name) })),
      ...groups.map((group) => ({ key: `group:${group.id}`, title: group.name, subtitle: `${group.studentIds.length} ученик${group.studentIds.length === 1 ? '' : 'а'}`, icon: 'Г' })),
    ];
    if (!activeConversation || !conversations.some((item) => item.key === activeConversation)) activeConversation = conversations[0]?.key || '';
    const [kind, targetId] = activeConversation.split(':'); const selected = conversations.find((item) => item.key === activeConversation);
    const messages = collaboration.messages.filter((message) => kind === 'group' ? message.groupId === targetId : !message.groupId && ((message.senderId === currentAccount()?.id && message.recipientId === targetId) || (message.senderId === targetId && message.recipientId === currentAccount()?.id)));
    const actions = !isStudentAccount() ? `<button class="button button-light" data-action="group-new">${useIcon('users')} Новая группа</button>` : '';
    pageContent.innerHTML = `${pageHeading('СООБЩЕНИЯ', 'Переписка.', 'Общайтесь с учениками лично или всей учебной группой.', actions)}<section class="messenger-shell"><aside class="conversation-list"><div class="conversation-list-title">Беседы</div>${conversations.map((item) => `<button class="conversation-item ${item.key === activeConversation ? 'active' : ''}" data-action="conversation-open" data-id="${escapeHTML(item.key)}"><span class="avatar avatar--mint">${escapeHTML(item.icon)}</span><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.subtitle)}</small></span>${item.key.startsWith('group:') && !isStudentAccount() ? `<i data-action="group-edit" data-id="${escapeHTML(item.key.slice(6))}" title="Изменить группу">${useIcon('edit')}</i>` : ''}</button>`).join('') || '<div class="conversation-empty">Добавьте ученика, чтобы начать переписку.</div>'}</aside><div class="chat-panel">${selected ? `<header class="chat-head"><div><strong>${escapeHTML(selected.title)}</strong><span>${escapeHTML(selected.subtitle)}</span></div></header><div class="message-stream">${messages.map((message) => `<article class="message-bubble ${message.senderId === currentAccount()?.id ? 'is-own' : ''}"><strong>${escapeHTML(message.senderName || '')}</strong><p>${escapeHTML(message.body)}</p><time>${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(message.createdAt * 1000))}</time></article>`).join('') || '<div class="chat-placeholder">Здесь начнётся ваша переписка.</div>'}</div><form class="message-compose" data-form="message"><textarea name="body" maxlength="4000" rows="2" placeholder="Напишите сообщение…" required></textarea><button class="button button-primary" type="submit">Отправить</button></form>` : '<div class="chat-placeholder">Выберите беседу слева.</div>'}</div></section>`;
    pageContent.querySelector('.message-stream')?.scrollTo({ top: 100000 });
    pageContent.querySelectorAll('.message-bubble').forEach((bubble, index) => {
      const attachments = messages[index]?.attachments || []; const time = bubble.querySelector('time');
      if (time && attachments.length) time.insertAdjacentHTML('beforebegin', `<div class="message-attachments">${attachments.map((file) => `<button class="message-attachment" data-action="file-open" data-url="${escapeHTML(file.url)}" data-name="${escapeHTML(file.name)}" data-type="${escapeHTML(file.type || '')}">${useIcon('download')} ${escapeHTML(file.name)}</button>`).join('')}</div>`);
    });
    const composer = pageContent.querySelector('.message-compose');
    if (composer?.querySelector('textarea')) composer.querySelector('textarea').required = false;
    if (composer && collaboration.files.length) composer.querySelector('textarea')?.insertAdjacentHTML('afterend', `<select class="message-file-select" name="attachmentIds" multiple aria-label="Файлы из хранилища">${collaboration.files.map((file) => `<option value="${escapeHTML(file.id)}">${escapeHTML(file.name)}</option>`).join('')}</select>`);
    if (composer && !isStudentAccount()) composer.querySelector('textarea')?.insertAdjacentHTML('afterend', '<label class="message-upload" title="Загрузить новый файл">＋<input name="newFiles" type="file" multiple hidden></label>');
  }
  function openGroupForm(groupId = '') {
    const group = collaboration.groups.find((item) => item.id === groupId); const students = currentTutorStudents();
    if (!students.length) { toast('Сначала добавьте учеников'); return; }
    showModal(group ? 'Изменить группу' : 'Новая группа', 'Выберите участников для группового чата и домашних заданий.', `<form class="form-grid" data-form="group" ${group ? `data-id="${escapeHTML(group.id)}"` : ''}><div class="form-field"><label for="groupName">Название группы</label><input class="form-control" id="groupName" name="name" value="${escapeHTML(group?.name || '')}" maxlength="80" required /></div><fieldset class="group-member-picker"><legend>Участники</legend>${students.map((student) => { const accountId = accountIdForStudent(student.id); return `<label><input type="checkbox" name="studentId" value="${escapeHTML(accountId)}" ${group?.studentIds.includes(accountId) ? 'checked' : ''}/> ${escapeHTML(student.name)}</label>`; }).join('')}</fieldset><div class="form-actions">${group ? `<button type="button" class="button button-danger" data-action="group-delete" data-id="${escapeHTML(group.id)}">Удалить группу</button>` : ''}<button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Сохранить</button></div></form>`);
  }

  function renderLessons() {
    if (isStudentAccount()) { renderStudentOverview(); return; }
    const actions = `<button class="button button-primary" data-action="open-modal" data-modal="lesson">${useIcon('plus')} Запланировать занятие</button>`;
    const ordered = currentTutorLessons().slice().sort((a, b) => lessonInstant(a) - lessonInstant(b));
    const groups = ordered.reduce((acc, lesson) => { const day = lessonDateForViewer(lesson); (acc[day] ||= []).push(lesson); return acc; }, {});
    const content = Object.keys(groups).map((date) => `<div class="list-date-heading">${escapeHTML(dateLabel(date))} · ${escapeHTML(formatDate(date, { day: 'numeric', month: 'long' }))}</div>${groups[date].map((lesson) => lessonRow(lesson)).join('')}`).join('');
    pageContent.innerHTML = `${pageHeading('РАСПИСАНИЕ', 'Ваши занятия.', 'Планируйте уроки и открывайте комнату по одному нажатию.', actions)}<div class="lesson-list">${content || `<div class="empty-state"><strong>Занятий пока нет</strong>Добавьте занятие, чтобы собрать своё расписание.</div>`}</div>`;
  }
  function lessonRow(lesson) {
    const student = getStudent(lesson.studentId);
    return `<article class="lesson-list-row"><div class="time-column">${escapeHTML(lessonTimeForViewer(lesson))}<small>${lesson.duration} мин · ${escapeHTML(lessonViewerZone(lesson))}</small></div><div class="lesson-row-main"><i class="lesson-subject-dot ${student?.subject === 'Физика' ? 'lesson-subject-dot--lilac' : student?.subject === 'Английский' ? 'lesson-subject-dot--orange' : ''}"></i><div><strong>${escapeHTML(lesson.title)}</strong><span>${escapeHTML(student?.name || 'Ученик')} · ${escapeHTML(student?.subject || 'Занятие')}</span></div></div><div class="lesson-row-actions"><span class="status-pill">Запланировано</span><button class="button button-light button-small" data-action="lesson-edit" data-id="${escapeHTML(lesson.id)}">${useIcon('edit')} Изменить</button><button class="button button-light button-small" data-action="lesson-board" data-id="${escapeHTML(lesson.id)}">${useIcon('board')} Доска</button><button class="button button-light button-small" data-action="start-lesson" data-id="${escapeHTML(lesson.id)}">${useIcon('video')} Войти</button></div></article>`;
  }

  function renderPlannerBlock(block, index) {
    const tools = `<div class="planner-block-tools"><button class="tiny-action" data-action="planner-up" data-id="${escapeHTML(block.id)}" title="Переместить выше">↑</button><button class="tiny-action" data-action="planner-down" data-id="${escapeHTML(block.id)}" title="Переместить ниже">↓</button><button class="tiny-action" data-action="planner-remove" data-id="${escapeHTML(block.id)}" title="Удалить блок">${useIcon('trash')}</button></div>`;
    if (block.type === 'divider') return `<div class="planner-block planner-block--divider" data-block-id="${escapeHTML(block.id)}"><span class="planner-grip">⠿</span><hr>${tools}</div>`;
    if (block.type === 'heading') return `<div class="planner-block planner-block--heading" data-block-id="${escapeHTML(block.id)}"><span class="planner-grip">⠿</span><h2 contenteditable="true" spellcheck="false" data-planner-edit="${escapeHTML(block.id)}">${escapeHTML(block.text)}</h2>${tools}</div>`;
    if (block.type === 'todo') return `<div class="planner-block planner-block--todo ${block.checked ? 'is-checked' : ''}" data-block-id="${escapeHTML(block.id)}"><span class="planner-grip">⠿</span><button class="planner-checkbox" data-action="planner-toggle" data-id="${escapeHTML(block.id)}" aria-label="Отметить задачу">${block.checked ? useIcon('check') : ''}</button><div contenteditable="true" spellcheck="false" data-planner-edit="${escapeHTML(block.id)}">${escapeHTML(block.text)}</div>${tools}</div>`;
    if (block.type === 'callout') return `<div class="planner-block planner-block--callout" data-block-id="${escapeHTML(block.id)}"><span class="planner-grip">⠿</span><span class="planner-callout-icon">${useIcon('spark')}</span><div contenteditable="true" spellcheck="false" data-planner-edit="${escapeHTML(block.id)}">${escapeHTML(block.text)}</div>${tools}</div>`;
    return `<div class="planner-block planner-block--paragraph" data-block-id="${escapeHTML(block.id)}"><span class="planner-grip">⠿</span><div contenteditable="true" spellcheck="false" data-planner-edit="${escapeHTML(block.id)}">${escapeHTML(block.text)}</div>${tools}</div>`;
  }
  let plannerPersistTimer = null;
  function addPlannerBlock(type) {
    const block = { id: `block-${Date.now()}`, type, text: type === 'heading' ? 'Новый раздел' : type === 'todo' ? 'Новая задача' : type === 'callout' ? 'Важная заметка' : 'Напишите здесь…', ...(type === 'todo' ? { checked: false } : {}) };
    const planner = currentPlanner(); planner.blocks.push(block); persist(); renderTasks();
    const target = document.querySelector(`[data-planner-edit="${block.id}"]`); target?.focus();
  }
  function reorderPlannerBlock(id, delta) {
    const blocks = currentPlanner().blocks; const index = blocks.findIndex((block) => block.id === id); const target = index + delta;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; persist(); renderTasks();
  }
  function deletePlannerBlock(id) { const planner = currentPlanner(); planner.blocks = planner.blocks.filter((block) => block.id !== id); persist(); renderTasks(); }
  function renderStudentTasks() {
    const tasks = tasksForCurrentStudent().slice().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    pageContent.innerHTML = `${pageHeading('МОИ ЗАДАНИЯ', 'Домашняя работа.', 'Здесь собраны задания от ваших репетиторов.')}<div class="task-list student-task-list">${tasks.map((task) => `<article class="task-card"><button class="task-check ${task.status === 'complete' ? 'is-complete' : ''}" data-action="student-task-status" data-id="${escapeHTML(task.id)}" title="${task.status === 'complete' ? 'Проверено репетитором' : 'Отметить готовым'}" ${task.status === 'complete' ? 'disabled' : ''}>${useIcon(task.status === 'complete' ? 'check' : 'clock')}</button><div class="task-main"><h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(task.description || '')}</p>${taskAttachmentList(task)}<div class="task-tags"><span class="tag tag--subject">${escapeHTML(task.subject || 'Задание')}</span><span class="tag">Репетитор: ${escapeHTML(getAccount(task.tutorId)?.name || 'Ваш репетитор')}</span>${task.groupName ? `<span class="tag">Группа: ${escapeHTML(task.groupName)}</span>` : ''}<span class="tag">До ${escapeHTML(dueLabel(task.due))}</span></div></div></article>`).join('') || `<div class="empty-state"><strong>Новых заданий пока нет</strong>Когда репетитор назначит работу, она появится здесь.</div>`}</div>`;
    pageContent.querySelectorAll('.student-task-list .task-card').forEach((card, index) => { const task = tasks[index]; if (!task) return; card.querySelector('.task-main')?.insertAdjacentHTML('beforeend', `<p class="review-comment"><strong>${escapeHTML(reviewLabel(task.reviewStatus))}</strong>${task.reviewComment ? ` · ${escapeHTML(task.reviewComment)}` : ''}</p>`); });
  }
  function renderTasks() {
    if (isStudentAccount()) { renderStudentTasks(); return; }
    if (currentPlan() !== 'extreme') { renderFeatureGate('Планер и домашняя работа.', 'Назначайте упражнения, проверяйте ответы и ведите рабочие заметки в блочном пространстве.', ['Блочные страницы и чек-листы', 'Личные задачи', 'Домашние задания ученикам', 'Копирование заданий и статусы']); return; }
    const tasks = tasksForCurrentTutor();
    const planner = currentPlanner();
    const visible = tasks.filter((task) => taskFilter === 'all' || (taskFilter === 'personal' && task.kind === 'personal') || (taskFilter === 'homework' && task.kind !== 'personal') || task.status === taskFilter).slice().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const taskCards = visible.map((task) => taskCard(task)).join('');
    const actions = `<button class="button button-primary" data-action="open-modal" data-modal="task">${useIcon('plus')} Новая задача</button>`;
    pageContent.innerHTML = `${pageHeading('РАБОЧЕЕ ПРОСТРАНСТВО', 'Планер.', 'Страница из блоков для заметок, чек-листов и заданий.', actions)}<section class="notion-editor"><div class="notion-editor-top"><span>${useIcon('edit')} ЛИЧНОЕ ПРОСТРАНСТВО</span><span class="notion-save-state" id="plannerSaveState">Сохранено</span></div><div class="notion-page-title" contenteditable="true" spellcheck="false" data-planner-title>${escapeHTML(planner.title || 'План на неделю')}</div><div class="notion-blocks">${planner.blocks.map(renderPlannerBlock).join('')}</div><div class="notion-add-toolbar"><span>Добавить блок</span><button class="notion-add-button" data-action="planner-add" data-type="heading">Заголовок</button><button class="notion-add-button" data-action="planner-add" data-type="paragraph">Текст</button><button class="notion-add-button" data-action="planner-add" data-type="todo">Чек-лист</button><button class="notion-add-button" data-action="planner-add" data-type="callout">Заметка</button><button class="notion-add-button" data-action="planner-add" data-type="divider">Разделитель</button></div></section><div class="planner-database-heading"><div><span class="heading-kicker">СПИСОК ЗАДАЧ</span><h2>Личные дела и домашняя работа</h2></div><div class="toolbar-row task-filters"><button class="filter-chip ${taskFilter === 'all' ? 'active' : ''}" data-action="task-filter" data-filter="all">Все <span>${tasks.length}</span></button><button class="filter-chip ${taskFilter === 'personal' ? 'active' : ''}" data-action="task-filter" data-filter="personal">Мои задачи</button><button class="filter-chip ${taskFilter === 'homework' ? 'active' : ''}" data-action="task-filter" data-filter="homework">Домашние задания</button><button class="filter-chip ${taskFilter === 'submitted' ? 'active' : ''}" data-action="task-filter" data-filter="submitted">Сдано</button><button class="filter-chip ${taskFilter === 'complete' ? 'active' : ''}" data-action="task-filter" data-filter="complete">Готово</button></div></div><div class="tasks-layout"><div><div class="task-list">${taskCards || `<div class="empty-state"><strong>Задач в этом списке пока нет</strong>Создайте задачу или выберите другой фильтр.</div>`}</div></div><aside class="task-side-card"><span class="plan-mini-icon">${useIcon('spark')}</span><h3>Порядок для вас и учеников.</h3><p>Личные задачи остаются только у вас. Домашние задания можно копировать: у каждого ученика свои срок, ответ и проверка.</p><div class="task-side-stat"><span>Личных задач</span><strong>${tasks.filter((task) => task.kind === 'personal' && task.status !== 'complete').length}</strong></div><div class="task-side-stat"><span>Ждут проверки</span><strong>${tasks.filter((task) => task.kind !== 'personal' && task.status === 'submitted').length}</strong></div><button class="button button-light button-small button-full" data-action="open-modal" data-modal="task">${useIcon('plus')} Новая задача</button></aside></div>`;
    pageContent.querySelector('.task-side-card')?.remove();
    pageContent.querySelector('.task-filters')?.remove();
    const listTitle = pageContent.querySelector('.planner-database-heading h2'); if (listTitle) listTitle.textContent = 'Задачи планирования';
    pageContent.querySelectorAll('.task-card').forEach((card) => { const id = card.querySelector('[data-id]')?.dataset.id; if (state.tasks.find((task) => task.id === id)?.kind !== 'personal') card.remove(); });
  }

  function reviewLabel(value) { return ({ unchecked: 'Непроверено', errors: 'Есть ошибки', correct: 'Правильно' })[value] || 'Непроверено'; }
  function renderHomework() {
    if (isStudentAccount()) { renderStudentTasks(); return; }
    if (!collaborationLoaded) { pageContent.innerHTML = `${pageHeading('ОБУЧЕНИЕ', 'Домашние задания.', 'Загружаем защищённое хранилище…')}<div class="empty-state"><strong>Загрузка…</strong></div>`; loadCollaboration().then(() => { if (currentView === 'homework') renderHomework(); }); return; }
    const tasks = tasksForCurrentTutor().filter((task) => task.kind !== 'personal').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const actions = `<button class="button button-primary" data-action="open-modal" data-modal="homework">${useIcon('plus')} Новое задание</button>`;
    pageContent.innerHTML = `${pageHeading('ОБУЧЕНИЕ', 'Домашние задания.', 'Создавайте, выдавайте и проверяйте работы в отдельном разделе.', actions)}<div class="homework-layout"><section class="storage-panel"><h2>Хранилище преподавателя</h2><p>Загруженные материалы доступны для повторного использования в заданиях, чате и на доске.</p><button class="button button-light" data-action="storage-upload">${useIcon('plus')} Загрузить файл</button><input id="storageUpload" type="file" multiple hidden><div class="empty-state"><strong>Общее хранилище готовится</strong>Файлы заданий уже сохраняются защищённо и не доступны по чужой ссылке.</div></section><section class="homework-panel"><div class="task-list">${tasks.map((task) => `<article class="task-card"><div class="task-main"><h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(task.description || '')}</p><div class="task-tags"><span class="tag">${escapeHTML(studentName(task.studentId))}</span><span class="tag">${escapeHTML(reviewLabel(task.reviewStatus))}</span><span class="tag">${escapeHTML(dueLabel(task.due))}</span></div>${task.reviewComment ? `<p class="review-comment">Комментарий: ${escapeHTML(task.reviewComment)}</p>` : ''}${(task.attachments || []).map((file) => `<button class="attachment-link" data-action="file-open" data-url="${escapeHTML(file.url)}" data-name="${escapeHTML(file.name)}" data-type="${escapeHTML(file.type || '')}">${useIcon('download')} ${escapeHTML(file.name)}</button>`).join('')}</div><div class="task-actions"><button class="button button-light button-small" data-action="homework-review" data-id="${escapeHTML(task.id)}">Проверить</button></div></article>`).join('') || '<div class="empty-state"><strong>Домашних заданий пока нет</strong>Создайте первое задание для ученика или группы.</div>'}</div></section></div>`;
    const storedFiles = collaboration.files;
    const storage = pageContent.querySelector('.storage-panel');
    storage?.querySelector('[data-action="storage-upload"]')?.insertAdjacentHTML('beforebegin', '<input class="form-control storage-new-folder" id="storageNewFolder" placeholder="Папка для новых файлов" maxlength="80">');
    const placeholder = storage?.querySelector('.empty-state');
    if (placeholder) placeholder.innerHTML = storedFiles.length ? storedFiles.map((file) => `<div class="storage-file"><button class="attachment-link" data-action="file-open" data-url="${escapeHTML(file.url)}" data-name="${escapeHTML(file.name)}" data-type="${escapeHTML(file.type || '')}">${useIcon('download')} ${escapeHTML(file.name)}</button><button data-action="storage-delete" data-id="${escapeHTML(file.id)}" aria-label="Удалить файл">×</button><input class="storage-folder-input" data-storage-folder="${escapeHTML(file.id)}" value="${escapeHTML(file.folder || '')}" placeholder="Папка" aria-label="Папка файла"></div>`).join('') : '<strong>Файлов пока нет</strong>Загрузите материал один раз и используйте его повторно.';
    pageContent.querySelector('#storageUpload')?.addEventListener('change', uploadStorageFiles);
  }

  async function uploadStorageFiles(event) {
    const input = event.currentTarget; const files = [...(input.files || [])]; if (!files.length) return;
    input.disabled = true;
    try {
      for (const file of files) { const body = new FormData(); body.append('file', file); body.append('folder', document.getElementById('storageNewFolder')?.value || ''); const response = await fetch('/api/files', { method: 'POST', credentials: 'same-origin', body }); const result = await response.json().catch(() => ({})); if (!response.ok || !result.file) throw new Error(result.message || 'upload_failed'); collaboration.files.unshift(result.file); }
      toast('Файлы добавлены в хранилище'); renderHomework();
    } catch (error) { toast('Не удалось загрузить файл', error.message || 'Проверьте размер файла.'); input.disabled = false; }
  }

  function currentNotes() { const owner = currentAccount()?.id || 'guest'; state.notesByOwner ||= {}; return state.notesByOwner[owner] ||= []; }
  function renderNotion() {
    const notes = currentNotes(); let selected = notes.find((note) => note.id === state.currentNoteId) || notes[0]; if (selected) state.currentNoteId = selected.id;
    pageContent.innerHTML = `${pageHeading('ОБУЧЕНИЕ', 'Notion.', 'Заметки и учебные материалы отдельно от планера.', `<button class="button button-primary" data-action="note-new">${useIcon('plus')} Новая страница</button>`)}<section class="notes-shell"><aside class="notes-list">${notes.map((note) => `<button class="note-list-item ${note.id === selected?.id ? 'active' : ''}" data-action="note-open" data-id="${escapeHTML(note.id)}">${escapeHTML(note.title || 'Без названия')}</button>`).join('') || '<div class="conversation-empty">Создайте первую страницу.</div>'}</aside><div class="note-editor">${selected ? `<input class="note-title-input" value="${escapeHTML(selected.title)}" data-note-title="${escapeHTML(selected.id)}" aria-label="Название страницы"><textarea class="note-body-input" data-note-body="${escapeHTML(selected.id)}" aria-label="Текст страницы" placeholder="Начните писать…">${escapeHTML(selected.body || '')}</textarea><button class="button button-danger button-small" data-action="note-delete" data-id="${escapeHTML(selected.id)}">Удалить страницу</button>` : '<div class="empty-state"><strong>Страница не выбрана</strong></div>'}</div></section>`;
  }
  function taskCard(task) {
    const personal = task.kind === 'personal';
    const isLate = task.status === 'todo' && Boolean(task.due) && task.due < addDaysISO(0);
    const tagClass = task.status === 'submitted' ? 'tag--submitted' : isLate ? 'tag--overdue' : 'tag--subject';
    const statusSuffix = task.status === 'submitted' ? ' · Сдано' : task.status === 'complete' ? ' · Проверено' : '';
    const assignmentTag = personal ? '<span class="tag">Личная задача · только для вас</span>' : `<span class="tag">${escapeHTML(studentName(task.studentId))}${statusSuffix}</span>`;
    return `<article class="task-card"><button class="task-check ${task.status === 'complete' ? 'is-complete' : ''}" data-action="task-status" data-id="${escapeHTML(task.id)}" title="Изменить статус">${useIcon(task.status === 'complete' ? 'check' : 'clock')}</button><div class="task-main"><h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(task.description || 'Нет описания')}</p>${taskAttachmentList(task, true)}<div class="task-tags"><span class="tag ${personal ? '' : tagClass}">${escapeHTML(task.subject || (personal ? 'Личное' : 'Задание'))}</span>${assignmentTag}${task.groupName ? `<span class="tag">Группа: ${escapeHTML(task.groupName)}</span>` : ''}<span class="tag ${isLate ? 'tag--overdue' : ''}">${isLate ? 'Срок прошёл' : escapeHTML(dueLabel(task.due))}</span></div></div><div class="task-actions">${personal ? '' : `<button class="tiny-action" data-action="copy-task" data-id="${escapeHTML(task.id)}" title="Копировать ученику">${useIcon('copy')}</button>`}</div></article>`;
  }
  function taskAttachmentList(task, editable = false) {
    const attachments = Array.isArray(task.attachments) ? task.attachments : []; if (!attachments.length) return '';
    return `<div class="task-attachments">${attachments.map((attachment) => `<span><button class="attachment-link" data-action="file-open" data-url="${escapeHTML(attachment.url)}" data-name="${escapeHTML(attachment.name)}" data-type="${escapeHTML(attachment.type || '')}">${useIcon('download')} ${escapeHTML(attachment.name)}</button>${editable ? `<button data-action="attachment-delete" data-id="${escapeHTML(attachment.id)}" data-task-id="${escapeHTML(task.id)}" aria-label="Удалить вложение">×</button>` : ''}</span>`).join('')}</div>`;
  }

  function renderSubscription() {
    const active = currentPlan();
    const planButton = (plan, label) => active === plan ? `<button class="button button-light button-full" disabled>Текущий тариф</button>` : `<button class="button ${plan === 'extreme' ? 'button-primary' : 'button-light'} button-full" data-action="choose-plan" data-plan="${plan}">Перейти на «${label}»</button>`;
    const feature = (text, included = true) => `<li class="${included ? '' : 'muted-feature'}"><span class="feature-check">${included ? useIcon('check') : useIcon('close')}</span>${text}</li>`;
    const card = (plan, label, price, description, features) => `<article class="price-card ${active === plan ? 'price-card--featured' : ''}">${active === plan ? '<span class="popular-badge">ТЕКУЩИЙ ТАРИФ</span>' : ''}<div class="price-plan-head"><h2 class="price-plan-title">${label}</h2><span class="price-icon">${useIcon(plan === 'extreme' ? 'spark' : 'video')}</span></div><p class="price-description">${description}</p><div class="price-value">${price}</div><div class="price-period">${plan === 'free' ? 'без оплаты' : 'в месяц · оплата пока не подключена'}</div><div class="price-divider"></div><ul class="feature-list">${features.map((item) => feature(item)).join('')}</ul>${planButton(plan, label)}</article>`;
    pageContent.innerHTML = `<section class="pricing-intro"><span class="heading-kicker">ТАРИФЫ TUTDESK</span><h1>Выберите подходящий формат.</h1><p>Тариф можно сменить сейчас; платёжная система пока не подключена.</p></section><div class="pricing-grid pricing-grid--three">${card('free','Бесплатный','0 ₽','Только звонки. В комнате одновременно показывает экран один участник.',['Видеозвонки','Камера и микрофон','Одна демонстрация экрана в комнате'])}${card('light','Базовый','399 ₽','Звонки, занятия и совместная доска.',['Всё из бесплатного','Интерактивная доска','Расписание и сообщения'])}${card('extreme','Продвинутый','1249 ₽','Полный набор для ведения учеников.',['Всё из базового','Домашние задания и файлы','Группы, проверка и Notion'])}</div>`;
  }

  function renderBoard() {
    if (!state.boards.length) createBoard('Новая доска');
    const boards = state.boards.filter((board) => isStudentAccount()
      ? board.lessonIds.some((lessonId) => state.lessons.some((lesson) => lesson.id === lessonId && lesson.studentId === currentAccount()?.studentId))
      : board.tutorId === currentTutorId());
    if (!boards.length) { pageContent.innerHTML = isStudentAccount() ? `${pageHeading('ДОСКИ ЗАНЯТИЙ', 'Здесь появятся ваши доски.', 'Доска станет доступна, когда репетитор закрепит её за занятием.')}<div class="empty-state board-empty-state">${useIcon('board')}<strong>Пока нет доступных досок</strong>Попросите репетитора открыть или закрепить общую доску за вашим уроком.</div>` : `${pageHeading('ДОСКА ЗАНЯТИЯ', 'Создайте первую доску.', 'Каждая доска хранит собственные элементы и может быть привязана к одному или нескольким занятиям.', `<button class="button button-primary" data-action="board-new">${useIcon('plus')} Новая доска</button>`)}<div class="empty-state board-empty-state">${useIcon('board')}<strong>У вас пока нет досок</strong>Создайте доску, чтобы начать работу.</div>`; return; }
    const board = boards.find((item) => item.id === state.currentBoardId) || boards[0] || state.boards[0];
    if (board) state.currentBoardId = board.id;
    const lessonOptions = currentTutorLessons().filter((lesson) => lesson.boardId !== board.id).map((lesson) => `<option value="${escapeHTML(lesson.id)}">${escapeHTML(dateLabel(lesson.date))} · ${escapeHTML(lesson.title)}</option>`).join('');
    const boardLessons = board?.lessonIds.map((lessonId) => state.lessons.find((lesson) => lesson.id === lessonId)).filter(Boolean) || [];
    const expanded = document.querySelector('.app-shell')?.classList.contains('is-board-expanded');
    const actions = `<button class="button button-light button-small" data-action="board-fullscreen" aria-pressed="${expanded ? 'true' : 'false'}">${expanded ? '⛶ Свернуть' : '⛶ Во весь экран'}</button>${!isStudentAccount() ? `<button class="button button-light button-small" data-action="board-attach" ${lessonOptions ? '' : 'disabled'}>${useIcon('plus')} Привязать к занятию</button>` : ''}<button class="button button-light button-small" data-action="board-new">${useIcon('plus')} Новая доска</button><button class="button button-light button-small" data-action="board-export">${useIcon('download')} Скачать</button>`;
    const tool = (name, icon, label, key) => {
      const title = `${label}${key ? ` (${key})` : ''}`;
      const glyph = icon === 'line-segment' ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 16 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' : icon === 'hand' ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.3 9.2V5.4a1.2 1.2 0 0 1 2.4 0v3-4a1.2 1.2 0 0 1 2.4 0v4.1-3.1a1.2 1.2 0 0 1 2.4 0v3.4-1.9a1.2 1.2 0 0 1 2.4 0v4.5c0 3.2-2.2 5.3-5.3 5.3H9.2c-1.6 0-2.8-.7-3.8-2L3.2 12a1.25 1.25 0 0 1 1.9-1.6l1.2 1.2V9.2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' : useIcon(icon);
      return `<button class="board-tool ${boardTool === name ? 'active' : ''}" data-action="board-tool" data-tool="${name}" title="${title}" aria-label="${title}">${glyph}<span class="board-tool-label">${label}</span></button>`;
    };
    pageContent.innerHTML = `${pageHeading('ДОСКА ЗАНЯТИЯ', 'Общее пространство для идей.', 'Базовые инструменты для совместной работы — в знакомом формате онлайн-доски.', actions)}
      <div class="board-layout"><section class="board-workspace">
        <div class="board-contextbar"><div class="board-context-title">${useIcon('board')}<select id="boardSelect" aria-label="Выбрать доску">${boards.map((item) => `<option value="${escapeHTML(item.id)}" ${item.id === board?.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></div><span class="board-save-state" id="boardSaveState">Сохранено</span><span class="board-associated-count">${boardLessons.length ? `${boardLessons.length} ${boardLessons.length === 1 ? 'занятие' : 'занятия'} используют эту доску` : 'Пока не привязана к занятию'}</span></div>
        <div class="board-toolbar" aria-label="Инструменты доски">
          ${tool('select', 'mouse', 'Выбор', 'V')}${tool('hand', 'hand', 'Рука', 'H')}${tool('pen', 'edit', 'Ручка', 'P')}${tool('text', 'type', 'Текст', 'T')}${tool('sticky', 'sticky', 'Стикер', 'N')}
          <span class="tool-divider"></span>${tool('line', 'line-segment', 'Линия', 'L')}${tool('arrow', 'arrow', 'Стрелка', 'A')}${tool('rect', 'square', 'Фигура', 'R')}${tool('ellipse', 'circle', 'Овал', 'O')}
          <span class="tool-divider"></span><label class="board-tool board-import-label" title="Загрузить фото, PDF или PPT">${useIcon('plus')}<span class="board-tool-label">Файл</span><input id="boardImport" type="file" accept="image/*,.pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple hidden /></label>
          <button class="board-tool" data-action="board-video-library" title="Добавить видео" aria-label="Добавить видео">${useIcon('video')}<span class="board-tool-label">Видео</span></button><button class="board-tool" data-action="board-file-library" title="Файл из хранилища" aria-label="Файл из хранилища">${useIcon('download')}<span class="board-tool-label">Хранилище</span></button>${tool('eraser', 'trash', 'Ластик', 'E')}
          <span class="tool-divider"></span><button class="board-tool" data-action="board-undo" title="Отменить (Ctrl+Z)" aria-label="Отменить">↶<span class="board-tool-label">Назад</span></button><button class="board-tool" data-action="board-redo" title="Повторить (Ctrl+Shift+Z)" aria-label="Повторить">↷<span class="board-tool-label">Вперёд</span></button><button class="board-tool" data-action="board-shortcuts" title="Сочетания клавиш" aria-label="Сочетания клавиш">?<span class="board-tool-label">Клавиши</span></button><button class="board-tool" data-action="board-clear" title="Очистить доску" aria-label="Очистить доску">${useIcon('trash')}<span class="board-tool-label">Очистить</span></button>
        </div>
        <div class="board-properties" aria-label="Свойства инструмента"><label class="color-input-label" title="Цвет"><input class="color-input" type="color" id="boardColor" value="${boardColor}" aria-label="Цвет текста и фигур" /></label><select id="boardFont" class="board-font-select" aria-label="Шрифт текста"><option value="Arial" ${boardFont === 'Arial' ? 'selected' : ''}>Arial</option><option value="Georgia" ${boardFont === 'Georgia' ? 'selected' : ''}>Georgia</option><option value="Verdana" ${boardFont === 'Verdana' ? 'selected' : ''}>Verdana</option><option value="'Courier New'" ${boardFont === "'Courier New'" ? 'selected' : ''}>Courier</option></select><label class="board-width-compact">Линия<select class="brush-size" id="brushSize" aria-label="Толщина линии"><option value="2" ${boardWidth === 2 ? 'selected' : ''}>Тонкая</option><option value="4" ${boardWidth === 4 || boardWidth === 3 ? 'selected' : ''}>Средняя</option><option value="8" ${boardWidth === 8 ? 'selected' : ''}>Толстая</option><option value="14" ${boardWidth === 14 ? 'selected' : ''}>Маркер</option></select></label><span class="board-size-value" id="boardWidthLabel">${boardWidth}px</span></div>
        <div class="board-canvas-wrap"><div class="board-surface" id="boardSurface"><canvas id="whiteboard" class="board-canvas" aria-label="Интерактивная доска"></canvas><div id="boardInlineEditor" class="board-inline-editor" hidden><textarea aria-label="Текст на доске" placeholder="Введите текст…"></textarea><div><button type="button" data-inline-cancel>Отмена</button><button type="button" data-inline-save>Добавить</button></div></div></div></div><div class="board-canvas-controls" aria-label="Масштаб доски"><button data-action="board-zoom-out" aria-label="Уменьшить">−</button><span class="board-zoom-value" id="boardZoomLabel">${Math.round(boardZoom * 100)}%</span><button data-action="board-zoom-in" aria-label="Увеличить">+</button><button data-action="board-zoom-fit" title="Показать все объекты" aria-label="Показать все объекты">Вписать</button></div>
        <div class="board-bottom"><div class="board-bottom-left">${useIcon('spark')}<span>Изменения сохраняются автоматически</span></div><span class="board-page-chip">${board?.elements.length || 0} элементов</span></div>
      </section></div>`;
    const canvasWrap = pageContent.querySelector('.board-canvas-wrap');
    const boardSurface = pageContent.querySelector('.board-surface');
    for (const video of board.elements.filter((item) => item.type === 'video' && videoFromUrl(item.url)?.embed === item.embed)) {
      const holder = document.createElement('div');
      holder.className = 'board-video';
      holder.dataset.elementId = video.id;
      holder.style.cssText = `left:${video.x / 3 * 100}%;top:${video.y / 3 * 100}%;width:${video.w / 3 * 100}%;height:${video.h / 3 * 100}%`;
      holder.innerHTML = `<iframe src="${escapeHTML(video.embed)}" title="${escapeHTML(video.title || 'Видеоурок')}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe><button type="button" class="board-video-move" title="Переместить видео" aria-label="Переместить видео">⠿</button><button type="button" class="board-video-remove" data-action="board-video-remove" data-id="${escapeHTML(video.id)}" aria-label="Убрать видео с доски">×</button><button type="button" class="board-video-resize" title="Изменить размер видео" aria-label="Изменить размер видео"></button>`;
      boardSurface.append(holder);
      const bindVideoGesture = (control, mode) => {
        control.onpointerdown = (event) => {
          event.preventDefault(); event.stopPropagation(); control.setPointerCapture(event.pointerId); pushBoardHistory(board);
          const baseWidth = Number(board.baseWidth) || boardSurface.clientWidth / 3; const baseHeight = Number(board.baseHeight) || boardSurface.clientHeight / 3;
          const startX = event.clientX; const startY = event.clientY; const origin = { x: video.x, y: video.y, w: video.w, h: video.h };
          control.onpointermove = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / (baseWidth * boardZoom); const dy = (moveEvent.clientY - startY) / (baseHeight * boardZoom);
            if (mode === 'move') { video.x = origin.x + dx; video.y = origin.y + dy; }
            else {
              const aspect = Math.max(.1, origin.w / Math.max(.01, origin.h));
              const nextW = Math.max(120 / baseWidth, origin.w + dx); video.w = nextW; video.h = Math.max(68 / baseHeight, nextW / aspect);
            }
            holder.style.left = `${video.x / 3 * 100}%`; holder.style.top = `${video.y / 3 * 100}%`; holder.style.width = `${video.w / 3 * 100}%`; holder.style.height = `${video.h / 3 * 100}%`;
          };
          control.onpointerup = control.onpointercancel = () => { control.onpointermove = null; saveBoard(board); };
        };
      };
      bindVideoGesture(holder.querySelector('.board-video-move'), 'move');
      bindVideoGesture(holder.querySelector('.board-video-resize'), 'resize');
    }
    const availableVideos = (state.videos || []).filter((video) => videoFromUrl(video.url)?.embed === video.embed);
    if (availableVideos.length) pageContent.querySelector('.board-workspace')?.insertAdjacentHTML('beforeend', `<div class="board-video-tray"><strong>Видеоуроки · перетащите на доску</strong>${availableVideos.map((video) => `<div draggable="true" data-video-id="${escapeHTML(video.id)}">${escapeHTML(video.title)}</div>`).join('')}</div>`);
    if (!isStudentAccount() && !lessonOptions) {
      const message = currentTutorLessons().length
        ? 'Все запланированные занятия уже привязаны к этой доске.'
        : 'Нет запланированных занятий. Сначала добавьте занятие в разделе «Занятия».';
      pageContent.querySelector('.board-layout')?.insertAdjacentHTML('beforebegin', `<p class="board-attach-hint" role="status">${message}</p>`);
    }
    window.requestAnimationFrame(setupBoard);
  }

  let quoteRequest; let dailyQuoteTimer;
  function showDailyQuote() {
    window.clearTimeout(dailyQuoteTimer);
    const midnight = new Date(); midnight.setHours(24, 0, 1, 0);
    dailyQuoteTimer = window.setTimeout(() => { if (currentView === 'overview') showDailyQuote(); }, Math.max(1000, midnight.getTime() - Date.now()));
    quoteRequest ||= fetch('quotes_365_ru.json').then((response) => response.json()).then((data) => data.quotes);
    quoteRequest.then((quotes) => {
      if (currentView !== 'overview' || !pageContent.firstElementChild) return;
      const now = new Date();
      const start = Date.UTC(now.getFullYear(), 0, 1);
      let day = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000) + 1;
      if (now.getFullYear() % 4 === 0 && day > 60) day -= 1;
      if (now.getMonth() === 1 && now.getDate() === 29) day = 59;
      const quote = quotes.find((item) => item.day === day);
      if (!quote) return;
      pageContent.querySelector('.daily-quote')?.remove();
      const attribution = quote.type === 'adaptation' ? `Адаптация · ${quote.display_attribution || quote.author}` : quote.display_attribution || quote.author;
      const card = document.createElement('section');
      card.className = 'daily-quote';
      card.innerHTML = `<span>МЫСЛЬ ДНЯ</span><blockquote>${quote.type === 'adaptation' ? '' : '«'}${escapeHTML(quote.text)}${quote.type === 'adaptation' ? '' : '»'}</blockquote><cite>${escapeHTML(attribution)}</cite>`;
      pageContent.firstElementChild.after(card);
    }).catch(() => {});
  }

  function videoFromUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      const host = url.hostname.toLowerCase();
      let id, provider, embed;
      if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
        id = host === 'youtu.be' ? url.pathname.slice(1) : url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : url.searchParams.get('v');
        if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) return null;
        provider = 'YouTube'; embed = `https://www.youtube.com/embed/${id}`;
      } else if (['rutube.ru', 'www.rutube.ru'].includes(host)) {
        id = url.pathname.match(/^\/(?:video|play\/embed)\/([a-fA-F0-9]{32})\/?$/)?.[1];
        if (!id) return null;
        provider = 'Rutube'; embed = `https://rutube.ru/play/embed/${id}`;
      } else return null;
      return { provider, embed, url: url.href };
    } catch { return null; }
  }

  function renderVideos() {
    const account = currentAccount();
    const videos = (state.videos || []).filter((video) => videoFromUrl(video.url)?.embed === video.embed);
    const students = !isStudentAccount() ? currentTutorStudents() : [];
    pageContent.innerHTML = `${pageHeading('ВИДЕОУРОКИ', 'Сохранённые видеоуроки.', 'Добавляйте ссылки YouTube и Rutube. Перетащите карточку из лотка видеоматериалов на доску.')}<form class="video-add-form" data-form="video-add"><input class="form-control" name="url" type="url" placeholder="Ссылка на YouTube или Rutube" required /><input class="form-control" name="title" placeholder="Название урока" maxlength="100" required /><button class="button button-primary" type="submit">Сохранить видео</button></form><div class="video-library">${videos.map((video) => `<article class="video-card" draggable="true" data-video-id="${escapeHTML(video.id)}"><iframe src="${escapeHTML(video.embed)}" title="${escapeHTML(video.title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><div class="video-card-info"><strong>${escapeHTML(video.title)}</strong><span>${escapeHTML(video.provider)} · Если плеер недоступен, откройте ролик на платформе.</span><a class="text-link" href="${escapeHTML(video.url)}" target="_blank" rel="noopener noreferrer">Открыть исходное видео →</a>${students.length && video.ownerId === account.id ? `<fieldset class="video-assignments"><legend>Показать ученикам</legend>${students.map((student) => { const studentAccountId = student.id.startsWith('student-') ? student.id.slice(8) : student.id; return `<label><input type="checkbox" data-video-assignment="${escapeHTML(video.id)}" value="${escapeHTML(studentAccountId)}" ${video.assignedStudentIds?.includes(studentAccountId) ? 'checked' : ''} /> ${escapeHTML(student.name)}</label>`; }).join('')}</fieldset>` : ''}<div class="video-card-actions"><button class="button button-light button-small" data-action="video-board" data-id="${escapeHTML(video.id)}">На доску</button>${video.ownerId === account.id ? `<button class="button button-danger button-small" data-action="video-delete" data-id="${escapeHTML(video.id)}">Удалить</button>` : ''}</div></div></article>`).join('') || '<div class="empty-state"><strong>Видеоуроков пока нет</strong>Добавьте ссылку выше.</div>'}</div>`;
  }
  function addVideoToBoard(videoId, x = .08, y = .08) {
    const video = state.videos.find((item) => item.id === videoId);
    const board = currentBoard();
    if (!video || !board) { toast('Нет доступной доски', 'Откройте доску занятия и повторите попытку.'); return; }
    if (videoFromUrl(video.url)?.embed !== video.embed) { toast('Ссылка видео повреждена'); return; }
    pushBoardHistory(board);
    board.elements.push({ id: `video-${crypto.randomUUID()}`, type: 'video', x, y, w: .38, h: .38, videoId, embed: video.embed, url: video.url, title: video.title });
    saveBoard(board);
    navigate('board');
  }
  function openBoardVideoPicker() {
    const videos = (state.videos || []).filter((video) => videoFromUrl(video.url)?.embed === video.embed);
    const saved = videos.length
      ? `<div class="board-video-picker-list">${videos.map((video) => `<button type="button" data-action="board-video-pick" data-id="${escapeHTML(video.id)}"><span>${useIcon('video')}</span><strong>${escapeHTML(video.title)}</strong><small>${escapeHTML(video.provider)}</small></button>`).join('')}</div>`
      : '<div class="account-note">Сохранённых видео пока нет. Добавьте ссылку ниже.</div>';
    showModal('Добавить видео на доску', 'Выберите ролик из библиотеки или вставьте новую ссылку YouTube/Rutube.', `${saved}<form class="form-grid board-video-add-form" data-form="board-video-add"><div class="form-field"><label for="boardVideoUrl">Ссылка на видео</label><input class="form-control" id="boardVideoUrl" name="url" type="url" placeholder="https://youtube.com/watch?v=…" required /></div><div class="form-field"><label for="boardVideoTitle">Название</label><input class="form-control" id="boardVideoTitle" name="title" maxlength="100" required /></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Добавить на доску</button></div></form>`);
  }
  function openBoardFilePicker() {
    if (!collaborationLoaded) { loadCollaboration().then(openBoardFilePicker); return; }
    if (!collaboration.files.length) { toast('Хранилище пусто', 'Загрузите файл в разделе домашних заданий.'); return; }
    showModal('Файл из хранилища', 'Двойной щелчок по карточке файла на доске откроет просмотрщик.', `<div class="board-video-picker-list">${collaboration.files.map((file) => `<button type="button" data-action="board-file-pick" data-id="${escapeHTML(file.id)}"><span>${useIcon('download')}</span><strong>${escapeHTML(file.name)}</strong><small>${escapeHTML(file.folder || 'Без папки')}</small></button>`).join('')}</div>`);
  }
  function addStoredFileToBoard(fileId) {
    const file = collaboration.files.find((item) => item.id === fileId); const board = currentBoard(); if (!file || !board) return;
    pushBoardHistory(board); board.elements.push({ id: `file-${crypto.randomUUID()}`, type: 'sticky', x: .12, y: .12, w: .28, h: .18, text: `📎 ${file.name}`, fill: '#dfeeff', color: '#253029', width: 1, fileId: file.id, fileUrl: file.url, fileType: file.type, fileName: file.name }); saveBoard(board); closeModal(); renderBoard();
  }

  function renderRoom() {
    const studentMode = isStudentAccount();
    let lesson = activeConferenceId ? null : (state._activeLesson || nextLesson());
    if (!activeConferenceId && studentMode && lesson?.studentId !== currentAccount()?.studentId) lesson = nextLesson();
    if (!activeConferenceId && !studentMode && lesson && !currentTutorLessons().some((item) => item.id === lesson.id)) lesson = nextLesson();
    const student = lesson ? getStudent(lesson.studentId) : null;
    const ownName = currentAccount()?.name || 'Пользователь';
    const tutorName = getAccount(lesson?.tutorId)?.name || ownName;
    const partner = activeConferenceId ? 'участниками' : (studentMode ? tutorName : (student?.name || 'Ученик'));
    const lessonTitle = activeConferenceId ? 'Групповая конференция' : (lesson?.title || 'Индивидуальное занятие');
    if (!liveKitRoom) {
      pageContent.innerHTML = `<div class="room-page room-page--prejoin"><section class="room-prejoin" aria-label="Подключение к звонку"><button class="room-join-button" data-action="join-livekit">${useIcon('video')}<span>Подключиться к звонку</span></button></section></div>`;
      return;
    }
    const mediaNote = activeConferenceId
      ? (authenticatedAccountId
        ? 'Передайте ссылку приглашённым участникам; для входа им понадобится аккаунт Tutdesk.'
        : 'Передайте ссылку и временный код приглашённым участникам.')
      : 'Для тестового звонка участники должны открыть одно занятие и ввести общий временный код.';
    const lessonId = activeConferenceId || lesson?.id || 'tutdesk-open-room';
    const availableLessons = studentMode ? state.lessons.filter((item) => item.studentId === currentAccount()?.studentId && lessonInstant(item).getTime() >= Date.now()).sort((a, b) => lessonInstant(a) - lessonInstant(b)) : currentTutorLessons().filter((item) => lessonInstant(item).getTime() >= Date.now()).sort((a, b) => lessonInstant(a) - lessonInstant(b));
    const lessonPicker = !activeConferenceId && availableLessons.length > 1 ? `<label class="room-lesson-picker"><span>Выберите занятие</span><select id="roomLessonSelect" aria-label="Выберите занятие">${availableLessons.map((item) => `<option value="${escapeHTML(item.id)}" ${item.id === lesson?.id ? 'selected' : ''}>${escapeHTML(dateLabel(lessonDateForViewer(item)))} · ${escapeHTML(lessonTimeForViewer(item))} · ${escapeHTML(item.title)}${studentMode ? ` · ${escapeHTML(getAccount(item.tutorId)?.name || 'Репетитор')}` : ` · ${escapeHTML(studentName(item.studentId))}`}</option>`).join('')}</select></label>` : '';
    const inviteAction = '<button class="button button-light button-small" data-action="copy-conference">Пригласить участника</button>';
    const attendeesDescription = activeConferenceId ? 'Вы и приглашённые участники' : `Вы и ${escapeHTML(partner)}`;
    const roomSubtitle = activeConferenceId
      ? 'Пригласите участников по ссылке'
      : `Занятие с ${escapeHTML(partner)} · ${escapeHTML(lesson ? dateLabel(lessonDateForViewer(lesson)) : 'Сейчас')} ${escapeHTML(lesson ? lessonTimeForViewer(lesson) : '')}`;
    const roomFooterNote = authenticatedAccountId
      ? 'В конференции могут участвовать вошедшие в Tutdesk пользователи с приглашением.'
      : 'Гостям понадобятся приглашение и временный код для входа.';
    pageContent.innerHTML = `<div class="room-page"><div class="room-topline"><div class="room-title-group"><div><h1>${escapeHTML(lessonTitle)}</h1><p>${roomSubtitle}</p></div><span class="room-status-badge is-connected" id="roomConnectionStatus">НА СВЯЗИ</span></div><div class="room-call-actions">${lessonPicker}${inviteAction}<span class="room-clock" id="roomTimer">00:00</span></div></div><div class="room-layout"><section class="video-stage"><article class="video-tile" id="studentVideoTile"><div class="video-avatar">${escapeHTML(initials(partner))}</div><span class="video-name" id="remoteParticipantName">${escapeHTML(activeConferenceId ? 'Ожидание участников' : partner)}</span><span class="video-cam-state" id="remoteVideoState">${useIcon('cam-off')} Ожидает подключения</span></article><article class="video-tile video-tile--tutor" id="tutorVideoTile"><div class="video-avatar">${escapeHTML(initials(ownName))}</div><video id="localVideo" autoplay playsinline muted hidden></video><span class="video-name">Вы · ${escapeHTML(ownName)}</span><span class="video-cam-state" id="tutorVideoState">${useIcon('cam-off')} Камера выключена</span></article><div class="room-controls"><button class="room-control is-off" data-action="toggle-mic" title="Микрофон" aria-label="Микрофон">${useIcon('mic-off')}</button><button class="room-control is-off" data-action="toggle-camera" title="Камера" aria-label="Камера">${useIcon('cam-off')}</button><button class="room-control" data-action="share-screen" title="Показать экран" aria-label="Показать экран">${useIcon('monitor')}</button><span class="room-control-separator"></span><button class="room-control" data-action="open-board" title="Открыть доску" aria-label="Открыть доску">${useIcon('board')}</button><button class="room-control room-control--hangup" data-action="leave-room" title="Завершить" aria-label="Завершить">${useIcon('phone')}</button></div></section><aside class="room-aside"><h3>${activeConferenceId ? 'Конференция' : 'На занятии'}</h3><p>Пространство этой встречи</p><div class="room-info">${useIcon('users')}<div><strong>Участники</strong>${attendeesDescription}</div></div><div class="room-info">${useIcon('board')}<div><strong>Интерактивная доска</strong>${activeConferenceId ? 'Эта конференция не связана с общей доской' : 'Закреплена за занятием; работа сохранится для продолжения'}</div></div><div class="room-info">${useIcon('monitor')}<div><strong>Демонстрация экрана</strong>Поделитесь материалом ученику</div></div><div class="room-share-note">Код встречи: <strong>${escapeHTML(lessonId)}</strong><br />${escapeHTML(mediaNote)}</div></aside><div class="room-footer-note">${roomFooterNote}</div></div></div>`;
    startRoomTimer();
    updateParticipantCount();
  }

  function openLiveKitJoin() {
    const lesson = state._activeLesson || nextLesson();
    const roomName = activeConferenceId || lesson?.id || 'tutdesk-open-room';
    const accessForm = authenticatedAccountId
      ? '<div class="account-note">Вход выполнен. Временный код не нужен.</div>'
      : '<div class="form-field"><label for="livekitRoomCode">Временный код доступа</label><input class="form-control" id="livekitRoomCode" name="roomCode" type="password" autocomplete="off" required minlength="8" /></div>';
    const accessPrompt = authenticatedAccountId
      ? 'Войдите в аккаунт Tutdesk, чтобы подключиться.'
      : 'Введите временный код, который организатор передал участникам.';
    showModal('Подключиться к звонку', accessPrompt, `<form class="form-grid" data-form="livekit-join"><div class="account-note">Комната: <strong>${escapeHTML(roomName)}</strong>. ${activeConferenceId ? 'Вы подключитесь к общей конференции.' : 'Откройте это же занятие на втором устройстве.'}</div>${accessForm}<div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button type="submit" class="button button-primary">Подключиться</button></div></form>`);
  }

  function setConferenceUrl(conferenceId) {
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    url.searchParams.delete('auth_error');
    if (conferenceId) url.searchParams.set('conference', conferenceId);
    else url.searchParams.delete('conference');
    history.replaceState(null, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function currentCallRoomId() {
    return activeConferenceId || state._activeLesson?.id || nextLesson()?.id || '';
  }

  function conferenceInviteUrl(roomId = currentCallRoomId()) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('conference', roomId);
    return url.toString();
  }

  async function copyConferenceLink() {
    const roomId = currentCallRoomId();
    if (!roomId) { toast('Комната ещё не создана', 'Сначала подключитесь к звонку.'); return; }
    const inviteUrl = conferenceInviteUrl(roomId);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast('Ссылка скопирована', authenticatedAccountId
        ? 'Отправьте её вошедшим в Tutdesk участникам.'
        : 'Отправьте её участникам вместе с временным кодом доступа.');
    } catch {
      const inviteNote = authenticatedAccountId
        ? 'Для подключения участникам нужно войти в Tutdesk.'
        : 'Для подключения также нужен временный код доступа.';
      showModal('Ссылка на конференцию', 'Скопируйте ссылку и отправьте её участникам.', `<div class="form-grid"><input class="form-control" id="conferenceInviteLink" value="${escapeHTML(inviteUrl)}" readonly /><div class="account-note">${inviteNote}</div><div class="form-actions"><button class="button button-primary" data-action="close-modal">Готово</button></div></div>`);
      document.getElementById('conferenceInviteLink')?.select();
    }
  }

  function createConference() {
    stopRoomMedia();
    activeConferenceId = `conference-${crypto.randomUUID()}`;
    state._activeLesson = null;
    meetingStartedAt = 0;
    setConferenceUrl(activeConferenceId);
    renderRoom();
    copyConferenceLink();
  }

  async function joinLiveKit(data) {
    if (!window.LivekitClient?.Room) { toast('Не загрузился клиент LiveKit', 'Обновите страницу и попробуйте ещё раз.'); return; }
    const lesson = activeConferenceId ? null : (state._activeLesson || nextLesson());
    const account = currentAccount();
    const roomName = activeConferenceId || lesson?.id || 'tutdesk-open-room';
    const identity = `participant-${crypto.randomUUID()}`;
    let tokenResponse;
    try {
      tokenResponse = await fetch('/api/livekit/token', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Tutdesk-Room-Code': String(data.roomCode || '') },
        body: JSON.stringify({ room: roomName, identity, name: account?.name || 'Участник' }),
      });
    } catch {
      toast('Не удалось связаться с сервером звонков', 'Проверьте, что последняя версия Worker опубликована.'); return;
    }
    let credentials;
    try { credentials = await tokenResponse.json(); } catch { credentials = {}; }
    if (!tokenResponse.ok) {
      const messages = {
        invalid_room_code: 'Проверьте код доступа у репетитора.',
        authentication_required: 'Войдите в Tutdesk или попросите организатора дать временный код.',
        livekit_not_configured: 'В Cloudflare ещё не настроены runtime-переменные LiveKit.',
        origin_not_allowed: 'Адрес сайта не разрешён для этого Worker.',
      };
      toast('Не удалось подключиться', messages[credentials.error] || 'Сервер не выдал доступ к комнате.'); return;
    }

    const { Room, RoomEvent, Track } = window.LivekitClient;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => attachRemoteTrack(track, participant, Track, publication));
    room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => detachRemoteTrack(track, participant));
    room.on(RoomEvent.ParticipantConnected, (participant) => updateRemoteParticipant(participant));
    room.on(RoomEvent.ParticipantDisconnected, (participant) => updateRemoteStatus(participant));
    room.on(RoomEvent.DataReceived, (payload) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)); if (message.type !== 'board' || !message.board?.id) return;
        const index = state.boards.findIndex((item) => item.id === message.board.id); if (index < 0) return;
        state.boards[index] = { ...state.boards[index], ...message.board, elements: Array.isArray(message.board.elements) ? message.board.elements : state.boards[index].elements };
        persist(); if (currentView === 'board' && state.currentBoardId === message.board.id) renderBoard();
      } catch { /* ignore unrelated LiveKit data */ }
    });
    room.on(RoomEvent.Disconnected, () => {
      if (liveKitRoom === room) {
        liveKitRoom = null;
        stopRoomMedia();
        navigate('overview');
        toast('Звонок завершён', 'Соединение с комнатой закрыто.');
      }
    });
    try {
      await room.connect(credentials.serverUrl, credentials.token);
      liveKitRoom = room;
      meetingStartedAt = Date.now();
      closeModal();
      renderRoom();
      updateRoomConnection(true);
      room.remoteParticipants.forEach(updateRemoteParticipant);
      toast('Вы подключились к звонку', activeConferenceId ? 'Другие участники могут присоединиться по ссылке конференции.' : `Комната занятия «${lesson?.title || 'Индивидуальное занятие'}».`);
    } catch (error) {
      room.disconnect();
      clearRemoteParticipants();
      toast('Не удалось подключиться к LiveKit', error.message || 'Проверьте адрес проекта и настройки ключей.');
    }
  }

  function updateRoomConnection(connected) {
    const status = document.getElementById('roomConnectionStatus');
    if (status) { status.textContent = connected ? 'НА СВЯЗИ' : 'НЕ ПОДКЛЮЧЕНО'; status.classList.toggle('is-connected', connected); }
    const callNav = document.getElementById('callNav');
    if (callNav) callNav.hidden = !connected;
  }

  function remoteTileForParticipant(participant) {
    const stage = document.querySelector('.video-stage');
    if (!stage) return null;
    const identity = String(participant.identity || '');
    let tile = Array.from(stage.querySelectorAll('.video-tile[data-participant-id]'))
      .find((item) => item.dataset.participantId === identity);
    if (tile) return tile;

    tile = document.getElementById('studentVideoTile');
    if (!tile || tile.dataset.participantId) {
      tile = document.createElement('article');
      tile.className = 'video-tile';
      tile.innerHTML = '<div class="video-avatar"></div><span class="video-name"></span><span class="video-cam-state"></span>';
      stage.insertBefore(tile, stage.querySelector('.room-controls'));
    }
    tile.dataset.participantId = identity;
    return tile;
  }

  function updateParticipantCount() {
    const target = document.querySelector('.room-aside .room-info > div');
    if (!target) return;
    const heading = target.querySelector('strong') || document.createElement('strong');
    heading.textContent = '\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438';
    const count = 1 + (liveKitRoom?.remoteParticipants.size || 0);
    target.replaceChildren(heading, document.createTextNode(`\u0412\u0441\u0435\u0433\u043e \u0432 \u043a\u043e\u043c\u043d\u0430\u0442\u0435: ${count}`));
  }

  function updateRemoteParticipant(participant) {
    const tile = remoteTileForParticipant(participant);
    if (!tile) return;
    const participantName = participant.name || participant.identity || '\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a';
    const avatar = tile.querySelector('.video-avatar');
    const name = tile.querySelector('.video-name');
    const stateLabel = tile.querySelector('.video-cam-state');
    if (avatar && !tile.querySelector('.livekit-remote-video')) {
      avatar.textContent = initials(participantName);
      avatar.hidden = false;
    }
    if (name) name.textContent = participantName;
    if (stateLabel && !tile.querySelector('.livekit-remote-video')) {
      stateLabel.innerHTML = `${useIcon('cam-off')} \u041a\u0430\u043c\u0435\u0440\u0430 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u0430`;
    }
    updateParticipantCount();
  }

  function resetRemoteParticipantTile(tile) {
    if (!tile) return;
    tile.querySelectorAll('.livekit-remote-video,.livekit-remote-audio').forEach((element) => element.remove());
    tile.removeAttribute('data-participant-id');
    tile.id = 'studentVideoTile';
    const avatar = tile.querySelector('.video-avatar');
    if (avatar) { avatar.textContent = '?'; avatar.hidden = false; }
    const name = tile.querySelector('.video-name');
    if (name) name.textContent = '\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a';
    const stateLabel = tile.querySelector('.video-cam-state');
    if (stateLabel) stateLabel.innerHTML = `${useIcon('cam-off')} \u041e\u0436\u0438\u0434\u0430\u0435\u0442 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f`;
  }

  function clearRemoteParticipants() {
    const stage = document.querySelector('.video-stage');
    document.querySelectorAll('.livekit-remote-audio').forEach((element) => element.remove());
    if (!stage) return;
    const tiles = Array.from(stage.querySelectorAll('.video-tile[data-participant-id]'));
    if (!tiles.length) return;
    const placeholder = document.getElementById('studentVideoTile') || tiles[0];
    tiles.filter((tile) => tile !== placeholder).forEach((tile) => tile.remove());
    resetRemoteParticipantTile(placeholder);
    updateParticipantCount();
  }

  function updateRemoteStatus(participant) {
    const identity = String(participant?.identity || '');
    const tile = Array.from(document.querySelectorAll('.video-tile[data-participant-id]'))
      .find((item) => item.dataset.participantId === identity);
    document.querySelectorAll('.livekit-remote-audio').forEach((element) => {
      if (element.dataset.participantId === identity) element.remove();
    });
    if (!tile) { updateParticipantCount(); return; }
    const remainingParticipants = liveKitRoom?.remoteParticipants.size || 0;
    if (remainingParticipants === 0) resetRemoteParticipantTile(tile);
    else tile.remove();
    updateParticipantCount();
  }

  function attachRemoteTrack(track, participant, Track, publication) {
    updateRemoteParticipant(participant);
    const tile = remoteTileForParticipant(participant);
    if (track.kind === Track.Kind.Video) {
      if (!tile) return;
      const avatar = tile.querySelector('.video-avatar');
      if (avatar) avatar.hidden = true;
      const element = track.attach();
      element.classList.add('livekit-remote-video'); element.autoplay = true; element.playsInline = true;
      element.dataset.participantId = String(participant.identity || '');
      tile.appendChild(element);
      const stateLabel = tile.querySelector('.video-cam-state');
      const sharing = String(publication?.source || '').toLowerCase().includes('screen');
      if (stateLabel) stateLabel.innerHTML = sharing ? `${useIcon('monitor')} Показывает экран` : `${useIcon('cam')} \u041a\u0430\u043c\u0435\u0440\u0430 \u0432\u043a\u043b\u044e\u0447\u0435\u043d\u0430`;
    } else if (track.kind === Track.Kind.Audio) {
      const element = track.attach();
      element.classList.add('livekit-remote-audio'); element.autoplay = true;
      element.dataset.participantId = String(participant.identity || '');
      document.body.appendChild(element);
    }
  }

  function detachRemoteTrack(track, participant) {
    track.detach().forEach((element) => element.remove());
    if (track.kind === 'video') {
      const identity = String(participant?.identity || '');
      const tile = Array.from(document.querySelectorAll('.video-tile[data-participant-id]'))
        .find((item) => item.dataset.participantId === identity);
      const avatar = tile?.querySelector('.video-avatar');
      if (avatar) avatar.hidden = false;
      const stateLabel = tile?.querySelector('.video-cam-state');
      if (stateLabel) stateLabel.innerHTML = `${useIcon('cam-off')} \u041a\u0430\u043c\u0435\u0440\u0430 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u0430`;
    }
  }

  function resetRoomMediaButtons() {
    document.querySelector('[data-action="toggle-camera"]')?.classList.add('is-off');
    document.querySelector('[data-action="toggle-mic"]')?.classList.add('is-off');
    document.querySelector('[data-action="share-screen"]')?.classList.remove('is-on');
    const video = document.getElementById('localVideo'); if (video) { video.srcObject = null; video.hidden = true; }
    const avatar = document.querySelector('#tutorVideoTile .video-avatar'); if (avatar) avatar.hidden = false;
    const stateLabel = document.getElementById('tutorVideoState'); if (stateLabel) stateLabel.innerHTML = `${useIcon('cam-off')} Камера выключена`;
  }

  function render() {
    const callNav = document.getElementById('callNav');
    if (callNav) callNav.hidden = !meetingStartedAt;
    if (isStudentAccount() && ['students', 'lessons', 'subscription'].includes(currentView)) currentView = 'overview';
    const label = pageNames[currentView] || pageNames.overview;
    const account = currentAccount(); const studentMode = account?.role === 'student'; const plan = currentPlan();
    document.getElementById('currentPageLabel').textContent = label;
    document.getElementById('mainNav').hidden = !account;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === currentView));
    document.querySelectorAll('[data-nav-tutor]').forEach((item) => { item.hidden = studentMode; });
    document.getElementById('sidebarPlan').hidden = studentMode || !account;
    document.querySelector('.workspace-label').textContent = studentMode ? 'ЛИЧНЫЙ КАБИНЕТ' : 'РАБОЧЕЕ ПРОСТРАНСТВО';
    document.getElementById('studentCount').textContent = plan === 'extreme' ? String(currentTutorStudents().length) : 'EXT';
    document.getElementById('taskCount').textContent = studentMode ? String(tasksForCurrentStudent().filter((task) => task.status !== 'complete').length) : plan === 'extreme' ? String(tasksForCurrentTutor().filter((task) => task.status !== 'complete').length) : 'EXT';
    document.getElementById('lessonTier').hidden = true;
    document.getElementById('sidePlanName').textContent = plan === 'extreme' ? 'Продвинутый' : plan === 'free' ? 'Бесплатный' : 'Базовый';
    document.getElementById('sidePlanDescription').textContent = plan === 'extreme' ? 'Все инструменты для работы' : plan === 'free' ? 'Только звонки' : 'Созвоны, расписание и доска';
    document.getElementById('profileName').textContent = account?.name || 'Гость';
    document.getElementById('profileRole').textContent = account ? (studentMode ? 'Ученик' : 'Репетитор') : 'Войти в кабинет';
    document.getElementById('profileInitials').textContent = initials(account?.name || '?');
    document.getElementById('topAvatar').textContent = initials(account?.name || '?');
    document.getElementById('topbarSpaceLabel').textContent = account ? (studentMode ? 'Личный кабинет ученика' : 'Пространство репетитора') : 'Личный кабинет';
    document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date());
    document.getElementById('footerYear').textContent = new Date().getFullYear();
    if (!account && currentView !== 'room') {
      pageContent.innerHTML = `<section class="auth-welcome"><span class="heading-kicker">TUTDESK</span><h1>Учёба и занятия — в одном пространстве.</h1><p>Создайте личный кабинет репетитора или ученика, чтобы вести занятия, готовить задания и работать на общей доске.</p><div class="auth-welcome-actions"><button class="button button-primary" data-action="account-register">Создать аккаунт</button><button class="button button-light" data-action="account-login">Войти</button></div></section>`;
      showDailyQuote();
      sidebar.classList.remove('is-open');
      return;
    }
    const existingRoom = document.querySelector('.room-page');
    if (currentView === 'room' && existingRoom) {
      if (!pageContent.contains(existingRoom)) pageContent.replaceChildren(existingRoom);
      callDock.hidden = true;
    } else ({ overview: renderOverview, students: renderStudents, lessons: renderLessons, messages: renderMessages, board: renderBoard, videos: renderVideos, tasks: renderTasks, homework: renderHomework, notion: renderNotion, subscription: renderSubscription, room: renderRoom }[currentView] || renderOverview)();
    if (currentView === 'overview') showDailyQuote();
    sidebar.classList.remove('is-open');
  }
  function navigate(view) {
    if (!pageNames[view]) return;
    if (!currentAccount() && view !== 'room' && view !== 'overview') { openForm('account-login'); return; }
    if (currentView === 'room' && view !== 'room' && meetingStartedAt) {
      const room = pageContent.querySelector('.room-page');
      if (room) { callDock.append(room); callDock.hidden = false; }
    }
    if (view !== 'messages') stopCollaborationPolling();
    currentView = view;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showModal(title, subtitle, body) {
    modalCard.innerHTML = `<div class="modal-head"><div><h2 id="modalTitle">${title}</h2><p>${subtitle}</p></div><button class="modal-close" data-action="close-modal" aria-label="Закрыть">${useIcon('close')}</button></div>${body}`;
    modalBackdrop.hidden = false;
    const first = modalCard.querySelector('input,select,textarea');
    if (first) window.setTimeout(() => first.focus(), 40);
  }
  function closeModal() { modalBackdrop.hidden = true; modalCard.innerHTML = ''; }
  function openForm(type, id) {
    if (type === 'account-login') {
      if (authenticatedAccountId) {
        const account = currentAccount();
        const profile = account?.role === 'student' ? getStudent(account.studentId) : null;
        showModal('Ваш профиль Tutdesk', 'Имя и общие данные профиля будут обновлены в кабинете.', `<form class="form-grid" data-form="profile-edit"><div class="form-field"><label for="profileNameEdit">Имя и фамилия</label><input class="form-control" id="profileNameEdit" name="name" value="${escapeHTML(account?.name || '')}" required maxlength="80" /></div>${account?.role === 'student' ? `<div class="form-field"><label for="profileGradeEdit">Класс</label><select class="form-control" id="profileGradeEdit" name="grade"><option value="">Выберите класс</option>${Array.from({ length: 11 }, (_, index) => `<option value="${index + 1} класс" ${profile?.grade === `${index + 1} класс` ? 'selected' : ''}>${index + 1} класс</option>`).join('')}<option value="Студент" ${profile?.grade === 'Студент' ? 'selected' : ''}>Студент</option><option value="Другое" ${profile?.grade === 'Другое' ? 'selected' : ''}>Другое</option></select></div>` : ''}<div class="profile-details"><span>Текущий email: ${escapeHTML(account?.email || '')}</span></div><div class="form-actions"><button class="button button-primary" type="submit">Сохранить профиль</button></div></form><form class="form-grid email-change-form" data-form="email-change"><div class="form-field"><label for="profileEmailEdit">Новый email</label><input class="form-control" id="profileEmailEdit" name="email" type="email" autocomplete="email" placeholder="name@example.com" required /></div><span class="form-hint">Отправим ссылку на новый адрес. Он изменится после подтверждения.</span><button class="button button-light" type="submit">Подтвердить новый email</button><button type="button" class="button button-danger" data-action="auth-logout">Выйти из аккаунта</button></form>`);
        return;
      }
      showModal('Войти в Tutdesk', 'Введите email и пароль от личного кабинета.', `<form class="form-grid" data-form="account-login"><div class="form-field"><label for="accountEmail">Электронная почта</label><input class="form-control" id="accountEmail" name="email" type="email" autocomplete="email" required /></div><div class="form-field"><label for="accountPassword">Пароль</label><input class="form-control" id="accountPassword" name="password" type="password" autocomplete="current-password" required /></div><div class="form-actions"><button type="button" class="button button-light" data-action="account-register">Создать аккаунт</button><button class="button button-primary" type="submit">Войти</button></div><button type="button" class="text-link" data-action="account-resend">Письмо подтверждения не пришло?</button><button type="button" class="text-link" data-action="password-forgot">Забыли пароль?</button></form>`);
      return;
    }
    if (type === 'account-role') {
      openAccountRoleForm(currentAccount());
      return;
    }
    if (type === 'account-register') {
      showModal('Создать аккаунт Tutdesk', 'После регистрации отправим ссылку для подтверждения email.', `<form class="form-grid" data-form="account-register"><div class="form-field"><label for="accountName">Имя</label><input class="form-control" id="accountName" name="name" autocomplete="name" minlength="2" maxlength="80" placeholder="Имя и фамилия" required /></div><div class="form-field"><label for="accountEmail">Электронная почта</label><input class="form-control" id="accountEmail" name="email" type="email" autocomplete="email" placeholder="name@example.com" required /></div><div class="form-field"><label for="accountRole">Я регистрируюсь как</label><select class="form-control" id="accountRole" name="role" required><option value="tutor">Репетитор</option><option value="student">Ученик</option></select></div><div class="form-field" id="registerGradeWrap" hidden><label for="registerGrade">Класс</label><select class="form-control" id="registerGrade" name="grade"><option value="">Выберите класс</option>${Array.from({ length: 11 }, (_, index) => `<option value="${index + 1} класс">${index + 1} класс</option>`).join('')}<option value="Студент">Студент</option><option value="Другое">Другое</option></select></div><div class="form-field"><label for="accountPassword">Пароль</label><div class="password-input-wrap"><input class="form-control" id="accountPassword" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /><button class="password-visibility" type="button" data-action="toggle-password" data-target="accountPassword" aria-label="Показать пароль">Показать</button></div><span class="form-hint">Не менее 8 символов.</span></div><div class="form-field"><label for="accountPasswordConfirm">Повторите пароль</label><div class="password-input-wrap"><input class="form-control" id="accountPasswordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /><button class="password-visibility" type="button" data-action="toggle-password" data-target="accountPasswordConfirm" aria-label="Показать пароль">Показать</button></div></div><div class="form-actions"><button type="button" class="button button-light" data-action="account-login">У меня уже есть аккаунт</button><button class="button button-primary" type="submit">Зарегистрироваться</button></div></form>`);
      const role = document.getElementById('accountRole'); const gradeWrap = document.getElementById('registerGradeWrap'); const grade = document.getElementById('registerGrade');
      role?.addEventListener('change', () => { if (gradeWrap) gradeWrap.hidden = role.value !== 'student'; if (grade) grade.required = role.value === 'student'; });
      return;
    }
    if (type === 'account-resend') {
      showModal('Подтвердить email', 'Укажите адрес, на который отправляли письмо.', `<form class="form-grid" data-form="account-resend"><div class="form-field"><label for="resendEmail">Электронная почта</label><input class="form-control" id="resendEmail" name="email" type="email" autocomplete="email" value="${escapeHTML(id || '')}" required /></div><div class="form-actions"><button type="button" class="button button-light" data-action="account-login">Назад ко входу</button><button class="button button-primary" type="submit">Отправить письмо</button></div></form>`);
      return;
    }
    if (type === 'password-forgot') {
      showModal('Сбросить пароль', 'Отправим ссылку, если аккаунт зарегистрирован с этим email.', `<form class="form-grid" data-form="password-forgot"><div class="form-field"><label for="resetEmail">Электронная почта</label><input class="form-control" id="resetEmail" name="email" type="email" autocomplete="email" value="${escapeHTML(id || '')}" required /></div><div class="form-actions"><button type="button" class="button button-light" data-action="account-login">Назад ко входу</button><button class="button button-primary" type="submit">Отправить ссылку</button></div></form>`);
      return;
    }
    if (type === 'password-reset') {
      showModal('Новый пароль', 'Задайте новый пароль. Не менее 8 символов.', `<form class="form-grid" data-form="password-reset"><input type="hidden" name="token" value="${escapeHTML(id || '')}" /><div class="form-field"><label for="newPassword">Новый пароль</label><input class="form-control" id="newPassword" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /><span class="form-hint">Не менее 8 символов.</span></div><div class="form-field"><label for="newPasswordConfirm">Повторите пароль</label><input class="form-control" id="newPasswordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required /></div><div class="form-actions"><button type="button" class="button button-light" data-action="account-login">Отмена</button><button class="button button-primary" type="submit">Сохранить пароль</button></div></form>`);
      return;
    }
    if (type === 'student') {
      showModal('Добавить ученика', 'Введите email уже зарегистрированного и подтверждённого ученического аккаунта.', `<form class="form-grid" data-form="student"><div class="form-field"><label for="studentEmail">Email ученика</label><input class="form-control" id="studentEmail" name="email" type="email" placeholder="student@example.com" required /></div><div class="account-note">Ученик появится в обоих кабинетах. Попросите его сначала зарегистрироваться и подтвердить почту.</div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Связать аккаунты</button></div></form>`);
      return;
    }
    if (type === 'lesson' || type === 'lesson-edit') {
      const editing = type === 'lesson-edit'; const lesson = editing ? state.lessons.find((item) => item.id === id) : null;
      const options = currentTutorStudents().map((student) => `<option value="${escapeHTML(student.id)}">${escapeHTML(student.name)} · ${escapeHTML(student.subject)}</option>`).join('');
      if (!options) { toast('Сначала добавьте ученика', 'После этого можно будет запланировать занятие.'); return; }
      const student = lesson ? getStudent(lesson.studentId) : currentTutorStudents()[0];
      const selectedOptions = currentTutorStudents().map((item) => `<option value="${escapeHTML(item.id)}" ${(lesson?.studentId || student?.id) === item.id ? 'selected' : ''}>${escapeHTML(item.name)} · ${escapeHTML(item.subject)}</option>`).join('');
      showModal(editing ? 'Изменить занятие' : 'Запланировать занятие', 'Дата и время указаны в часовом поясе преподавателя. Ученик увидит их в своём часовом поясе.', `<form class="form-grid" data-form="${editing ? 'lesson-edit' : 'lesson'}" ${editing ? `data-id="${escapeHTML(lesson.id)}"` : ''}><div class="form-field"><label for="lessonTitle">Тема занятия</label><input class="form-control" id="lessonTitle" name="title" value="${escapeHTML(lesson?.title || '')}" placeholder="Например, квадратные уравнения" required /></div><div class="form-field"><label for="lessonStudent">Ученик</label><select class="form-control" id="lessonStudent" name="studentId" required ${editing ? 'disabled' : ''}>${selectedOptions}</select>${editing ? `<input type="hidden" name="studentId" value="${escapeHTML(lesson.studentId)}"/><span class="form-hint">Ученик и связанные данные занятия сохранятся.</span>` : ''}</div><div class="form-grid form-grid--two"><div class="form-field"><label for="lessonDate">Дата</label><input class="form-control" id="lessonDate" name="date" type="date" value="${escapeHTML(lesson?.date || addDaysISO(1))}" required /></div><div class="form-field"><label for="lessonTime">Время у преподавателя (${escapeHTML(lesson?.tutorTimeZone || browserTimeZone())})</label><input class="form-control" id="lessonTime" name="time" type="time" value="${escapeHTML(lesson?.time || '16:00')}" step="900" required /></div></div><div class="account-note" id="lessonTimePreview">Время в кабинете ученика пересчитается автоматически.</div><div class="form-field"><label for="lessonDuration">Длительность</label><select class="form-control" id="lessonDuration" name="duration"><option value="45" ${lesson?.duration === 45 ? 'selected' : ''}>45 минут</option><option value="60" ${!lesson || lesson.duration === 60 ? 'selected' : ''}>60 минут</option><option value="90" ${lesson?.duration === 90 ? 'selected' : ''}>90 минут</option></select></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Сохранить занятие</button></div></form>`);
      const updateLessonPreview = () => {
        const selected = getStudent(document.getElementById('lessonStudent')?.value);
        const preview = document.getElementById('lessonTimePreview');
        const dateInput = document.getElementById('lessonDate'); const timeInput = document.getElementById('lessonTime');
        if (!preview || !selected || !dateInput?.value || !timeInput?.value) return;
        const instant = localDateTimeInZone(dateInput.value, timeInput.value, lesson?.tutorTimeZone || browserTimeZone());
        const learnerZone = selected.timeZone || browserTimeZone();
        preview.textContent = `Ученик (${zoneLabel(learnerZone)}): ${new Intl.DateTimeFormat('ru-RU', { timeZone: learnerZone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(instant)}.`;
      };
      ['lessonStudent', 'lessonDate', 'lessonTime'].forEach((fieldId) => document.getElementById(fieldId)?.addEventListener('change', updateLessonPreview));
      updateLessonPreview();
      return;
    }
    if (type === 'task' || type === 'homework') {
      const options = currentTutorStudents().map((student) => `<option value="${escapeHTML(student.id)}">${escapeHTML(student.name)}</option>`).join('');
      const groupOptions = collaboration.groups.map((group) => `<option value="group:${escapeHTML(group.id)}">Группа · ${escapeHTML(group.name)} (${group.studentIds.length})</option>`).join('');
      const defaultKind = type === 'homework' ? 'homework' : 'personal';
      showModal('Новая задача', 'Добавьте личное дело или назначьте домашнюю работу.', `<form class="form-grid" data-form="task"><div class="form-field"><label for="taskKind">Тип задачи</label><select class="form-control" id="taskKind" name="kind"><option value="homework" ${defaultKind === 'homework' ? 'selected' : ''}>Домашнее задание</option><option value="personal" ${defaultKind === 'personal' ? 'selected' : ''}>Моя личная задача</option></select></div><div class="form-field"><label for="taskTitle">Название</label><input class="form-control" id="taskTitle" name="title" placeholder="Например, подготовить примеры к уроку" required /></div><div class="form-field"><label for="taskDescription">Подробности</label><textarea class="form-textarea" id="taskDescription" name="description" placeholder="Что нужно сделать, страницы учебника или ссылка"></textarea></div><div class="form-field task-student-field" id="taskStudentWrap" ${defaultKind === 'personal' ? 'hidden' : ''}><label for="taskStudent">Назначить ученику или группе</label><select class="form-control" id="taskStudent" name="studentId" ${defaultKind === 'personal' ? '' : 'required'}>${groupOptions}${options || '<option value="">Сначала добавьте ученика</option>'}</select></div><div class="form-grid form-grid--two"><div class="form-field task-subject-field" id="taskSubjectWrap" ${defaultKind === 'personal' ? 'hidden' : ''}><label for="taskSubject">Предмет</label><input class="form-control" id="taskSubject" name="subject" value="${escapeHTML(currentTutorStudents()[0]?.subject || '')}" ${defaultKind === 'personal' ? '' : 'required'} /></div><div class="form-field"><label for="taskDue">Срок <span class="optional-label">необязательно</span></label><input class="form-control" id="taskDue" name="due" type="date" value="${addDaysISO(3)}" /></div></div><div class="form-field task-file-field" id="taskFileWrap" ${defaultKind === 'personal' ? 'hidden' : ''}><label for="taskFiles">Файлы <span class="optional-label">до 10 МБ каждый</span></label><input class="form-control file-control" id="taskFiles" name="files" type="file" multiple /><span class="form-hint">Можно прикрепить документы, изображения, архивы и другие учебные материалы.</span><span class="upload-state" id="taskUploadState"></span></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Создать задачу</button></div></form>`);
      if (type === 'task') { document.querySelector('#taskKind option[value="homework"]')?.remove(); document.getElementById('taskKind').value = 'personal'; document.getElementById('taskStudentWrap').hidden = true; document.getElementById('taskSubjectWrap').hidden = true; document.getElementById('taskFileWrap').hidden = true; }
      if (collaboration.files.length) document.getElementById('taskFileWrap')?.insertAdjacentHTML('afterbegin', `<label for="taskLibraryFiles">Из хранилища</label><select class="form-control" id="taskLibraryFiles" name="libraryFileIds" multiple>${collaboration.files.map((file) => `<option value="${escapeHTML(file.id)}">${escapeHTML(file.name)}</option>`).join('')}</select>`);
      const taskKind = document.getElementById('taskKind');
      const studentSelect = document.getElementById('taskStudent');
      taskKind?.addEventListener('change', () => {
        const isHomework = taskKind.value === 'homework';
        const studentWrap = document.getElementById('taskStudentWrap'); const subjectWrap = document.getElementById('taskSubjectWrap'); const fileWrap = document.getElementById('taskFileWrap'); const subject = document.getElementById('taskSubject');
        if (studentWrap) studentWrap.hidden = !isHomework;
        if (subjectWrap) subjectWrap.hidden = !isHomework;
        if (fileWrap) fileWrap.hidden = !isHomework;
        if (studentSelect) studentSelect.required = isHomework;
        if (subject) subject.required = isHomework;
      });
      studentSelect?.addEventListener('change', () => { const student = getStudent(studentSelect.value); const subject = document.getElementById('taskSubject'); if (student && subject) subject.value = student.subject; });
      return;
    }
    if (type === 'copy-task') {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) return;
      const options = currentTutorStudents().filter((student) => student.id !== task.studentId).map((student) => `<option value="${escapeHTML(student.id)}">${escapeHTML(student.name)} · ${escapeHTML(student.subject)}</option>`).join('');
      if (!options) { toast('Добавьте ещё одного ученика', 'Копирование создаёт отдельное задание для другого ученика.'); return; }
      showModal('Копировать задание', 'Создадим отдельную копию с собственным сроком и статусом.', `<div class="copy-confirm">${useIcon('copy')}<span>Копия задания «${escapeHTML(task.title)}»</span></div><form class="form-grid" data-form="copy-task" data-id="${escapeHTML(task.id)}"><div class="form-field"><label for="copyStudent">Кому назначить</label><select class="form-control" id="copyStudent" name="studentId" required>${options}</select></div><div class="form-field"><label for="copyDue">Срок выполнения</label><input class="form-control" id="copyDue" name="due" type="date" value="${addDaysISO(3)}" required /></div><p class="form-hint">Исходное задание и ответы других учеников останутся без изменений.</p><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Создать копию</button></div></form>`);
      return;
    }
    if (type === 'board-new') {
      showModal('Новая доска', 'Создайте доску для своих материалов или занятия.', `<form class="form-grid" data-form="board-new"><div class="form-field"><label for="boardName">Название доски</label><input class="form-control" id="boardName" name="name" placeholder="Например, Подготовка к контрольной" required /></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button type="submit" class="button button-primary">Создать доску</button></div></form>`);
      return;
    }
    if (type === 'board-attach') {
      const options = currentTutorLessons().filter((lesson) => lesson.boardId !== currentBoard()?.id).map((lesson) => `<option value="${escapeHTML(lesson.id)}">${escapeHTML(dateLabel(lesson.date))} · ${escapeHTML(lesson.title)}</option>`).join('');
      if (!options) { toast('Нет занятий для привязки', currentTutorLessons().length ? 'Все запланированные занятия уже привязаны к этой доске.' : 'Сначала запланируйте занятие в разделе «Занятия».'); return; }
      showModal('Закрепить доску', 'Эту же доску можно открыть на нескольких занятиях.', `<form class="form-grid" data-form="board-attach"><div class="form-field"><label for="boardLesson">Занятие</label><select class="form-control" id="boardLesson" name="lessonId" required>${options}</select></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button type="submit" class="button button-primary">Привязать доску</button></div></form>`);
      return;
    }
    if (type === 'board-text' || type === 'board-sticky' || type === 'board-edit') {
      const edit = type === 'board-edit'; const element = edit ? currentBoard()?.elements.find((item) => item.id === id) : null;
      const sticky = type === 'board-sticky' || element?.type === 'sticky';
      showModal(edit ? 'Изменить элемент' : sticky ? 'Новый стикер' : 'Добавить текст', sticky ? 'Добавьте заметку прямо на доску.' : 'Текст появится в точке, где вы щёлкнули по доске.', `<form class="form-grid" data-form="${edit ? 'board-edit' : sticky ? 'board-sticky' : 'board-text'}" ${edit ? `data-id="${escapeHTML(id)}"` : ''}><div class="form-field"><label for="boardElementText">Текст</label><textarea class="form-textarea" id="boardElementText" name="text" placeholder="${sticky ? 'Напишите заметку…' : 'Введите текст…'}" required>${escapeHTML(element?.text || '')}</textarea></div>${sticky ? `<div class="form-field"><label for="stickyColor">Цвет стикера</label><select class="form-control" id="stickyColor" name="fill"><option value="#fff1a8" ${element?.fill === '#fff1a8' ? 'selected' : ''}>Жёлтый</option><option value="#dff2cf" ${element?.fill === '#dff2cf' ? 'selected' : ''}>Зелёный</option><option value="#dfeeff" ${element?.fill === '#dfeeff' ? 'selected' : ''}>Голубой</option><option value="#f7dff0" ${element?.fill === '#f7dff0' ? 'selected' : ''}>Розовый</option></select></div>` : ''}<div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button type="submit" class="button button-primary">${edit ? 'Сохранить' : 'Добавить на доску'}</button></div></form>`);
      return;
    }
  }

  async function submitForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const id = `${form.dataset.form}-${Date.now()}`;
    if (form.dataset.form === 'auth-role') {
      completeAccountSetup(form);
    } else if (form.dataset.form === 'livekit-join') {
      joinLiveKit(data);
    } else if (form.dataset.form === 'homework-review') {
      const task = state.tasks.find((item) => item.id === form.dataset.id);
      if (!task || task.kind === 'personal') return;
      task.reviewStatus = ['unchecked', 'errors', 'correct'].includes(data.reviewStatus) ? data.reviewStatus : 'unchecked';
      task.reviewComment = String(data.reviewComment || '').trim().slice(0, 2000);
      if (task.reviewStatus === 'correct') task.status = 'complete';
      persist(); closeModal(); renderHomework(); toast('Проверка сохранена');
    } else if (form.dataset.form === 'group') {
      const studentIds = new FormData(form).getAll('studentId').map(String);
      if (!studentIds.length) { toast('Выберите хотя бы одного ученика'); return; }
      const groupId = form.dataset.id; const response = await fetch(groupId ? `/api/groups/${encodeURIComponent(groupId)}` : '/api/groups', { method: groupId ? 'PUT' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.name, studentIds }) });
      const result = await response.json().catch(() => ({})); if (!response.ok || !result.group) { toast('Не удалось сохранить группу'); return; }
      collaboration.groups = groupId ? collaboration.groups.map((group) => group.id === groupId ? result.group : group) : [result.group, ...collaboration.groups]; closeModal(); activeConversation = `group:${result.group.id}`; renderMessages(); toast(groupId ? 'Группа обновлена' : 'Группа создана');
    } else if (form.dataset.form === 'message') {
      if (!activeConversation) return; const [kind, targetId] = activeConversation.split(':'); const formData = new FormData(form); const attachmentIds = formData.getAll('attachmentIds').map(String);
      const submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
      try {
        for (const file of formData.getAll('newFiles').filter((item) => item instanceof File && item.size)) {
          const upload = new FormData(); upload.append('file', file); const response = await fetch('/api/files', { method: 'POST', credentials: 'same-origin', body: upload }); const result = await response.json().catch(() => ({})); if (!response.ok || !result.file) throw new Error(result.message || 'upload_failed'); collaboration.files.unshift(result.file); attachmentIds.push(result.file.id);
        }
        const payload = { body: String(data.body || '').trim(), attachmentIds, ...(kind === 'group' ? { groupId: targetId } : { recipientId: targetId }) };
        if (!payload.body && !attachmentIds.length) { if (submit) submit.disabled = false; return; }
        const response = await fetch('/api/messages', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const result = await response.json().catch(() => ({})); if (!response.ok || !result.message) throw new Error(); collaboration.messages.push(result.message); renderMessages();
      }
      catch { if (submit) submit.disabled = false; toast('Не удалось отправить сообщение'); }
    } else if (form.dataset.form === 'account-login') {
      try {
        const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.email, password: data.password }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (result.error === 'email_not_verified') {
            showModal('Подтвердите email', 'Сначала подтвердите адрес по ссылке из письма.', `<div class="form-actions"><button type="button" class="button button-light" data-action="account-login">Назад ко входу</button><button type="button" class="button button-primary" data-action="account-resend" data-id="${escapeHTML(data.email)}">Отправить письмо ещё раз</button></div>`);
            return;
          }
          toast(result.message || 'Не удалось войти', result.error === 'auth_not_configured' ? 'Сервис аккаунтов ещё не настроен.' : 'Проверьте email и пароль.');
          return;
        }
        await activateAccount(result.account);
        toast('Вы вошли в Tutdesk', result.account.role === 'student' ? 'Личный кабинет ученика' : 'Личный кабинет репетитора');
      } catch { toast('Сервис входа недоступен', 'Попробуйте ещё раз позже.'); }
    } else if (form.dataset.form === 'account-register') {
      if (data.password !== data.passwordConfirm) { toast('Пароли не совпадают'); return; }
      try {
        const response = await fetch('/api/auth/register', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.name, email: data.email, role: data.role, password: data.password, grade: data.grade }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const detail = response.status >= 500
            ? 'Проблема на стороне сервера. Изменять введённые данные не нужно.'
            : result.error === 'origin_not_allowed'
              ? 'Откройте регистрацию с основного адреса сайта.'
              : 'Проверьте данные и попробуйте ещё раз.';
          toast(result.message || 'Не удалось создать аккаунт', detail);
          return;
        }
        if (data.role === 'student' && data.grade) sessionStorage.setItem('tutdesk-pending-grade', data.grade);
        const email = data.email.trim().toLowerCase();
        showModal('Проверьте почту', `Если для адреса ${escapeHTML(email)} можно подтвердить аккаунт, письмо уже отправлено. Откройте ссылку в письме, чтобы завершить регистрацию.`, `<div class="form-actions"><button type="button" class="button button-light" data-action="account-login">Перейти ко входу</button><button type="button" class="button button-primary" data-action="account-resend" data-id="${escapeHTML(email)}">Отправить письмо ещё раз</button></div>`);
      } catch { toast('Сервис регистрации недоступен', 'Попробуйте ещё раз позже.'); }
    } else if (form.dataset.form === 'account-resend') {
      try {
        const response = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.email }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { toast(result.message || 'Не удалось отправить письмо'); return; }
        closeModal(); toast('Если аккаунт ожидает подтверждения, письмо отправлено', 'Проверьте входящие и папку «Спам».');
      } catch { toast('Не удалось связаться с сервисом регистрации'); }
    } else if (form.dataset.form === 'password-forgot') {
      try {
        const response = await fetch('/api/auth/password-reset/request', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.email }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { toast(result.message || 'Не удалось отправить ссылку', result.error === 'email_not_configured' ? 'Почтовый сервис ещё не настроен.' : 'Попробуйте позже.'); return; }
        closeModal(); toast('Если аккаунт найден, ссылка уже отправлена', 'Проверьте почту и папку «Спам».');
      } catch { toast('Не удалось связаться с сервисом сброса пароля'); }
    } else if (form.dataset.form === 'password-reset') {
      if (data.password !== data.passwordConfirm) { toast('Пароли не совпадают'); return; }
      if (String(data.password || '').length < 8) { toast('Пароль слишком короткий', 'Не менее 8 символов.'); return; }
      try {
        const response = await fetch('/api/auth/password-reset/confirm', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: data.token, password: data.password }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { toast(result.message || 'Не удалось изменить пароль'); return; }
        authenticatedAccountId = null;
        accountDataReady = false;
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, sampleState());
        closeModal(); render(); openForm('account-login'); toast('Пароль изменён', 'Войдите в Tutdesk с новым паролем.');
      } catch { toast('Не удалось связаться с сервисом сброса пароля'); }
    } else if (form.dataset.form === 'student') {
      const email = (data.email || '').trim().toLowerCase();
      try {
        const response = await fetch('/api/tutor-students', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const messages = {
            student_not_found: ['Аккаунт ученика не найден', 'Проверьте email: ученик должен подтвердить почту и выбрать роль «Ученик».'],
            invalid_email: ['Неверный email', 'Проверьте адрес ученика и повторите попытку.'],
            not_authenticated: ['Сеанс завершён', 'Войдите в аккаунт ещё раз.'],
            tutor_account_required: ['Нужен аккаунт репетитора', 'Войти в него можно через кнопку профиля.'],
          };
          const [title, detail] = messages[result.error] || ['Не удалось связать аккаунты', result.message || `Сервис вернул ошибку ${response.status}. Попробуйте ещё раз позже.`];
          toast(title, detail);
          return;
        }
        closeModal(); refreshLinkedAccounts(); toast('Аккаунты связаны', 'Репетитор и ученик увидят друг друга в личных кабинетах.');
      } catch { toast('Не удалось связаться с базой аккаунтов', 'Повторите попытку позже.'); }
    } else if (form.dataset.form === 'lesson') {
      const student = getStudent(data.studentId);
      const startsAt = localDateTimeInZone(data.date, data.time, browserTimeZone());
      if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) { toast('Выберите время в будущем', 'Проверьте дату и время занятия.'); return; }
      if (student && !state.accounts.some((account) => account.id === student.id.slice('student-'.length))) state.accounts.push({ id: student.id.slice('student-'.length), role: 'student', name: student.name, email: student.email, studentId: student.id, timeZone: student.timeZone || browserTimeZone() });
      state.lessons.push({ id, tutorId: currentTutorId(), studentId: data.studentId, studentAccountId: student?.id.startsWith('student-') ? student.id.slice('student-'.length) : null, title: data.title.trim(), date: data.date, time: data.time, startsAt: startsAt.toISOString(), tutorTimeZone: browserTimeZone(), studentTimeZone: student?.timeZone || browserTimeZone(), duration: Number(data.duration) || 60, status: 'scheduled' });
      persist(); closeModal(); render(); toast('Занятие добавлено в расписание', `${dateLabel(data.date)} · ${data.time}`);
    } else if (form.dataset.form === 'lesson-edit') {
      const lesson = state.lessons.find((item) => item.id === form.dataset.id); if (!lesson) return;
      const startsAt = localDateTimeInZone(data.date, data.time, lesson.tutorTimeZone || browserTimeZone());
      if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) { toast('Выберите время в будущем', 'Проверьте дату и время занятия.'); return; }
      Object.assign(lesson, { title: data.title.trim(), date: data.date, time: data.time, startsAt: startsAt.toISOString(), duration: Number(data.duration) || lesson.duration || 60 });
      persist(); closeModal(); renderLessons(); toast('Занятие обновлено', `${dateLabel(data.date)} · ${data.time}`);
    } else if (form.dataset.form === 'task') {
      const personal = data.kind === 'personal';
      if (!personal && !data.studentId) { toast('Выберите ученика', 'Для домашнего задания нужен адресат.'); return; }
      let studentModelIds = personal ? [] : [data.studentId]; let groupId = null; let groupName = '';
      if (!personal && data.studentId.startsWith('group:')) {
        groupId = data.studentId.slice(6); const group = collaboration.groups.find((item) => item.id === groupId);
        if (!group) { toast('Группа не найдена'); return; }
        studentModelIds = group.studentIds.map((accountId) => `student-${accountId}`); groupName = group.name;
      }
      const libraryFileIds = personal ? [] : new FormData(form).getAll('libraryFileIds').map(String);
      const files = personal ? [] : [...(form.querySelector('#taskFiles')?.files || [])];
      if (files.some((file) => file.size > 10_000_000 || file.size < 1)) { toast('Файл не подходит', 'Размер каждого файла должен быть от 1 байта до 10 МБ.'); return; }
      const attachments = []; const uploadState = document.getElementById('taskUploadState'); const submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
      try {
        const recipientIds = studentModelIds.map(accountIdForStudent);
        for (const fileId of libraryFileIds) {
          const stored = collaboration.files.find((file) => file.id === fileId); if (!stored) throw new Error('Файл из хранилища не найден.');
          const grant = await fetch(`/api/files/${encodeURIComponent(fileId)}/grants`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentIds: recipientIds }) });
          if (!grant.ok) throw new Error('Не удалось открыть файл выбранным ученикам.');
          attachments.push(stored);
        }
        for (let index = 0; index < files.length; index += 1) {
          if (uploadState) uploadState.textContent = `Загружаем файл ${index + 1} из ${files.length}…`;
          const payload = new FormData(); payload.append('file', files[index]); payload.append('taskId', id);
          recipientIds.forEach((studentId) => payload.append('studentId', studentId));
          const response = await fetch('/api/homework-files', { method: 'POST', credentials: 'same-origin', body: payload }); const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.attachment) throw new Error(result.message || 'Не удалось загрузить файл.');
          attachments.push(result.attachment);
        }
      } catch (error) {
        await Promise.allSettled(attachments.map((attachment) => fetch(`/api/homework-files/${encodeURIComponent(attachment.id)}`, { method: 'DELETE', credentials: 'same-origin' })));
        if (submit) submit.disabled = false;
        if (uploadState) uploadState.textContent = '';
        toast('Не удалось прикрепить файл', error.message);
        return;
      }
      const baseTask = { kind: personal ? 'personal' : 'homework', tutorId: currentTutorId(), title: data.title.trim(), description: data.description.trim(), subject: personal ? 'Личное' : data.subject.trim(), due: data.due || '', status: 'todo', attachments, groupId, groupName };
      if (personal) state.tasks.push({ ...baseTask, id, studentId: null });
      else studentModelIds.forEach((studentId, index) => state.tasks.push({ ...baseTask, id: index ? `${id}-${index}` : id, studentId }));
      persist(); closeModal(); render(); toast(personal ? 'Личная задача добавлена' : groupId ? 'Домашнее задание назначено группе' : 'Домашнее задание назначено', personal ? 'Эту задачу видите только вы.' : groupId ? `${groupName} · ${studentModelIds.length} учеников` : studentName(data.studentId));
    } else if (form.dataset.form === 'copy-task') {
      const original = state.tasks.find((task) => task.id === form.dataset.id);
      if (!original) return;
      state.tasks.push({ ...original, id, studentId: data.studentId, due: data.due, status: 'todo', attachments: [], groupId: null, groupName: '' });
      persist(); closeModal(); render(); toast('Копия задания создана', `Назначено ученику ${studentName(data.studentId)}.`);
    } else if (form.dataset.form === 'board-new') {
      createBoard(data.name); closeModal(); renderBoard(); toast('Доска создана', data.name.trim());
    } else if (form.dataset.form === 'board-attach') {
      const lesson = state.lessons.find((item) => item.id === data.lessonId); const board = currentBoard();
      if (!lesson || !board) return;
      const oldBoard = state.boards.find((item) => item.id === lesson.boardId);
      if (oldBoard && oldBoard.id !== board.id) oldBoard.lessonIds = oldBoard.lessonIds.filter((lessonId) => lessonId !== lesson.id);
      lesson.boardId = board.id; if (!board.lessonIds.includes(lesson.id)) board.lessonIds.push(lesson.id);
      persist(); closeModal(); renderBoard(); toast('Доска привязана к занятию', lesson.title);
    } else if (form.dataset.form === 'board-text' || form.dataset.form === 'board-sticky') {
      const board = currentBoard(); if (!board || !boardTextPosition) return;
      pushBoardHistory(board);
      const canvas = document.getElementById('whiteboard'); const sticky = form.dataset.form === 'board-sticky';
      const element = sticky
        ? { id, type: 'sticky', x: boardTextPosition.x, y: boardTextPosition.y, w: Math.min(.8, 205 / (canvas?.clientWidth || 740)), h: Math.min(.8, 148 / (canvas?.clientHeight || 420)), text: data.text.trim(), fill: data.fill || '#fff1a8', color: '#414638', width: 1 }
        : { id, type: 'text', x: boardTextPosition.x, y: boardTextPosition.y, text: data.text.trim(), color: boardColor, width: boardWidth, fontSize: Math.max(16, boardWidth * 6) };
      board.elements.push(element); boardTextPosition = null; saveBoard(board); closeModal(); renderBoard();
    } else if (form.dataset.form === 'board-edit') {
      const board = currentBoard(); const element = board?.elements.find((item) => item.id === form.dataset.id);
      if (!element) return;
      pushBoardHistory(board); element.text = data.text.trim(); if (data.fill) element.fill = data.fill;
      saveBoard(board); closeModal(); renderBoard();
    } else if (form.dataset.form === 'planner-block') {
      const type = form.dataset.type;
      currentPlanner().blocks.push({ id, type, text: data.text.trim(), ...(type === 'todo' ? { checked: false } : {}) });
      persist(); closeModal(); renderTasks();
    }
  }

  function startLesson(id) {
    if (meetingStartedAt) stopRoomMedia();
    const requestedLesson = state.lessons.find((lesson) => lesson.id === id) || nextLesson() || null;
    if (isStudentAccount() && requestedLesson?.studentId !== currentAccount()?.studentId) {
      toast('Это занятие недоступно', 'Откройте урок из своего кабинета ученика.');
      return;
    }
    if (!isStudentAccount() && requestedLesson && !currentTutorLessons().some((lesson) => lesson.id === requestedLesson.id)) {
      toast('Это занятие недоступно', 'Откройте урок из своего расписания.');
      return;
    }
    activeConferenceId = requestedLesson ? null : `conference-${crypto.randomUUID()}`;
    setConferenceUrl(activeConferenceId);
    state._activeLesson = requestedLesson;
    if (state._activeLesson?.boardId) state.currentBoardId = state._activeLesson.boardId;
    meetingStartedAt = 0;
    navigate('room');
    toast('Комната готова', 'Включите камеру или покажите экран, когда будете готовы.');
  }
  function startRoomTimer() {
    window.clearInterval(meetingTimer);
    meetingStartedAt = meetingStartedAt || Date.now();
    const update = () => { const target = document.getElementById('roomTimer'); if (!target) return; const seconds = Math.floor((Date.now() - meetingStartedAt) / 1000); target.textContent = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`; };
    update(); meetingTimer = window.setInterval(update, 1000);
  }
  function stopRoomMedia() {
    const releasedRoomId = currentCallRoomId();
    window.clearInterval(screenShareLeaseTimer); screenShareLeaseTimer = null;
    if (screenShareEnabled && currentPlan() === 'free' && releasedRoomId) fetch('/api/screen-share', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: releasedRoomId }), keepalive: true }).catch(() => {});
    callDock.hidden = true;
    callDock.replaceChildren();
    window.clearInterval(meetingTimer); meetingTimer = null; meetingStartedAt = 0;
    if (liveKitRoom) { const room = liveKitRoom; liveKitRoom = null; room.disconnect(); }
    [localCameraStream, localMicStream, screenStream].forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
    localCameraStream = null; localMicStream = null; screenStream = null; cameraEnabled = false; micEnabled = false; screenShareEnabled = false;
    document.querySelectorAll('.livekit-remote-video,.livekit-remote-audio').forEach((element) => element.remove());
  }
  async function toggleCamera(button) {
    if (liveKitRoom) {
      try {
        cameraEnabled = !cameraEnabled;
        await liveKitRoom.localParticipant.setCameraEnabled(cameraEnabled);
        const video = document.getElementById('localVideo');
        const track = liveKitRoom.localParticipant.getTrackPublication(window.LivekitClient.Track.Source.Camera)?.videoTrack;
        if (cameraEnabled && track && video) { track.attach(video); video.hidden = false; document.querySelector('#tutorVideoTile .video-avatar').hidden = true; }
        else if (video) { video.srcObject = null; video.hidden = true; document.querySelector('#tutorVideoTile .video-avatar').hidden = false; }
        button.classList.toggle('is-off', !cameraEnabled); button.classList.toggle('is-on', cameraEnabled); button.innerHTML = useIcon(cameraEnabled ? 'cam' : 'cam-off');
        const stateLabel = document.getElementById('tutorVideoState'); if (stateLabel) stateLabel.innerHTML = `${useIcon(cameraEnabled ? 'cam' : 'cam-off')} ${cameraEnabled ? 'Камера включена' : 'Камера выключена'}`;
      } catch (error) { cameraEnabled = !cameraEnabled; toast('Не удалось включить камеру', error.message || 'Проверьте разрешение браузера.'); }
      return;
    }
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
      toast('Камера включена', 'Изображение будет передаваться участникам после подключения к звонку.');
    } catch (error) { toast('Не удалось включить камеру', error.message || 'Проверьте разрешения браузера.'); }
  }
  async function toggleMic(button) {
    if (liveKitRoom) {
      try {
        micEnabled = !micEnabled;
        await liveKitRoom.localParticipant.setMicrophoneEnabled(micEnabled);
        button.classList.toggle('is-off', !micEnabled); button.classList.toggle('is-on', micEnabled); button.innerHTML = useIcon(micEnabled ? 'mic' : 'mic-off');
        toast(micEnabled ? 'Микрофон включён' : 'Микрофон выключен');
      } catch (error) { micEnabled = !micEnabled; toast('Не удалось включить микрофон', error.message || 'Проверьте разрешение браузера.'); }
      return;
    }
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
    if (liveKitRoom) {
      try {
        if (!screenShareEnabled && currentPlan() === 'free') {
          const occupied = [...liveKitRoom.remoteParticipants.values()].some((participant) => [...participant.trackPublications.values()].some((publication) => String(publication.source || '').toLowerCase().includes('screen')));
          if (occupied) { toast('Экран уже демонстрирует другой участник', 'На бесплатном тарифе одновременно доступна одна демонстрация.'); return; }
        }
        const enabling = !screenShareEnabled;
        if (enabling && currentPlan() === 'free') {
          const response = await fetch('/api/screen-share', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: currentCallRoomId() }) });
          if (response.status === 409) { toast('Экран уже демонстрирует другой участник', 'Дождитесь завершения текущей демонстрации.'); return; }
          if (!response.ok) throw new Error('Не удалось зарезервировать демонстрацию экрана.');
        }
        screenShareEnabled = enabling;
        await liveKitRoom.localParticipant.setScreenShareEnabled(screenShareEnabled);
        window.clearInterval(screenShareLeaseTimer); screenShareLeaseTimer = null;
        if (screenShareEnabled && currentPlan() === 'free') screenShareLeaseTimer = window.setInterval(() => fetch('/api/screen-share', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: currentCallRoomId() }) }).catch(() => {}), 20000);
        if (!screenShareEnabled && currentPlan() === 'free') fetch('/api/screen-share', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: currentCallRoomId() }) }).catch(() => {});
        button.classList.toggle('is-on', screenShareEnabled);
        button.setAttribute('aria-pressed', screenShareEnabled ? 'true' : 'false');
        button.title = screenShareEnabled ? 'Остановить демонстрацию' : 'Показать экран';
        const stateLabel = document.getElementById('tutorVideoState');
        if (stateLabel && screenShareEnabled) stateLabel.innerHTML = `${useIcon('monitor')} Вы показываете экран`;
        if (!screenShareEnabled) restoreLocalVideo();
        toast(screenShareEnabled ? 'Демонстрация экрана включена' : 'Демонстрация экрана завершена');
      } catch (error) { if (screenShareEnabled && currentPlan() === 'free') fetch('/api/screen-share', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: currentCallRoomId() }) }).catch(() => {}); screenShareEnabled = false; window.clearInterval(screenShareLeaseTimer); screenShareLeaseTimer = null; toast('Не удалось показать экран', error.message || 'Выберите экран или окно для демонстрации.'); }
      return;
    }
    if (screenStream) { screenStream.getTracks().forEach((track) => track.stop()); screenStream = null; button.classList.remove('is-on'); restoreLocalVideo(); toast('Показ экрана завершён'); return; }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Демонстрация экрана доступна в браузере через localhost или HTTPS.');
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.getElementById('localVideo'); if (video) { video.srcObject = screenStream; video.hidden = false; }
      const avatar = document.querySelector('#tutorVideoTile .video-avatar'); if (avatar) avatar.hidden = true;
      const stateLabel = document.getElementById('tutorVideoState'); if (stateLabel) stateLabel.innerHTML = `${useIcon('monitor')} Экран показывается`;
      button.classList.add('is-on');
      screenStream.getVideoTracks()[0]?.addEventListener('ended', () => { screenStream = null; button.classList.remove('is-on'); restoreLocalVideo(); });
      toast('Демонстрация экрана включена', 'Экран будет доступен участникам после подключения к звонку.');
    } catch (error) { toast('Не удалось показать экран', error.message || 'Выберите экран или окно для демонстрации.'); }
  }
  function restoreLocalVideo() {
    const video = document.getElementById('localVideo'); const avatar = document.querySelector('#tutorVideoTile .video-avatar'); const label = document.getElementById('tutorVideoState');
    if (cameraEnabled && localCameraStream) { if (video) { video.srcObject = localCameraStream; video.hidden = false; } if (avatar) avatar.hidden = true; if (label) label.innerHTML = `${useIcon('cam')} Камера включена`; }
    else { if (video) { video.srcObject = null; video.hidden = true; } if (avatar) avatar.hidden = false; if (label) label.innerHTML = `${useIcon('cam-off')} Камера выключена`; }
  }

  function applyBoardZoom(nextZoom, anchor = null) {
    const wrap = document.querySelector('.board-canvas-wrap'); const surface = document.getElementById('boardSurface');
    const oldZoom = boardZoom;
    boardZoom = Math.max(.35, Math.min(2.5, Math.round(nextZoom * 20) / 20));
    if (surface) surface.style.transform = `scale(${boardZoom})`;
    const label = document.getElementById('boardZoomLabel'); if (label) label.textContent = `${Math.round(boardZoom * 100)}%`;
    if (wrap && anchor) {
      const rect = wrap.getBoundingClientRect(); const offsetX = anchor.clientX - rect.left; const offsetY = anchor.clientY - rect.top;
      const worldX = (wrap.scrollLeft + offsetX) / oldZoom; const worldY = (wrap.scrollTop + offsetY) / oldZoom;
      wrap.scrollLeft = worldX * boardZoom - offsetX; wrap.scrollTop = worldY * boardZoom - offsetY;
    }
  }

  function fitBoardToObjects() {
    const board = currentBoard(); const wrap = document.querySelector('.board-canvas-wrap'); if (!board || !wrap) return;
    const width = Number(board.baseWidth) || wrap.clientWidth; const height = Number(board.baseHeight) || wrap.clientHeight;
    if (!board.elements.length) { applyBoardZoom(1); wrap.scrollTo({ left: 0, top: 0, behavior: 'smooth' }); return; }
    const boxes = board.elements.map((element) => boardElementBounds(element, width, height));
    const left = Math.min(...boxes.map((box) => box.x)); const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + Math.max(1, box.w))); const bottom = Math.max(...boxes.map((box) => box.y + Math.max(1, box.h)));
    const padding = 72; const zoom = Math.min(2, (wrap.clientWidth - padding) / Math.max(120, right - left), (wrap.clientHeight - padding) / Math.max(90, bottom - top));
    applyBoardZoom(zoom); wrap.scrollLeft = Math.max(0, (left - padding / 2) * boardZoom); wrap.scrollTop = Math.max(0, (top - padding / 2) * boardZoom);
  }

  function redrawBoard(board = currentBoard()) {
    const canvas = document.getElementById('whiteboard'); if (!canvas || !board) return;
    drawBoardElements(canvas.getContext('2d'), board, Number(canvas.dataset.boardWidth) || canvas.clientWidth, Number(canvas.dataset.boardHeight) || canvas.clientHeight);
  }

  function setBoardTool(tool) {
    boardTool = tool; boardSelectedId = null; boardResizeState = null;
    document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    const canvas = document.getElementById('whiteboard'); if (canvas) canvas.style.cursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair';
    redrawBoard();
  }

  function setupBoard() {
    const canvas = document.getElementById('whiteboard');
    if (!canvas) return;
    const board = currentBoard();
    if (!board) return;
    const surface = canvas.parentElement;
    const wrap = surface.parentElement;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    if (!board.baseWidth || !board.baseHeight) { board.baseWidth = Math.max(1, wrap.clientWidth); board.baseHeight = Math.max(1, wrap.clientHeight); board.canvasVersion = 2; persist(); }
    const width = Math.max(1, Number(board.baseWidth)); const height = Math.max(1, Number(board.baseHeight));
    const surfaceWidth = width * 3; const surfaceHeight = height * 3;
    surface.style.width = `${surfaceWidth}px`; surface.style.height = `${surfaceHeight}px`;
    surface.style.transform = `scale(${boardZoom})`;
    canvas.width = Math.round(surfaceWidth * ratio); canvas.height = Math.round(surfaceHeight * ratio);
    canvas.style.width = `${surfaceWidth}px`; canvas.style.height = `${surfaceHeight}px`;
    canvas.dataset.boardWidth = String(width); canvas.dataset.boardHeight = String(height);
    const context = canvas.getContext('2d'); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.lineCap = 'round'; context.lineJoin = 'round';
    drawBoardElements(context, board, width, height);
    const point = (event) => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) / boardZoom, y: (event.clientY - rect.top) / boardZoom }; };
    const inlineEditor = document.getElementById('boardInlineEditor');
    const editInline = (normalized, element = null) => {
      if (!inlineEditor) return;
      boardTextPosition = normalized; boardInlineElementId = element?.id || null;
      inlineEditor.hidden = false; inlineEditor.style.left = `${Math.max(8, normalized.x * width)}px`; inlineEditor.style.top = `${Math.max(8, normalized.y * height)}px`;
      inlineEditor.classList.toggle('is-sticky', boardTool === 'sticky' || element?.type === 'sticky');
      const input = inlineEditor.querySelector('textarea'); input.value = element?.text || ''; input.focus();
    };
    const commitInline = (cancel = false) => {
      if (!inlineEditor || inlineEditor.hidden) return;
      const input = inlineEditor.querySelector('textarea'); const value = input.value.trim(); const existing = board.elements.find((item) => item.id === boardInlineElementId);
      if (!cancel && value) {
        pushBoardHistory(board);
        if (existing) existing.text = value;
        else {
          const sticky = boardTool === 'sticky';
          board.elements.push(sticky
            ? { id: `element-${Date.now()}`, type: 'sticky', x: boardTextPosition.x, y: boardTextPosition.y, w: Math.min(.65, 235 / width), h: Math.min(.6, 145 / height), text: value, fill: '#fff1a8', color: boardColor, font: boardFont, width: 1 }
            : { id: `element-${Date.now()}`, type: 'text', x: boardTextPosition.x, y: boardTextPosition.y, text: value, color: boardColor, font: boardFont, width: boardWidth, fontSize: Math.max(16, boardWidth * 6) });
        }
        saveBoard(board); drawBoardElements(context, board, width, height); updateBoardElementCount(board);
      }
      inlineEditor.hidden = true; boardInlineElementId = null;
    };
    inlineEditor?.querySelector('[data-inline-save]')?.addEventListener('click', () => commitInline());
    inlineEditor?.querySelector('[data-inline-cancel]')?.addEventListener('click', () => commitInline(true));
    inlineEditor?.querySelector('textarea')?.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commitInline(); } if (event.key === 'Escape') commitInline(true); });
    canvas.onpointerdown = (event) => {
      canvas.setPointerCapture(event.pointerId);
      if (event.button === 1 || event.button === 2 || boardSpaceDown || boardTool === 'hand') {
        event.preventDefault(); boardPanState = { x: event.clientX, y: event.clientY, left: wrap.scrollLeft, top: wrap.scrollTop }; canvas.style.cursor = 'grabbing'; return;
      }
      const p = point(event); const normalized = { x: p.x / width, y: p.y / height };
      const hit = hitBoardElement(board, p.x, p.y, width, height);
      const resize = boardSelectedId ? hitBoardResizeHandle(board.elements.find((item) => item.id === boardSelectedId), p.x, p.y, width, height) : null;
      if (resize) {
        const element = board.elements.find((item) => item.id === boardSelectedId); pushBoardHistory(board); boardResizeState = { id: element.id, handle: resize, original: JSON.parse(JSON.stringify(element)), start: normalized }; return;
      }
      if (hit && boardTool === 'select') {
        boardGestureRecorded = false; boardDragElementId = hit?.id || null; lastPoint = normalized; boardSelectedId = boardDragElementId;
        drawBoardElements(context, board, width, height); canvas.style.cursor = hit ? 'move' : 'default'; return;
      }
      if (boardTool === 'eraser') {
        if (hit) { pushBoardHistory(board); board.elements = board.elements.filter((element) => element.id !== hit.id); saveBoard(board); drawBoardElements(context, board, width, height); updateBoardElementCount(board); }
        return;
      }
      if (boardTool === 'text' || boardTool === 'sticky') { editInline(normalized); return; }
      if (boardTool === 'select') return;
      pushBoardHistory(board); boardDrawing = true; boardPointerStart = normalized; lastPoint = normalized;
      const element = { id: `element-${Date.now()}`, type: boardTool === 'pen' ? 'path' : boardTool, color: boardColor, width: boardWidth, points: [{ x: normalized.x, y: normalized.y }], x1: normalized.x, y1: normalized.y, x2: normalized.x, y2: normalized.y };
      if (boardTool === 'sticky' || boardTool === 'text') return;
      board.elements.push(element); boardDraftId = element.id;
    };
    canvas.onpointermove = (event) => {
      if (boardPanState) { wrap.scrollLeft = boardPanState.left - (event.clientX - boardPanState.x); wrap.scrollTop = boardPanState.top - (event.clientY - boardPanState.y); return; }
      const p = point(event); const normalized = { x: p.x / width, y: p.y / height };
      if (boardResizeState) { resizeBoardElement(board.elements.find((item) => item.id === boardResizeState.id), boardResizeState, normalized, width, height); drawBoardElements(context, board, width, height); return; }
      if (boardDragElementId) {
        const element = board.elements.find((item) => item.id === boardDragElementId);
        if (element && lastPoint) { if (!boardGestureRecorded) { pushBoardHistory(board); boardGestureRecorded = true; } moveBoardElement(element, normalized.x - lastPoint.x, normalized.y - lastPoint.y); lastPoint = normalized; drawBoardElements(context, board, width, height); }
        return;
      }
      if (!boardDrawing) { if (boardTool === 'eraser') canvas.style.cursor = hitBoardElement(board, p.x, p.y, width, height) ? 'pointer' : 'crosshair'; return; }
      const element = board.elements.find((item) => item.id === boardDraftId); if (!element) return;
      const status = document.getElementById('boardSaveState'); if (status) status.textContent = 'Изменения…';
      if (boardTool === 'pen' && event.shiftKey) {
        const startX = boardPointerStart.x * width; const startY = boardPointerStart.y * height; const dx = p.x - startX; const dy = p.y - startY;
        const end = Math.abs(dx) >= Math.abs(dy) ? { x: normalized.x, y: boardPointerStart.y } : { x: boardPointerStart.x, y: normalized.y };
        element.type = 'line'; element.shiftLine = true; element.points = [boardPointerStart, end]; element.x1 = boardPointerStart.x; element.y1 = boardPointerStart.y; element.x2 = end.x; element.y2 = end.y;
      } else if (boardTool === 'pen') {
        if (element.shiftLine) { element.type = 'path'; element.shiftLine = false; element.points = [boardPointerStart]; }
        element.points.push(normalized);
      } else if (element.type === 'path') element.points.push(normalized);
      else { element.x2 = normalized.x; element.y2 = normalized.y; }
      drawBoardElements(context, board, width, height);
    };
    const finish = () => {
      if (boardPanState) { boardPanState = null; canvas.style.cursor = boardSpaceDown || boardTool === 'hand' ? 'grab' : boardTool === 'select' ? 'default' : 'crosshair'; }
      if (boardResizeState) { boardResizeState = null; saveBoard(board); }
      if (boardDrawing) { boardDrawing = false; const draft = board.elements.find((element) => element.id === boardDraftId); if (draft) delete draft.shiftLine; boardDraftId = null; saveBoard(board); updateBoardElementCount(board); drawBoardElements(context, board, width, height); }
      if (boardDragElementId) { boardDragElementId = null; saveBoard(board); }
    };
    canvas.onpointerup = canvas.onpointercancel = finish;
    canvas.ondblclick = (event) => { const p = point(event); const hit = hitBoardElement(board, p.x, p.y, width, height); if (hit?.fileUrl) openFileViewer(hit.fileUrl, hit.fileName, hit.fileType); else if (hit && (hit.type === 'text' || hit.type === 'sticky')) editInline({ x: hit.x, y: hit.y }, hit); };
    canvas.onpointerleave = () => { if (!boardDrawing && !boardDragElementId && !boardPanState) canvas.style.cursor = boardSpaceDown || boardTool === 'hand' ? 'grab' : boardTool === 'select' ? 'default' : 'crosshair'; };
    canvas.onwheel = (event) => { event.preventDefault(); applyBoardZoom(boardZoom * (event.deltaY < 0 ? 1.1 : .9), event); };
    canvas.oncontextmenu = (event) => event.preventDefault();
    const color = document.getElementById('boardColor'); color?.addEventListener('input', () => { boardColor = color.value; const selected = board.elements.find((item) => item.id === boardSelectedId); if (selected && (selected.type === 'text' || selected.type === 'sticky')) { selected.color = color.value; saveBoard(board); drawBoardElements(context, board, width, height); } });
    const font = document.getElementById('boardFont'); font?.addEventListener('change', () => { boardFont = font.value; const selected = board.elements.find((item) => item.id === boardSelectedId); if (selected && (selected.type === 'text' || selected.type === 'sticky')) { selected.font = font.value; saveBoard(board); drawBoardElements(context, board, width, height); } });
    const size = document.getElementById('brushSize');
    const updateBrushSize = () => { boardWidth = Number(size.value); const label = document.getElementById('boardWidthLabel'); if (label) label.textContent = `${boardWidth}px`; };
    size?.addEventListener('input', updateBrushSize);
    size?.addEventListener('change', updateBrushSize);
    document.getElementById('boardSelect')?.addEventListener('change', (event) => { state.currentBoardId = event.target.value; boardSelectedId = null; persist(); renderBoard(); });
    const importInput = document.getElementById('boardImport');
    importInput?.addEventListener('change', async () => { await importBoardFiles([...importInput.files], board, width, height, context); importInput.value = ''; });
    const workspace = canvas.closest('.board-workspace');
    workspace?.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); workspace.classList.add('is-file-over'); } });
    workspace?.addEventListener('dragleave', (event) => { if (!workspace.contains(event.relatedTarget)) workspace.classList.remove('is-file-over'); });
    workspace?.addEventListener('drop', async (event) => { if (event.dataTransfer?.files.length) { event.preventDefault(); workspace.classList.remove('is-file-over'); await importBoardFiles([...event.dataTransfer.files], board, width, height, context); } });
    document.getElementById('roomLessonSelect')?.addEventListener('change', (event) => startLesson(event.target.value));
  }

  function boardHistoryFor(board = currentBoard()) {
    if (!board) return null;
    if (!boardHistories.has(board.id)) boardHistories.set(board.id, { undo: [], redo: [] });
    return boardHistories.get(board.id);
  }
  function pushBoardHistory(board = currentBoard()) {
    const history = boardHistoryFor(board); if (!history) return;
    const snapshot = JSON.parse(JSON.stringify(board.elements));
    if (history.undo.length && JSON.stringify(history.undo.at(-1)) === JSON.stringify(snapshot)) return;
    history.undo.push(snapshot); history.redo = []; if (history.undo.length > 60) history.undo.shift();
  }
  function saveBoard(board = currentBoard()) {
    if (!board) return;
    board.updatedAt = Date.now(); persist();
    if (liveKitRoom) {
      const payload = new TextEncoder().encode(JSON.stringify({ type: 'board', board: { id: board.id, elements: board.elements, updatedAt: board.updatedAt } }));
      liveKitRoom.localParticipant.publishData(payload, { reliable: true }).catch(() => {});
    }
    const status = document.getElementById('boardSaveState'); if (status) status.textContent = 'Сохранено';
  }
  function updateBoardElementCount(board = currentBoard()) {
    const chip = document.querySelector('.board-page-chip'); if (chip && board) chip.textContent = `${board.elements.length} элементов`;
  }
  async function importBoardFiles(files, board, width, height, context) {
    const supported = files.filter((file) => file.type.startsWith('image/') || /\.pdf$/i.test(file.name) || /\.pptx$/i.test(file.name));
    if (!supported.length) { toast('Формат не поддерживается', 'Добавьте фото, PDF или PowerPoint (.pptx).'); return; }
    pushBoardHistory(board);
    try {
      for (const file of supported) {
        if (file.type.startsWith('image/')) {
          const src = await fileToDataURL(file);
          const dimensions = await imageDimensions(src); const normalizedAspect = (dimensions.width / dimensions.height) * height / width;
          const h = normalizedAspect >= 1 ? .72 / normalizedAspect : .72; const w = normalizedAspect >= 1 ? .72 : .72 * normalizedAspect;
          board.elements.push({ id: `element-${Date.now()}-${Math.random()}`, type: 'image', x: .08, y: .08, w, h, src, name: file.name });
        } else if (/\.pdf$/i.test(file.name)) {
          const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
          pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
          const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
          const gap = pdf.numPages > 1 ? .012 : 0; const maxWidth = Math.min(.24, (.94 - gap * (pdf.numPages - 1)) / pdf.numPages); const startX = .025;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i); const viewport = page.getViewport({ scale: 1 }); const scale = Math.min(900 / viewport.width, 1200 / viewport.height, 1.5);
            const renderViewport = page.getViewport({ scale }); const pageCanvas = document.createElement('canvas'); pageCanvas.width = renderViewport.width; pageCanvas.height = renderViewport.height;
            await page.render({ canvas: pageCanvas, viewport: renderViewport }).promise;
            const h = maxWidth * pageCanvas.height / pageCanvas.width * width / height;
            board.elements.push({ id: `element-${Date.now()}-${i}`, type: 'image', x: startX + (i - 1) * (maxWidth + gap), y: .08, w: maxWidth, h, src: pageCanvas.toDataURL('image/jpeg', .82), name: `${file.name} · ${i}` });
          }
        } else {
          const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
          const zip = await JSZip.loadAsync(file); const presentation = new DOMParser().parseFromString(await zip.file('ppt/presentation.xml').async('text'), 'application/xml');
          const sizeNode = presentation.getElementsByTagName('p:sldSz')[0]; const slideW = Number(sizeNode?.getAttribute('cx')) || 12192000; const slideH = Number(sizeNode?.getAttribute('cy')) || 6858000;
          const presentationRelsFile = zip.file('ppt/_rels/presentation.xml.rels');
          const presentationTargets = presentationRelsFile ? new Map([...new DOMParser().parseFromString(await presentationRelsFile.async('text'), 'application/xml').getElementsByTagName('Relationship')].map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')])) : new Map();
          const orderedSlides = [...presentation.getElementsByTagName('p:sldId')].map((slide) => { const target = presentationTargets.get(slide.getAttribute('r:id')); return target ? (target.startsWith('/') ? target.slice(1) : `ppt/${target}`) : null; }).filter((name) => name && zip.file(name));
          const slideFiles = orderedSlides.length ? orderedSlides : Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
          const gap = slideFiles.length > 1 ? .012 : 0; const cardWidth = Math.min(.24, (.94 - gap * (slideFiles.length - 1)) / Math.max(1, slideFiles.length));
          for (let index = 0; index < slideFiles.length; index++) {
            const slidePath = slideFiles[index]; const xml = new DOMParser().parseFromString(await zip.file(slidePath).async('text'), 'application/xml'); const scale = 1200 / slideW; const svgW = slideW * scale; const svgH = slideH * scale;
            const texts = [...xml.getElementsByTagName('p:sp')].map((shape) => {
              const off = shape.getElementsByTagName('a:off')[0]; const ext = shape.getElementsByTagName('a:ext')[0]; if (!off || !ext) return '';
              const x = Number(off.getAttribute('x')) * scale; const y = Number(off.getAttribute('y')) * scale; const w = Number(ext.getAttribute('cx')) * scale;
              const paragraphs = [...shape.getElementsByTagName('a:p')].map((p) => [...p.getElementsByTagName('a:t')].map((t) => t.textContent).join('')).filter(Boolean);
              if (!paragraphs.length) return '';
              const fontSize = Math.max(14, Math.min(42, Number(shape.getElementsByTagName('a:rPr')[0]?.getAttribute('sz') || 1800) / 100));
              return `<text x="${x + 12}" y="${y + fontSize + 10}" font-family="Arial,sans-serif" font-size="${fontSize}" fill="#253029">${paragraphs.map((line) => `<tspan x="${x + 12}" dy="1.2em">${escapeHTML(line)}</tspan>`).join('')}</text><rect x="${x}" y="${y}" width="${w}" height="${Number(ext.getAttribute('cy')) * scale}" fill="none" stroke="#e5e9e5"/>`;
            }).join('');
            let images = '';
            const relPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels';
            if (zip.file(relPath)) {
              const rels = new DOMParser().parseFromString(await zip.file(relPath).async('text'), 'application/xml'); const targets = new Map([...rels.getElementsByTagName('Relationship')].map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')]));
              for (const picture of [...xml.getElementsByTagName('p:pic')]) {
                const off = picture.getElementsByTagName('a:off')[0]; const ext = picture.getElementsByTagName('a:ext')[0]; const blip = picture.getElementsByTagName('a:blip')[0]; if (!off || !ext || !blip) continue;
                const target = targets.get(blip.getAttribute('r:embed')); if (!target) continue;
                const mediaPath = target.split('/').reduce((parts, segment) => { if (segment === '..') parts.pop(); else if (segment !== '.') parts.push(segment); return parts; }, target.startsWith('/') ? [] : ['ppt', 'slides']);
                const mediaFile = zip.file(mediaPath.join('/')); if (!mediaFile) continue;
                const bytes = await mediaFile.async('uint8array'); let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                const extension = mediaPath.at(-1).split('.').pop().toLowerCase(); const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml' })[extension] || 'image/png';
                images += `<image x="${Number(off.getAttribute('x')) * scale}" y="${Number(off.getAttribute('y')) * scale}" width="${Number(ext.getAttribute('cx')) * scale}" height="${Number(ext.getAttribute('cy')) * scale}" href="data:${mime};base64,${btoa(binary)}" preserveAspectRatio="xMidYMid meet"/>`;
              }
            }
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}"><rect width="100%" height="100%" fill="white"/>${images}${texts}</svg>`;
            const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; board.elements.push({ id: `element-${Date.now()}-${index}`, type: 'image', x: .025 + index * (cardWidth + gap), y: .08, w: cardWidth, h: cardWidth * slideH / slideW * width / height, src, name: `${file.name} · ${index + 1}` });
          }
        }
      }
      saveBoard(board); drawBoardElements(context, board, width, height); updateBoardElementCount(board);
      toast('Материалы добавлены', `${supported.length} файл${supported.length === 1 ? '' : 'а'} загружено на доску.`);
    } catch (error) { console.error('Не удалось импортировать файл на доску', error); toast('Не удалось открыть файл', 'Проверьте формат и попробуйте ещё раз.'); }
  }
  function fileToDataURL(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => { const image = new Image(); image.onerror = reject; image.onload = () => { const ratio = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio)); const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .84)); }; image.src = reader.result; }; reader.readAsDataURL(file); }); }
  function imageDimensions(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = reject; image.src = src; }); }
  const imageCache = new Map();
  function drawBoardElements(context, board, width, height) {
    context.clearRect(0, 0, context.canvas.clientWidth || width * 3, context.canvas.clientHeight || height * 3);
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
      } else if (element.type === 'image') {
        let image = imageCache.get(element.src);
        if (!image) { image = new Image(); imageCache.set(element.src, image); image.onload = () => drawBoardElements(context, board, width, height); image.src = element.src; }
        if (image.complete && image.naturalWidth) context.drawImage(image, element.x * width, element.y * height, element.w * width, element.h * height);
      } else if (element.type === 'video') {
        // Video is rendered as a positioned iframe above the canvas. Drawing a
        // second placeholder here leaves a black rectangle at its old position
        // while the iframe is being moved or resized.
        continue;
      } else if (element.type === 'sticky') {
        const x = element.x * width; const y = element.y * height; const w = element.w * width; const h = element.h * height;
        context.fillStyle = element.fill || '#fff1a8'; context.fillRect(x, y, w, h); context.strokeStyle = 'rgba(80,70,30,.14)'; context.strokeRect(x, y, w, h);
        context.fillStyle = element.color || '#3c4137'; context.font = `500 14px ${element.font || 'system-ui'}`; wrapCanvasText(context, element.text || '', x + 12, y + 22, w - 22, 19, 5);
      } else if (element.type === 'text') {
        context.fillStyle = color; context.font = `600 ${element.fontSize || 20}px ${element.font || 'system-ui'}`; const lines = String(element.text || '').split('\n'); lines.forEach((line, index) => context.fillText(line, element.x * width, element.y * height + index * ((element.fontSize || 20) * 1.35)));
      }
      if (element.id === boardSelectedId) {
        const box = boardElementBounds(element, width, height); context.save(); context.strokeStyle = '#7496cc'; context.fillStyle = '#fff'; context.lineWidth = 1; context.setLineDash([4, 3]); context.strokeRect(box.x - 5, box.y - 5, box.w + 10, box.h + 10); context.setLineDash([]);
        boardResizeHandles(element, width, height).forEach((handle) => { context.beginPath(); context.rect(handle.x - 4, handle.y - 4, 8, 8); context.fill(); context.stroke(); }); context.restore();
      }
    }
  }
  function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 8) {
    let line = ''; let count = 0;
    for (const word of String(text).split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (context.measureText(next).width > maxWidth && line) { context.fillText(line, x, y); line = word; y += lineHeight; count++; if (count >= maxLines) return; } else line = next; }
    if (line) context.fillText(line, x, y);
  }
  function boardElementBounds(element, width, height) {
    if (element.type === 'path') { const xs = element.points.map((p) => p.x * width); const ys = element.points.map((p) => p.y * height); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    if (element.type === 'text') return { x: element.x * width, y: element.y * height - (element.fontSize || 20), w: Math.max(40, String(element.text).length * (element.fontSize || 20) * .58), h: String(element.text).split('\n').length * (element.fontSize || 20) * 1.4 };
    if (element.type === 'sticky' || element.type === 'image' || element.type === 'video') return { x: element.x * width, y: element.y * height, w: element.w * width, h: element.h * height };
    const x1 = element.x1 * width; const y1 = element.y1 * height; const x2 = element.x2 * width; const y2 = element.y2 * height;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  function boardResizeHandles(element, width, height) {
    if (!element) return [];
    if (element.type === 'line' || element.type === 'arrow') return [{ name: 'start', x: element.x1 * width, y: element.y1 * height }, { name: 'end', x: element.x2 * width, y: element.y2 * height }];
    const box = boardElementBounds(element, width, height);
    return [{ name: 'nw', x: box.x, y: box.y }, { name: 'ne', x: box.x + box.w, y: box.y }, { name: 'sw', x: box.x, y: box.y + box.h }, { name: 'se', x: box.x + box.w, y: box.y + box.h }];
  }
  function hitBoardResizeHandle(element, x, y, width, height) {
    return boardResizeHandles(element, width, height).find((handle) => Math.hypot(x - handle.x, y - handle.y) <= 10)?.name || null;
  }
  function resizeBoardElement(element, state, point, width, height) {
    if (!element || !state?.original) return;
    const original = state.original; const dx = (point.x - state.start.x) * width; const dy = (point.y - state.start.y) * height;
    if (original.type === 'line' || original.type === 'arrow') {
      const key = state.handle === 'start' ? '1' : '2'; element[`x${key}`] = point.x; element[`y${key}`] = point.y; return;
    }
    const box = boardElementBounds(original, width, height); let left = box.x; let top = box.y; let right = box.x + Math.max(1, box.w); let bottom = box.y + Math.max(1, box.h);
    if (state.handle.includes('w')) left += dx; else right += dx;
    if (state.handle.includes('n')) top += dy; else bottom += dy;
    const minW = original.type === 'text' ? 28 : 36; const minH = original.type === 'text' ? 20 : 30;
    if (right - left < minW) { if (state.handle.includes('w')) left = right - minW; else right = left + minW; }
    if (bottom - top < minH) { if (state.handle.includes('n')) top = bottom - minH; else bottom = top + minH; }
    if (original.type === 'image' || original.type === 'video') {
      const aspect = Math.max(.05, box.w / Math.max(1, box.h)); const newW = right - left; const newH = newW / aspect;
      if (state.handle.includes('n')) top = bottom - newH; else bottom = top + newH;
    }
    const newW = Math.max(minW, right - left); const newH = Math.max(minH, bottom - top);
    if (original.type === 'path') {
      const oldW = Math.max(1, box.w); const oldH = Math.max(1, box.h);
      element.points = original.points.map((p) => ({ x: (left + ((p.x * width - box.x) / oldW) * newW) / width, y: (top + ((p.y * height - box.y) / oldH) * newH) / height }));
    } else if (original.type === 'rect' || original.type === 'ellipse') {
      const flipX = original.x1 > original.x2; const flipY = original.y1 > original.y2;
      element.x1 = (flipX ? right : left) / width; element.x2 = (flipX ? left : right) / width; element.y1 = (flipY ? bottom : top) / height; element.y2 = (flipY ? top : bottom) / height;
    } else if (original.type === 'text') {
      element.x = left / width; element.y = (top + newH * .72) / height; element.fontSize = Math.max(10, Math.min(180, (original.fontSize || 20) * newH / Math.max(1, box.h)));
    } else {
      element.x = left / width; element.y = top / height; element.w = newW / width; element.h = newH / height;
    }
  }
  function hitBoardElement(board, x, y, width, height) {
    for (let i = board.elements.length - 1; i >= 0; i--) {
      const element = board.elements[i]; const tolerance = Math.max(10, (element.width || 3) + 6);
      if (element.type === 'path') {
        const points = element.points || [];
        for (let j = 1; j < points.length; j++) if (distanceToSegment(x, y, points[j - 1].x * width, points[j - 1].y * height, points[j].x * width, points[j].y * height) <= tolerance) return element;
        if (points.length === 1 && Math.hypot(x - points[0].x * width, y - points[0].y * height) <= tolerance) return element;
      } else if (element.type === 'line' || element.type === 'arrow') {
        if (distanceToSegment(x, y, element.x1 * width, element.y1 * height, element.x2 * width, element.y2 * height) <= tolerance) return element;
      } else { const box = boardElementBounds(element, width, height); if (x >= box.x - tolerance && x <= box.x + box.w + tolerance && y >= box.y - tolerance && y <= box.y + box.h + tolerance) return element; }
    }
    return null;
  }
  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1; const dy = y2 - y1; const length = dx * dx + dy * dy; const t = length ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function moveBoardElement(element, dx, dy) {
    if (element.type === 'path') element.points = element.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
    else if (element.type === 'text' || element.type === 'sticky' || element.type === 'image' || element.type === 'video') { element.x += dx; element.y += dy; }
    else { element.x1 += dx; element.x2 += dx; element.y1 += dy; element.y2 += dy; }
  }
  function undoBoard() {
    const board = currentBoard(); const canvas = document.getElementById('whiteboard'); if (!canvas || !board) return;
    const history = boardHistoryFor(board); const elements = history.undo.pop(); if (!elements) { toast('Пока нечего отменять'); return; }
    history.redo.push(JSON.parse(JSON.stringify(board.elements))); board.elements = elements; boardSelectedId = null; saveBoard(board); renderBoard();
  }
  function redoBoard() {
    const board = currentBoard(); const history = boardHistoryFor(board); if (!board || !history) return;
    const elements = history.redo.pop(); if (!elements) { toast('Пока нечего повторять'); return; }
    history.undo.push(JSON.parse(JSON.stringify(board.elements))); board.elements = elements; boardSelectedId = null; saveBoard(board); renderBoard();
  }
  function clearBoard() {
    const board = currentBoard(); const canvas = document.getElementById('whiteboard'); if (!canvas || !board) return;
    pushBoardHistory(board); board.elements = []; boardSelectedId = null; saveBoard(board); renderBoard();
  }
  function exportBoard() {
    const canvas = document.getElementById('whiteboard'); if (!canvas) return;
    const board = currentBoard(); const output = document.createElement('canvas'); output.width = canvas.clientWidth * (window.devicePixelRatio || 1); output.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    const context = output.getContext('2d'); context.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight); drawBoardElements(context, board, canvas.clientWidth, canvas.clientHeight);
    const link = document.createElement('a'); link.download = `tutdesk-доска-${dateToISO(new Date())}.png`; link.href = output.toDataURL('image/png'); link.click();
  }

  document.addEventListener('click', async (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { event.preventDefault(); navigate(viewButton.dataset.view); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'menu') sidebar.classList.toggle('is-open');
    else if (action === 'toggle-theme') applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    else if (action === 'toggle-password') {
      const input = document.getElementById(button.dataset.target);
      if (input) {
        const showing = input.type === 'password';
        input.type = showing ? 'text' : 'password';
        button.textContent = showing ? 'Скрыть' : 'Показать';
        button.setAttribute('aria-label', showing ? 'Скрыть пароль' : 'Показать пароль');
      }
    }
    else if (action === 'open-modal') openForm(button.dataset.modal);
    else if (action === 'close-modal') closeModal();
    else if (action === 'file-open') openFileViewer(button.dataset.url, button.dataset.name, button.dataset.type);
    else if (action === 'file-viewer-close') { fileViewer.hidden = true; fileViewer.innerHTML = ''; }
    else if (action === 'file-viewer-minimize') fileViewer.classList.toggle('is-minimized');
    else if (action === 'storage-upload') document.getElementById('storageUpload')?.click();
    else if (action === 'storage-delete') { const response = await fetch(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' }); if (!response.ok) { toast('Не удалось удалить файл'); return; } collaboration.files = collaboration.files.filter((file) => file.id !== id); renderHomework(); toast('Файл удалён из хранилища'); }
    else if (action === 'note-new') { const note = { id: `note-${Date.now()}`, title: 'Новая страница', body: '', updatedAt: Date.now() }; currentNotes().unshift(note); state.currentNoteId = note.id; persist(); renderNotion(); }
    else if (action === 'note-open') { state.currentNoteId = id; renderNotion(); }
    else if (action === 'note-delete') { const notes = currentNotes(); const index = notes.findIndex((note) => note.id === id); if (index >= 0) notes.splice(index, 1); state.currentNoteId = notes[0]?.id || null; persist(); renderNotion(); }
    else if (action === 'homework-review') { const task = state.tasks.find((item) => item.id === id); if (task) showModal('Проверка работы', task.title, `<form class="form-grid" data-form="homework-review" data-id="${escapeHTML(id)}"><div class="form-field"><label for="reviewStatus">Статус</label><select class="form-control" id="reviewStatus" name="reviewStatus"><option value="unchecked" ${task.reviewStatus === 'unchecked' ? 'selected' : ''}>Непроверено</option><option value="errors" ${task.reviewStatus === 'errors' ? 'selected' : ''}>Есть ошибки</option><option value="correct" ${task.reviewStatus === 'correct' ? 'selected' : ''}>Правильно</option></select></div><div class="form-field"><label for="reviewComment">Комментарий ученику</label><textarea class="form-textarea" id="reviewComment" name="reviewComment">${escapeHTML(task.reviewComment || '')}</textarea></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Сохранить проверку</button></div></form>`); }
    else if (action === 'conversation-open') { activeConversation = id; renderMessages(); }
    else if (action === 'group-new') openGroupForm();
    else if (action === 'group-edit') { event.stopPropagation(); openGroupForm(id); }
    else if (action === 'group-delete') {
      const response = await fetch(`/api/groups/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) { toast('Не удалось удалить группу'); return; }
      collaboration.groups = collaboration.groups.filter((group) => group.id !== id); collaboration.messages = collaboration.messages.filter((message) => message.groupId !== id); activeConversation = ''; closeModal(); renderMessages(); toast('Группа удалена');
    }
    else if (action === 'attachment-delete') {
      const response = await fetch(`/api/homework-files/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) { toast('Не удалось удалить файл'); return; }
      state.tasks.forEach((task) => { task.attachments = (task.attachments || []).filter((attachment) => attachment.id !== id); }); persist(); renderTasks(); toast('Файл удалён');
    }
    else if (action === 'start-lesson') startLesson(id);
    else if (action === 'choose-plan') { const response = await fetch('/api/plan', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: button.dataset.plan }) }); if (!response.ok) { toast('Не удалось сменить тариф'); return; } const account = currentAccount(); if (account) account.plan = button.dataset.plan; state.plan = button.dataset.plan; persist(); render(); toast(`Выбран тариф «${currentPlan() === 'free' ? 'Бесплатный' : currentPlan() === 'light' ? 'Базовый' : 'Продвинутый'}»`); }
    else if (action === 'task-filter') { taskFilter = button.dataset.filter; renderTasks(); }
    else if (action === 'task-status') { const task = state.tasks.find((item) => item.id === id); if (task) { task.status = task.kind === 'personal' ? (task.status === 'complete' ? 'todo' : 'complete') : (({ todo: 'submitted', submitted: 'complete', complete: 'todo' })[task.status] || 'todo'); persist(); render(); toast(task.kind === 'personal' ? (task.status === 'complete' ? 'Личная задача выполнена' : 'Личная задача возвращена в список') : `Статус: ${taskStatusLabel(task.status)}`, task.title); } }
    else if (action === 'student-task-status') { const task = state.tasks.find((item) => item.id === id); if (task && task.studentId === currentAccount()?.studentId) { task.status = task.status === 'submitted' ? 'todo' : 'submitted'; persist(); renderTasks(); toast(task.status === 'submitted' ? 'Задание отправлено репетитору' : 'Задание возвращено в работу'); } }
    else if (action === 'copy-task') openForm('copy-task', id);
    else if (action === 'lesson-board') { const lesson = state.lessons.find((item) => item.id === id); openLessonBoard(lesson); }
    else if (action === 'lesson-edit') openForm('lesson-edit', id);
    else if (action === 'toggle-camera') await toggleCamera(button);
    else if (action === 'toggle-mic') await toggleMic(button);
    else if (action === 'share-screen') await shareScreen(button);
    else if (action === 'join-livekit') {
      if (!authenticatedAccountId) { openLiveKitJoin(); return; }
      button.disabled = true;
      button.classList.add('is-loading');
      const original = button.innerHTML;
      button.innerHTML = '<span>Подключаемся…</span>';
      await joinLiveKit({});
      if (button.isConnected && !liveKitRoom) { button.disabled = false; button.classList.remove('is-loading'); button.innerHTML = original; }
    }
    else if (action === 'create-conference') createConference();
    else if (action === 'copy-conference') copyConferenceLink();
    else if (action === 'open-board') { const lesson = activeConferenceId ? null : (state._activeLesson || nextLesson()); if (lesson) openLessonBoard(lesson); else navigate('board'); toast('Доска открыта', 'Звонок продолжается, пока вы работаете на доске.'); }
    else if (action === 'leave-room') { stopRoomMedia(); activeConferenceId = null; setConferenceUrl(null); navigate('overview'); toast('Вы вышли из комнаты'); }
    else if (action === 'board-tool') setBoardTool(button.dataset.tool);
    else if (action === 'board-undo') undoBoard();
    else if (action === 'board-redo') redoBoard();
    else if (action === 'board-shortcuts') showModal('Сочетания клавиш', 'Команды работают, когда курсор не находится в поле ввода.', '<div class="board-shortcut-list"><kbd>V</kbd><span>Выбор</span><kbd>H</kbd><span>Рука</span><kbd>P</kbd><span>Ручка</span><kbd>T</kbd><span>Текст</span><kbd>N</kbd><span>Стикер</span><kbd>R</kbd><span>Прямоугольник</span><kbd>O</kbd><span>Овал</span><kbd>L</kbd><span>Линия</span><kbd>A</kbd><span>Стрелка</span><kbd>E</kbd><span>Ластик</span><kbd>Пробел</kbd><span>Временная рука</span><kbd>Delete</kbd><span>Удалить объект</span><kbd>Ctrl Z</kbd><span>Отменить</span><kbd>Ctrl Shift Z</kbd><span>Повторить</span></div>');
    else if (action === 'board-clear') clearBoard();
    else if (action === 'board-export') exportBoard();
    else if (action === 'video-board') addVideoToBoard(id);
    else if (action === 'board-video-library') openBoardVideoPicker();
    else if (action === 'board-video-pick') { closeModal(); addVideoToBoard(id); }
    else if (action === 'board-file-library') openBoardFilePicker();
    else if (action === 'board-file-pick') addStoredFileToBoard(id);
    else if (action === 'board-zoom-in') applyBoardZoom(boardZoom + .1);
    else if (action === 'board-zoom-out') applyBoardZoom(boardZoom - .1);
    else if (action === 'board-zoom-fit') fitBoardToObjects();
    else if (action === 'video-delete') {
      const response = await fetch(`/api/videos/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) { toast('Не удалось удалить видеоурок'); return; }
      state.videos = state.videos.filter((video) => video.id !== id);
      renderVideos(); toast('Видеоурок удалён');
    }
    else if (action === 'board-video-remove') { const board = currentBoard(); if (board) { pushBoardHistory(board); board.elements = board.elements.filter((item) => item.id !== id); saveBoard(board); renderBoard(); } }
    else if (action === 'board-fullscreen') { const shell = document.querySelector('.app-shell'); const expanded = shell?.classList.toggle('is-board-expanded'); button.setAttribute('aria-pressed', expanded ? 'true' : 'false'); button.textContent = expanded ? '⛶ Свернуть' : '⛶ Во весь экран'; window.requestAnimationFrame(setupBoard); }
    else if (action === 'board-new') openForm('board-new');
    else if (action === 'board-attach') openForm('board-attach');
    else if (action === 'planner-add') addPlannerBlock(button.dataset.type);
    else if (action === 'planner-toggle') { const block = currentPlanner().blocks.find((item) => item.id === id); if (block) { block.checked = !block.checked; persist(); renderTasks(); } }
    else if (action === 'planner-up') reorderPlannerBlock(id, -1);
    else if (action === 'planner-down') reorderPlannerBlock(id, 1);
    else if (action === 'planner-remove') deletePlannerBlock(id);
    else if (action === 'account-login') openForm('account-login');
    else if (action === 'account-register') openForm('account-register');
    else if (action === 'account-resend') openForm('account-resend', id || document.getElementById('accountEmail')?.value || '');
    else if (action === 'password-forgot') openForm('password-forgot', document.getElementById('accountEmail')?.value || '');
    else if (action === 'auth-logout') {
      window.clearTimeout(accountSyncTimer);
      try {
        const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        if (!response.ok) throw new Error('logout_failed');
        window.location.reload();
      } catch {
        toast('Не удалось выйти из аккаунта', 'Проверьте соединение и повторите попытку.');
      }
    }
    else if (action === 'student-note') { const student = getStudent(id); const link = tutorLinkForStudent(id); if (student) { showModal(escapeHTML(student.name), 'Заметка доступна только в вашем профиле преподавателя.', `<form class="form-grid" data-form="student-note" data-id="${escapeHTML(id)}"><div class="form-field"><label for="editNote">Личная заметка</label><textarea class="form-textarea" id="editNote" name="note">${escapeHTML(link?.note || '')}</textarea></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button type="submit" class="button button-primary">Сохранить заметку</button></div></form>`); } }
    else if (action === 'student-edit') {
      const student = getStudent(id); const link = tutorLinkForStudent(id); if (!student) return;
      showModal('Изменить данные ученика', 'Общие данные и класс отобразятся в обоих кабинетах.', `<form class="form-grid" data-form="student-edit" data-id="${escapeHTML(id)}"><div class="form-field"><label for="studentEditName">Имя и фамилия</label><input class="form-control" id="studentEditName" name="name" value="${escapeHTML(student.name)}" required /></div><div class="form-field"><label for="studentEditEmail">Email</label><input class="form-control" id="studentEditEmail" type="email" value="${escapeHTML(student.email)}" disabled /><span class="form-hint">Ученик меняет email в своём профиле с подтверждением нового адреса.</span></div><div class="form-field"><label for="studentEditGrade">Класс</label><select class="form-control" id="studentEditGrade" name="grade"><option value="">Выберите класс</option>${Array.from({ length: 11 }, (_, index) => `<option value="${index + 1} класс" ${student.grade === `${index + 1} класс` ? 'selected' : ''}>${index + 1} класс</option>`).join('')}<option value="Студент" ${student.grade === 'Студент' ? 'selected' : ''}>Студент</option><option value="Другое" ${student.grade === 'Другое' ? 'selected' : ''}>Другое</option></select></div><div class="form-field"><label for="studentEditSubject">Предмет</label><input class="form-control" id="studentEditSubject" name="subject" value="${escapeHTML(student.subject || '')}" /></div><div class="form-field"><label for="studentEditPhone">Телефон</label><input class="form-control" id="studentEditPhone" name="phone" value="${escapeHTML(student.phone || '')}" /></div><div class="form-field"><label for="studentEditAbout">Дополнительная информация</label><textarea class="form-textarea" id="studentEditAbout" name="about">${escapeHTML(student.about || '')}</textarea></div><div class="form-field"><label for="studentEditNote">Личная заметка репетитора</label><textarea class="form-textarea" id="studentEditNote" name="note">${escapeHTML(link?.note || '')}</textarea></div><div class="form-actions"><button type="button" class="button button-danger" data-action="student-delete" data-id="${escapeHTML(id)}">Удалить из моего списка</button><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button type="submit" class="button button-primary">Сохранить</button></div></form>`);
    }
    else if (action === 'student-delete') {
      const student = getStudent(id); if (!student) return;
      if (!window.confirm(`Удалить ${student.name} из вашего списка? Аккаунт ученика останется активным.`)) return;
      const studentAccountId = student.id.slice('student-'.length);
      fetch('/api/tutor-students', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: studentAccountId }) }).then((response) => {
        if (!response.ok) { toast('Не удалось удалить ученика'); return; }
        state.tutorLinks = state.tutorLinks.filter((link) => !(link.tutorId === currentTutorId() && link.studentId === id));
        state.lessons = state.lessons.filter((lesson) => !(lesson.tutorId === currentTutorId() && lesson.studentId === id));
        persist(); closeModal(); renderStudents(); toast('Ученик удалён из вашего списка');
      }).catch(() => toast('Не удалось связаться с сервером'));
    }
    else if (action === 'profile') openForm('account-login');
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-form]'); if (!form) return;
    event.preventDefault();
    if (form.dataset.form === 'board-video-add') {
      const data = Object.fromEntries(new FormData(form).entries());
      const parsed = videoFromUrl(data.url);
      if (!parsed) { toast('Неподдерживаемая ссылка', 'Используйте ссылку на видео YouTube или Rutube.'); return; }
      const submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
      try {
        const response = await fetch('/api/videos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: parsed.url, title: String(data.title).trim() }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.video) { toast('Не удалось добавить видео', 'Проверьте ссылку и повторите попытку.'); return; }
        state.videos.unshift(result.video); closeModal(); addVideoToBoard(result.video.id); toast('Видео добавлено на доску');
      } catch { toast('Не удалось добавить видео', 'Проверьте соединение и повторите попытку.'); }
      finally { if (submit?.isConnected) submit.disabled = false; }
      return;
    }
    if (form.dataset.form === 'video-add') {
      const data = Object.fromEntries(new FormData(form).entries());
      const parsed = videoFromUrl(data.url);
      if (!parsed) { toast('Неподдерживаемая ссылка', 'Используйте ссылку на видео YouTube или Rutube.'); return; }
      const submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
      try {
        const response = await fetch('/api/videos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: parsed.url, title: String(data.title).trim() }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.video) { toast('Не удалось сохранить видеоурок', result.error === 'invalid_video' ? 'Проверьте ссылку и название.' : 'Сервис видеоуроков временно недоступен.'); return; }
        state.videos.unshift(result.video); renderVideos(); toast('Видеоурок сохранён');
      } catch { toast('Не удалось сохранить видеоурок', 'Проверьте соединение и повторите попытку.'); }
      finally { if (submit?.isConnected) submit.disabled = false; }
      return;
    }
    if (form.dataset.form === 'profile-edit') {
      const data = Object.fromEntries(new FormData(form).entries());
      fetch('/api/profile', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.name, grade: data.grade || '' }) }).then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { toast('Не удалось сохранить профиль', 'Проверьте заполненные поля.'); return; }
        const account = currentAccount(); account.name = result.profile.name;
        if (account.role === 'student') { const profile = getStudent(account.studentId); if (profile) profile.grade = result.profile.grade; }
        persist(); closeModal(); render(); toast('Профиль обновлён'); refreshLinkedAccounts();
      }).catch(() => toast('Не удалось связаться с сервером'));
      return;
    }
    if (form.dataset.form === 'email-change') {
      const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
      fetch('/api/profile/email', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { toast(result.error === 'email_in_use' ? 'Этот email уже используется' : 'Не удалось отправить подтверждение'); return; }
        toast('Письмо отправлено', `Откройте ссылку в письме на ${email}.`);
      }).catch(() => toast('Не удалось связаться с сервером'));
      return;
    }
    if (form.dataset.form === 'student-edit') {
      const student = getStudent(form.dataset.id); if (!student) return;
      const data = Object.fromEntries(new FormData(form).entries());
      const accountId = student.id.startsWith('student-') ? student.id.slice('student-'.length) : '';
      fetch(`/api/profile?account=${encodeURIComponent(accountId)}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.name, grade: data.grade, subject: data.subject, phone: data.phone, about: data.about }) }).then(async (response) => {
        if (!response.ok) { toast('Не удалось обновить ученика'); return; }
        Object.assign(student, { name: data.name, grade: data.grade, subject: data.subject, phone: data.phone, about: data.about });
        const link = tutorLinkForStudent(student.id); if (link) link.note = data.note;
        persist(); closeModal(); renderStudents(); toast('Данные ученика обновлены');
      }).catch(() => toast('Не удалось связаться с сервером'));
      return;
    }
    if (form.dataset.form === 'student-note') { const link = tutorLinkForStudent(form.dataset.id); if (link) { link.note = new FormData(form).get('note').trim(); persist(); closeModal(); if (currentView === 'students') renderStudents(); else render(); toast('Заметка сохранена'); } return; }
    submitForm(form);
  });
  document.addEventListener('change', async (event) => {
    const folderInput = event.target.closest('[data-storage-folder]');
    if (folderInput) {
      folderInput.disabled = true; const id = folderInput.dataset.storageFolder; const folder = folderInput.value.trim();
      try { const response = await fetch(`/api/files/${encodeURIComponent(id)}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder }) }); if (!response.ok) throw new Error(); const file = collaboration.files.find((item) => item.id === id); if (file) file.folder = folder; toast('Папка сохранена'); }
      catch { toast('Не удалось изменить папку'); } finally { folderInput.disabled = false; }
      return;
    }
    const input = event.target.closest('[data-video-assignment]');
    if (!input) return;
    input.disabled = true;
    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(input.dataset.videoAssignment)}/assignments`, { method: input.checked ? 'POST' : 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: input.value }) });
      if (!response.ok) throw new Error('assignment_failed');
      const video = state.videos.find((item) => item.id === input.dataset.videoAssignment);
      if (video) {
        video.assignedStudentIds ||= [];
        video.assignedStudentIds = input.checked ? [...new Set([...video.assignedStudentIds, input.value])] : video.assignedStudentIds.filter((id) => id !== input.value);
      }
      toast(input.checked ? 'Видеоурок прикреплён ученику' : 'Видеоурок откреплён');
    } catch { input.checked = !input.checked; toast('Не удалось изменить назначение'); }
    finally { input.disabled = false; }
  });
  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-video-id]');
    if (card) event.dataTransfer.setData('text/x-tutdesk-video', card.dataset.videoId);
  });
  document.addEventListener('dragover', (event) => {
    if (event.target.closest('.board-canvas-wrap') && event.dataTransfer.types.includes('text/x-tutdesk-video')) event.preventDefault();
  });
  document.addEventListener('drop', (event) => {
    const wrap = event.target.closest('.board-canvas-wrap');
    const id = event.dataTransfer.getData('text/x-tutdesk-video');
    if (!wrap || !id) return;
    event.preventDefault();
    const rect = (wrap.querySelector('.board-surface') || wrap).getBoundingClientRect();
    addVideoToBoard(id, Math.max(0, Math.min(2.6, (event.clientX - rect.left) / rect.width * 3)), Math.max(0, Math.min(2.6, (event.clientY - rect.top) / rect.height * 3)));
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
    if (event.target.matches('[data-note-title],[data-note-body]')) {
      const id = event.target.dataset.noteTitle || event.target.dataset.noteBody; const note = currentNotes().find((item) => item.id === id);
      if (note) { if (event.target.dataset.noteTitle) note.title = event.target.value.slice(0, 120); else note.body = event.target.value.slice(0, 50000); note.updatedAt = Date.now(); persist(); }
    }
  });
  document.addEventListener('click', (event) => {
    const dateInput = event.target.closest('input[type="date"]');
    if (dateInput && typeof dateInput.showPicker === 'function') { try { dateInput.showPicker(); } catch { /* browser may block the picker */ } }
  });
  function filterStudents() {
    const search = (document.getElementById('studentSearch')?.value || '').toLowerCase().trim();
    const subject = document.getElementById('subjectFilter')?.value || 'all';
    document.querySelectorAll('[data-student-card]').forEach((card) => { card.hidden = !(card.dataset.name.includes(search) && (subject === 'all' || card.dataset.subject === subject)); });
  }
  let backdropPointerStarted = false;
  modalBackdrop.addEventListener('pointerdown', (event) => {
    backdropPointerStarted = event.target === modalBackdrop;
  });
  modalBackdrop.addEventListener('pointercancel', () => { backdropPointerStarted = false; });
  modalBackdrop.addEventListener('click', (event) => {
    const startedOnBackdrop = backdropPointerStarted;
    backdropPointerStarted = false;
    if (!startedOnBackdrop || event.target !== modalBackdrop) return;
    if (window.getSelection?.().toString()) return;
    closeModal();
  });
  const isBoardTypingTarget = (target) => target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || !modalBackdrop.hidden;
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('.message-compose textarea') && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault(); if (event.target.value.trim()) event.target.form?.requestSubmit(); return;
    }
    if (event.key === 'Escape' && !modalBackdrop.hidden) { closeModal(); return; }
    if (currentView !== 'board' || isBoardTypingTarget(event.target)) return;
    const modifier = event.ctrlKey || event.metaKey; const key = event.key.toLowerCase();
    if (modifier && key === 'z') { event.preventDefault(); event.shiftKey ? redoBoard() : undoBoard(); return; }
    if (modifier && key === 'y') { event.preventDefault(); redoBoard(); return; }
    if (event.code === 'Space') { event.preventDefault(); boardSpaceDown = true; const canvas = document.getElementById('whiteboard'); if (canvas && !boardPanState) canvas.style.cursor = 'grab'; return; }
    if (event.key === 'Escape') {
      if (boardSelectedId || boardDrawing || boardResizeState) { boardSelectedId = null; boardDrawing = false; boardResizeState = null; redrawBoard(); return; }
      if (document.querySelector('.app-shell')?.classList.contains('is-board-expanded')) {
        document.querySelector('.app-shell').classList.remove('is-board-expanded'); const button = document.querySelector('[data-action="board-fullscreen"]');
        if (button) { button.setAttribute('aria-pressed', 'false'); button.textContent = '⛶ Во весь экран'; } window.requestAnimationFrame(setupBoard);
      }
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && boardSelectedId) {
      event.preventDefault(); const board = currentBoard(); if (board) { pushBoardHistory(board); board.elements = board.elements.filter((item) => item.id !== boardSelectedId); boardSelectedId = null; saveBoard(board); renderBoard(); } return;
    }
    if (modifier || event.altKey) return;
    const tools = { v: 'select', h: 'hand', p: 'pen', t: 'text', n: 'sticky', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', e: 'eraser' };
    if (tools[key]) { event.preventDefault(); setBoardTool(tools[key]); }
  });
  document.addEventListener('keyup', (event) => { if (event.code === 'Space') { boardSpaceDown = false; const canvas = document.getElementById('whiteboard'); if (canvas && !boardPanState) canvas.style.cursor = boardTool === 'hand' ? 'grab' : boardTool === 'select' ? 'default' : 'crosshair'; } });
  window.addEventListener('resize', () => { if (currentView === 'board') setupBoard(); });

  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('tutdesk-theme') === 'dark' ? 'dark' : 'light'; } catch (_) { /* storage can be disabled */ }
  applyTheme(savedTheme, false);
  initializeAuth();
})();
