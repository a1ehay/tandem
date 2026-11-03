(() => {
  const STORAGE_KEY = 'tandem-tutor-prototype-v2';
  const LEGACY_STORAGE_KEY = 'tandem-tutor-prototype-v1';
  const pageNames = { overview: 'Обзор', students: 'Ученики', lessons: 'Занятия', board: 'Интерактивная доска', tasks: 'Задания', subscription: 'Тарифы', room: 'Видеокомната' };
  const initialsByColor = ['avatar--mint', 'avatar--lilac', 'avatar--sky', 'avatar--rose', 'avatar--gold'];
  const pad = (value) => String(value).padStart(2, '0');
  const dateToISO = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const addDaysISO = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return dateToISO(date); };
  const PROFILE_RESET_KEY = 'tutdesk-profile-reset-v1';
  const sampleState = () => ({
    plan: 'light', students: [], lessons: [], tasks: [], currentAccountId: null,
    accounts: [], tutorLinks: [], boards: [], currentBoardId: null, plannerByTutor: {},
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
        accounts: Array.isArray(value.accounts) ? value.accounts : [],
        tutorLinks: Array.isArray(value.tutorLinks) ? value.tutorLinks : [],
        boards: Array.isArray(value.boards) ? value.boards : [],
        plannerByTutor: value.plannerByTutor && typeof value.plannerByTutor === 'object' ? value.plannerByTutor : {},
        currentAccountId: typeof value.currentAccountId === 'string' ? value.currentAccountId : null,
        currentBoardId: typeof value.currentBoardId === 'string' ? value.currentBoardId : null,
      };
    } catch (_) { return sampleState(); }
  };
  try {
    if (!localStorage.getItem(PROFILE_RESET_KEY)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.setItem(PROFILE_RESET_KEY, 'done');
    }
  } catch (_) { /* storage can be disabled */ }
  const state = loadState();
  let authenticatedAccountId = null;
  let accountDataReady = false;
  let accountSyncTimer = null;
  let accountSyncFailed = false;
  let activeConferenceId = null;
  let currentView = 'overview';
  let taskFilter = 'all';
  let boardTool = 'pen';
  let boardColor = '#314a2e';
  let boardWidth = 3;
  let boardHistory = [];
  let boardDrawing = false;
  let lastPoint = null;
  let boardPointerStart = null;
  let boardDragElementId = null;
  let boardDraftId = null;
  let boardSelectedId = null;
  let boardDirty = false;
  let boardTextPosition = null;
  let localCameraStream = null;
  let localMicStream = null;
  let screenStream = null;
  let liveKitRoom = null;
  let screenShareEnabled = false;
  let cameraEnabled = false;
  let micEnabled = false;
  let meetingTimer = null;
  let meetingStartedAt = 0;
  const pageContent = document.getElementById('pageContent');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalCard = document.getElementById('modalCard');
  const sidebar = document.getElementById('sidebar');

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const useIcon = (name, cls = '') => `<svg${cls ? ` class="${cls}"` : ''}><use href="#i-${name}"/></svg>`;
  function applyTheme(theme, save = true) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = dark ? '#121815' : '#f5f6f4';
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
    try { serialized = JSON.stringify(state); } catch (_) { return; }
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
  function accountModel(account) {
    return {
      id: account.id,
      role: account.role,
      name: account.name || 'Пользователь',
      email: account.email || '',
      studentId: account.role === 'student' ? (account.studentId || `student-${account.id}`) : null,
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
    for (const key of ['students', 'lessons', 'tasks', 'tutorLinks', 'boards']) {
      restored[key] = Array.isArray(restored[key])
        ? restored[key].filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        : [];
    }
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
    restored.accounts = [{ ...savedAccounts.find((item) => item.id === model.id), ...model }];
    restored.currentAccountId = model.id;
    if (model.role === 'student' && !restored.students.some((student) => student.id === model.studentId)) {
      restored.students.push({ id: model.studentId, name: model.name, email: model.email, subject: '', grade: '', note: '', lessons: 0, progress: 0, color: 0 });
    }
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, restored);
  }
  async function activateAccount(account) {
    if (!account?.id) throw new Error('account_missing');
    authenticatedAccountId = account.id;
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
    currentView = activeConferenceId ? 'room' : 'overview';
    closeModal();
    render();
    if (!account.role) openAccountRoleForm(account);
    else if (accountDataReady && !savedData) persist();
  }
  function openAccountRoleForm(account) {
    showModal('Настроить личный кабинет', 'Выберите роль — её можно будет использовать для настройки рабочего пространства.', `<form class="form-grid" data-form="auth-role"><div class="form-field"><label for="authAccountName">Имя</label><input class="form-control" id="authAccountName" name="name" value="${escapeHTML(account.name || '')}" required maxlength="80" /></div><div class="form-field"><label for="authAccountRole">Я в Tutdesk</label><select class="form-control" id="authAccountRole" name="role" required><option value="tutor">Репетитор</option><option value="student">Ученик</option></select></div><div class="account-note">Профиль будет связан с этим способом входа. Пароль Tutdesk не хранит.</div><div class="form-actions"><button class="button button-primary" type="submit">Продолжить</button></div></form>`);
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
  const nextLesson = () => {
    const studentIds = isStudentAccount() ? [currentAccount()?.studentId] : linkedStudentIds();
    return state.lessons.filter((lesson) => studentIds.includes(lesson.studentId) && lesson.date >= addDaysISO(0)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
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
    const day = new Date(`${lesson.date}T12:00:00`).getDate();
    const month = new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(`${lesson.date}T12:00:00`)).replace('.', '');
    return `<article class="lesson-feature"><div class="lesson-date-chip"><strong>${pad(day)}</strong><span>${month}</span></div><div><div class="lesson-title">${escapeHTML(lesson.title)}</div><div class="lesson-meta"><span>${useIcon('clock')}${escapeHTML(lesson.time)} · ${lesson.duration} мин</span><span>${useIcon('users')}${escapeHTML(student?.subject || 'Занятие')}</span></div><div class="lesson-participants">${studentAvatar(student, 'mini-avatar')}<span class="mini-avatar mini-avatar--peach">А</span><span class="participant-caption">Вы и ${escapeHTML(student?.name || 'ученик')}</span></div></div><button class="button button-primary lesson-start" data-action="start-lesson" data-id="${escapeHTML(lesson.id)}">${useIcon('video')} Войти</button></article>`;
  };

  function renderLightOverview() {
    const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const firstName = currentAccount()?.name.split(' ')[0] || 'Репетитор';
    pageContent.innerHTML = `<div class="page-heading"><div><div class="heading-kicker">${escapeHTML(today)}</div><h1>Доброе утро, ${escapeHTML(firstName)} <span class="heading-wave">✳</span></h1><p>Комната и доска готовы к следующему занятию.</p></div><div class="heading-actions"><button class="button button-light" data-view="board">${useIcon('board')} Открыть доску</button><button class="button button-primary" data-action="start-lesson">${useIcon('video')} Начать созвон</button></div></div><section class="welcome-banner"><div class="welcome-copy"><div class="eyebrow-green">TUTDESK LIGHT</div><h2>Ваше место для живых уроков.</h2><p>Встречайтесь с учеником по ссылке, включайте камеру и разбирайте задачи на интерактивной доске.</p></div><div class="welcome-action"><span class="banner-note">Созвон и доска включены</span><button class="button button-lime" data-action="start-lesson">Открыть комнату ${useIcon('arrow')}</button></div></section><section class="stats-grid"><article class="stat-card"><div><div class="stat-label">Видеокомната</div><div class="stat-value">Готова</div><div class="stat-hint">Созвон, камера и микрофон</div></div><span class="stat-icon">${useIcon('video')}</span></article><article class="stat-card"><div><div class="stat-label">Демонстрация экрана</div><div class="stat-value">Доступна</div><div class="stat-hint">Показывайте материалы ученику</div></div><span class="stat-icon stat-icon--blue">${useIcon('monitor')}</span></article><article class="stat-card"><div><div class="stat-label">Интерактивная доска</div><div class="stat-value">Сохранена</div><div class="stat-hint">Можно продолжить в любое время</div></div><span class="stat-icon stat-icon--orange">${useIcon('board')}</span></article></section><div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h3>Начните занятие</h3><p>Откройте комнату и пригласите ученика по ссылке.</p></div>${useIcon('video')}</div><div class="light-feature-card"><div class="light-feature-icon">${useIcon('users')}</div><div><strong>Комната для урока</strong><span>Видео и экран включаются с вашего устройства</span></div><button class="button button-primary button-small" data-action="start-lesson">Войти</button></div></section><section class="panel"><div class="panel-heading"><div><h3>Работайте на доске</h3><p>Материалы доски сохраняются в личном кабинете.</p></div>${useIcon('board')}</div><div class="light-feature-card light-feature-card--board"><div class="light-feature-icon">${useIcon('edit')}</div><div><strong>Общая доска занятия</strong><span>Рисуйте и возвращайтесь к материалам</span></div><button class="button button-light button-small" data-view="board">Открыть</button></div></section></div><section class="students-strip plan-teaser"><div class="students-strip-head"><h3>Нужно больше инструментов?</h3><button class="subtle-link" data-view="subscription">Сравнить тарифы →</button></div><div class="plan-teaser-copy">В Extreme появятся карточки учеников, расписание и домашние задания с копированием для других подопечных.</div></section>`;
  }

  function renderFeatureGate(title, description, items) {
    pageContent.innerHTML = `${pageHeading('ВОЗМОЖНОСТИ EXTREME', title, description)}<section class="feature-gate"><span class="feature-gate-icon">${useIcon('spark')}</span><div><h2>Этот раздел входит в Extreme.</h2><p>Откройте инструменты для работы с учениками и занятиями. Раздел включён в план Extreme и доступен после его выбора.</p></div><div class="feature-gate-list">${items.map((item) => `<span>${useIcon('check')}${escapeHTML(item)}</span>`).join('')}</div><div class="feature-gate-actions"><button class="button button-primary" data-action="choose-plan" data-plan="extreme">Выбрать Extreme</button><button class="button button-light" data-view="subscription">Сравнить тарифы</button></div></section>`;
  }

  function renderOverview() {
    if (isStudentAccount()) { renderStudentOverview(); return; }
    if (currentPlan() !== 'extreme') { renderLightOverview(); return; }
    const upcoming = nextLesson();
    const tutorTasks = tasksForCurrentTutor();
    const activeTasks = tutorTasks.filter((task) => task.status !== 'complete').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 2);
    const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const firstName = currentAccount()?.name.split(' ')[0] || 'Репетитор';
    const lessonCount = currentTutorLessons().filter((lesson) => lesson.date >= addDaysISO(0)).length;
    const taskPreview = currentPlan() === 'extreme'
      ? `<section class="panel"><div class="panel-heading"><div><h3>Задачи на контроле</h3><p>Ваши дела и домашние задания</p></div><button class="subtle-link" data-view="tasks">Все задачи →</button></div><div class="deadline-list">${activeTasks.length ? activeTasks.map((task) => `<div class="deadline-item"><span class="deadline-mark ${task.status === 'submitted' ? 'deadline-mark--green' : ''}">${useIcon(task.status === 'submitted' ? 'check' : 'clock')}</span><div class="deadline-copy"><strong>${escapeHTML(task.title)}</strong><span>${task.kind === 'personal' ? 'Личная задача' : `${escapeHTML(studentName(task.studentId))} · ${escapeHTML(taskStatusLabel(task.status))}`}</span></div><span class="deadline-time ${task.status === 'submitted' ? 'deadline-time--green' : ''}">${escapeHTML(dueLabel(task.due))}</span></div>`).join('') : `<div class="empty-state"><strong>Пока всё спокойно</strong>Открытых задач нет.</div>`}</div></section>`
      : `<section class="panel"><div class="panel-heading"><div><h3>Домашние задания</h3><p>Планируйте задания и следите за ответами</p></div>${useIcon('check')}</div><div class="locked-promo"><div class="locked-promo-icon">${useIcon('spark')}</div><div><strong>Больше порядка между уроками</strong><p>Задания, проверка ответов и копирование для других учеников доступны в Extreme.</p></div><button class="button button-light button-small" data-view="subscription">Узнать о тарифе</button></div></section>`;
    pageContent.innerHTML = `
      <div class="page-heading"><div><div class="heading-kicker">${escapeHTML(today)}</div><h1>Доброе утро, ${escapeHTML(firstName)} <span class="heading-wave">✳</span></h1><p>Ваше пространство для уроков и спокойной работы с учениками.</p></div><div class="heading-actions"><button class="button button-light" data-action="open-modal" data-modal="lesson">${useIcon('plus')} Запланировать</button><button class="button button-primary" data-action="start-lesson">${useIcon('video')} Начать урок</button></div></div>
      <section class="welcome-banner"><div class="welcome-copy"><div class="eyebrow-green">ВАШЕ ПРОСТРАНСТВО ДЛЯ УРОКОВ</div><h2>Хороший урок начинается<br class="desktop-break"/> с удобного места.</h2><p>Встречайтесь, объясняйте сложное на доске и возвращайтесь к материалам, когда удобно.</p></div><div class="welcome-action"><span class="banner-note">Всё готово к следующему занятию</span><button class="button button-lime" data-action="start-lesson">Перейти в комнату ${useIcon('arrow')}</button></div></section>
      <section class="stats-grid"><article class="stat-card"><div><div class="stat-label">Мои ученики</div><div class="stat-value">${currentTutorStudents().length}</div><div class="stat-hint"><strong>${currentTutorStudents().length ? 'Отличная команда' : 'Добавьте первого ученика'}</strong></div></div><span class="stat-icon">${useIcon('users')}</span></article><article class="stat-card"><div><div class="stat-label">Ближайшие занятия</div><div class="stat-value">${lessonCount}</div><div class="stat-hint">В расписании на ближайшее время</div></div><span class="stat-icon stat-icon--blue">${useIcon('calendar')}</span></article><article class="stat-card"><div><div class="stat-label">Задания на контроле</div><div class="stat-value">${activeTasks.length}</div><div class="stat-hint">Личные и ученические задачи</div></div><span class="stat-icon stat-icon--orange">${useIcon('check')}</span></article></section>
      <div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h3>Следующее занятие</h3><p>${upcoming ? `${escapeHTML(dateLabel(upcoming.date))} · ${escapeHTML(upcoming.time)}` : 'Добавьте занятие в расписание'}</p></div><button class="subtle-link" data-view="lessons">Расписание →</button></div>${upcoming ? lessonCard(upcoming) : `<div class="empty-state"><strong>В расписании пока пусто</strong>Запланируйте первое занятие.</div>`}</section>${taskPreview}</div>
      <section class="students-strip"><div class="students-strip-head"><h3>Ваши ученики</h3><button class="subtle-link" data-view="students">Все ученики →</button></div><div class="student-mini-grid">${currentTutorStudents().slice(0, 3).map((student) => `<article class="student-mini">${studentAvatar(student)}<div class="student-mini-copy"><strong>${escapeHTML(student.name)}</strong><span>${escapeHTML(student.subject)} · ${escapeHTML(student.grade)}</span></div></article>`).join('') || `<div class="empty-state"><strong>Пока нет учеников</strong>Добавьте первого ученика, чтобы запланировать занятие.</div>`}</div></section>`;
  }

  function renderStudentOverview() {
    const account = currentAccount(); const profile = getStudent(account.studentId); const tasks = tasksForCurrentStudent();
    const tutors = state.tutorLinks.filter((link) => link.studentId === account.studentId).map((link) => getAccount(link.tutorId)).filter(Boolean);
    const next = nextLesson();
    const lessonPanel = next
      ? `<section class="panel student-next-lesson"><div class="panel-heading"><div><h3>Следующее занятие</h3><p>${escapeHTML(dateLabel(next.date))} · ${escapeHTML(next.time)}</p></div>${useIcon('video')}</div><div class="light-feature-card"><div class="light-feature-icon">${useIcon('calendar')}</div><div><strong>${escapeHTML(next.title)}</strong><span>${escapeHTML(getAccount(next.tutorId)?.name || 'Репетитор')} · ${next.duration} мин</span></div><button class="button button-primary button-small" data-action="start-lesson" data-id="${escapeHTML(next.id)}">Подключиться</button></div></section>`
      : `<section class="panel student-next-lesson"><div class="panel-heading"><div><h3>Следующее занятие</h3><p>Когда репетитор добавит урок, здесь появится кнопка входа.</p></div>${useIcon('video')}</div><div class="empty-state"><strong>Предстоящих занятий нет</strong>Попросите репетитора запланировать урок в вашем расписании.</div></section>`;
    pageContent.innerHTML = `${pageHeading('КАБИНЕТ УЧЕНИКА', `Здравствуйте, ${escapeHTML(account.name.split(' ')[0])}.`, 'Ваши занятия, доски и домашняя работа собраны здесь.')}<section class="welcome-banner"><div class="welcome-copy"><div class="eyebrow-green">МОЙ УЧЕБНЫЙ ПРОГРЕСС</div><h2>${escapeHTML(profile?.subject || 'Учёба')} — шаг за шагом.</h2><p>Открывайте сохранённые доски и следите за заданиями от разных репетиторов.</p></div><div class="welcome-action"><button class="button button-lime" data-view="tasks">Мои задания ${useIcon('arrow')}</button></div></section><section class="stats-grid"><article class="stat-card"><div><div class="stat-label">Мои репетиторы</div><div class="stat-value">${tutors.length}</div><div class="stat-hint">Каждый ведёт занятия отдельно</div></div><span class="stat-icon">${useIcon('users')}</span></article><article class="stat-card"><div><div class="stat-label">Нужно сдать</div><div class="stat-value">${tasks.filter((task) => task.status !== 'complete').length}</div><div class="stat-hint">Домашние задания</div></div><span class="stat-icon stat-icon--orange">${useIcon('check')}</span></article><article class="stat-card"><div><div class="stat-label">Следующий урок</div><div class="stat-value">${next ? escapeHTML(next.time) : '—'}</div><div class="stat-hint">${next ? escapeHTML(dateLabel(next.date)) : 'Расписание пока пусто'}</div></div><span class="stat-icon stat-icon--blue">${useIcon('calendar')}</span></article></section>${lessonPanel}<div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h3>Мои репетиторы</h3><p>Один ученик может заниматься у нескольких преподавателей</p></div></div><div class="deadline-list">${tutors.map((tutor) => `<div class="deadline-item"><span class="avatar avatar--mint">${escapeHTML(initials(tutor.name))}</span><div class="deadline-copy"><strong>${escapeHTML(tutor.name)}</strong><span>${escapeHTML(tutor.email)}</span></div><span class="status-pill">Репетитор</span></div>`).join('') || '<div class="empty-state"><strong>Пока нет связанных репетиторов</strong>Попросите преподавателя добавить ваш адрес электронной почты.</div>'}</div></section><section class="panel"><div class="panel-heading"><div><h3>Последние задания</h3><p>От всех ваших репетиторов</p></div><button class="subtle-link" data-view="tasks">Все задания →</button></div><div class="deadline-list">${tasks.slice(0, 3).map((task) => `<div class="deadline-item"><span class="deadline-mark">${useIcon('check')}</span><div class="deadline-copy"><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(getAccount(task.tutorId)?.name || 'Репетитор')} · ${escapeHTML(taskStatusLabel(task.status))}</span></div><span class="deadline-time">${escapeHTML(dueLabel(task.due))}</span></div>`).join('') || '<div class="empty-state"><strong>Заданий пока нет</strong></div>'}</div></section></div><section class="students-strip"><div class="students-strip-head"><h3>Доски занятий</h3><button class="subtle-link" data-view="board">Открыть доски →</button></div><div class="plan-teaser-copy">Сохранённые доски прикреплены к занятиям. Если у нескольких занятий одна доска, вы продолжите с того же места.</div></section>`;
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
    return `<article class="student-card" data-student-card data-name="${escapeHTML(student.name.toLowerCase())}" data-subject="${escapeHTML(student.subject)}"><div class="student-card-top"><div class="student-card-person">${studentAvatar(student)}<div><h3>${escapeHTML(student.name)}</h3><p>${escapeHTML(student.subject)} · ${escapeHTML(student.grade)}</p></div></div><button class="card-more" data-action="student-note" data-id="${escapeHTML(student.id)}" aria-label="Заметка об ученике">${useIcon('more')}</button></div><p class="student-card-note">${escapeHTML(note || 'Добавьте личную заметку об ученике.')}</p><div class="student-card-stats"><span>Проведено уроков</span><strong>${lessonCount}</strong></div><div class="progress-track"><span style="width:${Math.min(100, Math.max(0, Number(link?.progress) || 0))}%"></span></div></article>`;
  }

  function renderLessons() {
    if (isStudentAccount()) { renderStudentOverview(); return; }
    if (currentPlan() !== 'extreme') { renderFeatureGate('Планирование занятий.', 'Соберите расписание и открывайте комнату для каждого урока по одному нажатию.', ['Расписание по датам', 'Темы занятий', 'Длительность урока', 'Быстрый вход в комнату']); return; }
    const actions = `<button class="button button-primary" data-action="open-modal" data-modal="lesson">${useIcon('plus')} Запланировать занятие</button>`;
    const ordered = currentTutorLessons().slice().sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    const groups = ordered.reduce((acc, lesson) => { (acc[lesson.date] ||= []).push(lesson); return acc; }, {});
    const content = Object.keys(groups).map((date) => `<div class="list-date-heading">${escapeHTML(dateLabel(date))} · ${escapeHTML(formatDate(date, { day: 'numeric', month: 'long' }))}</div>${groups[date].map((lesson) => lessonRow(lesson)).join('')}`).join('');
    pageContent.innerHTML = `${pageHeading('РАСПИСАНИЕ', 'Ваши занятия.', 'Планируйте уроки и открывайте комнату по одному нажатию.', actions)}<div class="lesson-list">${content || `<div class="empty-state"><strong>Занятий пока нет</strong>Добавьте занятие, чтобы собрать своё расписание.</div>`}</div>`;
  }
  function lessonRow(lesson) {
    const student = getStudent(lesson.studentId);
    return `<article class="lesson-list-row"><div class="time-column">${escapeHTML(lesson.time)}<small>${lesson.duration} мин</small></div><div class="lesson-row-main"><i class="lesson-subject-dot ${student?.subject === 'Физика' ? 'lesson-subject-dot--lilac' : student?.subject === 'Английский' ? 'lesson-subject-dot--orange' : ''}"></i><div><strong>${escapeHTML(lesson.title)}</strong><span>${escapeHTML(student?.name || 'Ученик')} · ${escapeHTML(student?.subject || 'Занятие')}</span></div></div><div class="lesson-row-actions"><span class="status-pill">Запланировано</span><button class="button button-light button-small" data-action="lesson-board" data-id="${escapeHTML(lesson.id)}">${useIcon('board')} Доска</button><button class="button button-light button-small" data-action="start-lesson" data-id="${escapeHTML(lesson.id)}">${useIcon('video')} Войти</button></div></article>`;
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
    pageContent.innerHTML = `${pageHeading('МОИ ЗАДАНИЯ', 'Домашняя работа.', 'Здесь собраны задания от ваших репетиторов.')}<div class="task-list student-task-list">${tasks.map((task) => `<article class="task-card"><button class="task-check ${task.status === 'complete' ? 'is-complete' : ''}" data-action="student-task-status" data-id="${escapeHTML(task.id)}" title="${task.status === 'complete' ? 'Проверено репетитором' : 'Отметить готовым'}" ${task.status === 'complete' ? 'disabled' : ''}>${useIcon(task.status === 'complete' ? 'check' : 'clock')}</button><div class="task-main"><h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(task.description || '')}</p><div class="task-tags"><span class="tag tag--subject">${escapeHTML(task.subject || 'Задание')}</span><span class="tag">Репетитор: ${escapeHTML(getAccount(task.tutorId)?.name || 'Ваш репетитор')}</span><span class="tag">До ${escapeHTML(dueLabel(task.due))}</span></div></div></article>`).join('') || `<div class="empty-state"><strong>Новых заданий пока нет</strong>Когда репетитор назначит работу, она появится здесь.</div>`}</div>`;
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
  }
  function taskCard(task) {
    const personal = task.kind === 'personal';
    const isLate = task.status === 'todo' && Boolean(task.due) && task.due < addDaysISO(0);
    const tagClass = task.status === 'submitted' ? 'tag--submitted' : isLate ? 'tag--overdue' : 'tag--subject';
    const statusSuffix = task.status === 'submitted' ? ' · Сдано' : task.status === 'complete' ? ' · Проверено' : '';
    const assignmentTag = personal ? '<span class="tag">Личная задача · только для вас</span>' : `<span class="tag">${escapeHTML(studentName(task.studentId))}${statusSuffix}</span>`;
    return `<article class="task-card"><button class="task-check ${task.status === 'complete' ? 'is-complete' : ''}" data-action="task-status" data-id="${escapeHTML(task.id)}" title="Изменить статус">${useIcon(task.status === 'complete' ? 'check' : 'clock')}</button><div class="task-main"><h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(task.description || 'Нет описания')}</p><div class="task-tags"><span class="tag ${personal ? '' : tagClass}">${escapeHTML(task.subject || (personal ? 'Личное' : 'Задание'))}</span>${assignmentTag}<span class="tag ${isLate ? 'tag--overdue' : ''}">${isLate ? 'Срок прошёл' : escapeHTML(dueLabel(task.due))}</span></div></div><div class="task-actions">${personal ? '' : `<button class="tiny-action" data-action="copy-task" data-id="${escapeHTML(task.id)}" title="Копировать ученику">${useIcon('copy')}</button>`}</div></article>`;
  }

  function renderSubscription() {
    const isExtreme = currentPlan() === 'extreme';
    const planButton = (plan) => currentPlan() === plan ? `<button class="button button-light button-full" disabled>Выбран</button>` : `<button class="button ${plan === 'extreme' ? 'button-primary' : 'button-light'} button-full" data-action="choose-plan" data-plan="${plan}">Выбрать ${plan === 'light' ? 'Light' : 'Extreme'}</button>`;
    const feature = (text, included = true) => `<li class="${included ? '' : 'muted-feature'}"><span class="feature-check">${included ? useIcon('check') : useIcon('close')}</span>${text}</li>`;
    pageContent.innerHTML = `<section class="pricing-intro"><span class="heading-kicker">ТАРИФЫ TUTDESK</span><h1>Ваш формат. Ваш темп.</h1><p>Начните с созвонов и доски. Когда понадобится больше — добавьте инструменты для всей учебной работы.</p><div class="billing-switch"><span class="save-badge">Платная подписка: цены и период оплаты определим позже</span></div></section><div class="pricing-grid"><article class="price-card ${!isExtreme ? 'price-card--featured' : ''}">${!isExtreme ? '<span class="popular-badge">ТЕКУЩИЙ ПЛАН</span>' : ''}<div class="price-plan-head"><h2 class="price-plan-title">Light</h2><span class="price-icon">${useIcon('video')}</span></div><p class="price-description">Всё необходимое, чтобы встретиться и провести хороший урок.</p><div class="price-value">—<small> · цена не задана</small></div><div class="price-period">Подписка Light будет платной</div><div class="price-divider"></div><div class="feature-heading">В тарифе</div><ul class="feature-list">${feature('Видеозвонки с учениками')}${feature('Камера, микрофон и демонстрация экрана')}${feature('Интерактивная доска для совместной работы')}${feature('Сохранение и редактирование доски')}${feature('Занятия по ссылке')}</ul>${planButton('light')}</article><article class="price-card ${isExtreme ? 'price-card--featured' : ''}">${isExtreme ? '<span class="popular-badge">ТЕКУЩИЙ ПЛАН</span>' : '<span class="popular-badge">ВСЁ ДЛЯ РАБОТЫ</span>'}<div class="price-plan-head"><h2 class="price-plan-title">Extreme</h2><span class="price-icon">${useIcon('spark')}</span></div><p class="price-description">Все возможности Light плюс инструменты для ведения учеников и заданий.</p><div class="price-value">—<small> · цена не задана</small></div><div class="price-period">Подписка Extreme будет платной</div><div class="price-divider"></div><div class="feature-heading">Всё из Light, а ещё</div><ul class="feature-list">${feature('Карточки учеников и заметки')}${feature('Планирование занятий')}${feature('Менеджер личных задач и домашней работы')}${feature('Копирование задания для другого ученика')}${feature('Сроки, ответы, статусы и проверка')}</ul>${planButton('extreme')}</article></div><div class="included-strip"><span class="price-icon">${useIcon('card')}</span><span><strong>Две версии подписки: Light и Extreme.</strong> План Extreme открывает все инструменты для ведения учеников и занятий.</span></div><p class="plan-footnote">Стоимость планов и подключение оплаты будут настроены отдельно.</p>`;
  }

  function renderBoard() {
    if (!state.boards.length) createBoard('Новая доска');
    const boards = state.boards.filter((board) => isStudentAccount()
      ? board.lessonIds.some((lessonId) => state.lessons.some((lesson) => lesson.id === lessonId && lesson.studentId === currentAccount()?.studentId))
      : board.tutorId === currentTutorId());
    if (!boards.length) { pageContent.innerHTML = isStudentAccount() ? `${pageHeading('ДОСКИ ЗАНЯТИЙ', 'Здесь появятся ваши доски.', 'Доска станет доступна, когда репетитор закрепит её за занятием.')}<div class="empty-state board-empty-state">${useIcon('board')}<strong>Пока нет доступных досок</strong>Попросите репетитора открыть или закрепить общую доску за вашим уроком.</div>` : `${pageHeading('ДОСКА ЗАНЯТИЯ', 'Создайте первую доску.', 'Каждая доска хранит собственные элементы и может быть привязана к одному или нескольким занятиям.', `<button class="button button-primary" data-action="board-new">${useIcon('plus')} Новая доска</button>`)}<div class="empty-state board-empty-state">${useIcon('board')}<strong>У вас пока нет досок</strong>Создайте доску, чтобы начать работу.</div>`; return; }
    const board = boards.find((item) => item.id === state.currentBoardId) || boards[0] || state.boards[0];
    if (board) state.currentBoardId = board.id;
    const lessonOptions = currentTutorLessons().map((lesson) => `<option value="${escapeHTML(lesson.id)}">${escapeHTML(dateLabel(lesson.date))} · ${escapeHTML(lesson.title)}</option>`).join('');
    const boardLessons = board?.lessonIds.map((lessonId) => state.lessons.find((lesson) => lesson.id === lessonId)).filter(Boolean) || [];
    const actions = `<button class="button button-light button-small" data-action="board-new">${useIcon('plus')} Новая доска</button><button class="button button-light button-small" data-action="board-export">${useIcon('download')} Скачать</button>`;
    const tool = (name, icon, label, title = label) => `<button class="board-tool ${boardTool === name ? 'active' : ''}" data-action="board-tool" data-tool="${name}" title="${title}" aria-label="${title}">${useIcon(icon)}<span class="board-tool-label">${label}</span></button>`;
    pageContent.innerHTML = `${pageHeading('ДОСКА ЗАНЯТИЯ', 'Общее пространство для идей.', 'Стирайте целые элементы, добавляйте фигуры и продолжайте на той же доске.', actions)}<div class="board-layout"><section class="board-workspace"><div class="board-contextbar"><div class="board-context-title">${useIcon('board')}<select id="boardSelect" aria-label="Выбрать доску">${boards.map((item) => `<option value="${escapeHTML(item.id)}" ${item.id === board?.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></div><span class="board-associated-count">${boardLessons.length ? `${boardLessons.length} ${boardLessons.length === 1 ? 'занятие' : 'занятия'} используют эту доску` : 'Пока не привязана к занятию'}</span></div><div class="board-toolbar"><div class="tool-group">${tool('select', 'mouse', 'Выбор')}${tool('pen', 'edit', 'Ручка')}</div><span class="tool-divider"></span><div class="tool-group">${tool('line', 'arrow', 'Линия')}${tool('rect', 'square', 'Прямоуг.')}${tool('ellipse', 'circle', 'Овал')}${tool('arrow', 'arrow', 'Стрелка')}</div><span class="tool-divider"></span><div class="tool-group">${tool('text', 'type', 'Текст')}${tool('sticky', 'sticky', 'Стикер')}${tool('eraser', 'trash', 'Ластик', 'Ластик удаляет элемент целиком')}</div><span class="tool-divider"></span><label class="color-input-label" title="Цвет элемента"><input class="color-input" type="color" id="boardColor" value="${boardColor}" aria-label="Цвет элемента" /></label><input class="brush-size" type="range" id="brushSize" min="1" max="16" value="${boardWidth}" aria-label="Толщина линии" title="Толщина линии" /><span class="board-size-value" id="boardWidthLabel">${boardWidth}px</span><span class="tool-divider"></span><button class="board-tool" data-action="board-undo" title="Отменить">↶</button><button class="board-tool" data-action="board-clear" title="Очистить доску">${useIcon('trash')}<span class="board-tool-label">Очистить</span></button><span class="board-save-state" id="boardSaveState">Сохранено</span></div><div class="board-canvas-wrap"><canvas id="whiteboard" class="board-canvas" aria-label="Интерактивная доска"></canvas></div><div class="board-bottom"><div class="board-bottom-left">${useIcon('spark')}<span>Доска привязана к занятиям и сохраняется локально</span></div><span class="board-page-chip">${board?.elements.length || 0} элементов</span></div></section><aside class="board-note-panel"><h3>Доска занятий.</h3><p>Одна доска может быть закреплена за несколькими уроками. Выберите занятие, чтобы продолжить работу с сохранёнными записями.</p>${boardLessons.length ? boardLessons.map((lesson) => `<div class="board-lesson-chip">${useIcon('calendar')}<div><strong>${escapeHTML(lesson.title)}</strong><span>${escapeHTML(dateLabel(lesson.date))} · ${escapeHTML(studentName(lesson.studentId))}</span></div></div>`).join('') : `<div class="board-lesson-chip">${useIcon('calendar')}<div><strong>Ещё не закреплена</strong><span>Можно привязать к одному или нескольким урокам</span></div></div>`}${!isStudentAccount() ? `<button class="button button-light button-small button-full board-attach-button" data-action="board-attach" ${lessonOptions ? '' : 'disabled'}>${useIcon('plus')} Привязать к занятию</button>` : ''}<div class="board-help-note">Ластик удаляет весь элемент. Shift во время рисования фиксирует прямую по горизонтали или вертикали.</div></aside></div>`;
    window.requestAnimationFrame(setupBoard);
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
    const mediaNote = activeConferenceId
      ? (authenticatedAccountId
        ? 'Передайте ссылку приглашённым участникам; для входа им понадобится аккаунт Tutdesk.'
        : 'Передайте ссылку и временный код приглашённым участникам.')
      : 'Для тестового звонка участники должны открыть одно занятие и ввести общий временный код.';
    const lessonId = activeConferenceId || lesson?.id || 'tutdesk-open-room';
    const availableLessons = studentMode ? state.lessons.filter((item) => item.studentId === currentAccount()?.studentId && item.date >= addDaysISO(0)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)) : currentTutorLessons().filter((item) => item.date >= addDaysISO(0)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    const lessonPicker = !activeConferenceId && availableLessons.length > 1 ? `<label class="room-lesson-picker"><span>Выберите занятие</span><select id="roomLessonSelect" aria-label="Выберите занятие">${availableLessons.map((item) => `<option value="${escapeHTML(item.id)}" ${item.id === lesson?.id ? 'selected' : ''}>${escapeHTML(dateLabel(item.date))} · ${escapeHTML(item.time)} · ${escapeHTML(item.title)}${studentMode ? ` · ${escapeHTML(getAccount(item.tutorId)?.name || 'Репетитор')}` : ` · ${escapeHTML(studentName(item.studentId))}`}</option>`).join('')}</select></label>` : '';
    const inviteAction = activeConferenceId
      ? '<button class="button button-light button-small" data-action="copy-conference">Скопировать ссылку</button>'
      : '<button class="button button-light button-small" data-action="create-conference">Создать конференцию</button>';
    const attendeesDescription = activeConferenceId ? 'Вы и приглашённые участники' : `Вы и ${escapeHTML(partner)}`;
    const roomSubtitle = activeConferenceId
      ? 'Пригласите участников по ссылке'
      : `Занятие с ${escapeHTML(partner)} · ${escapeHTML(lesson?.date ? dateLabel(lesson.date) : 'Сейчас')} ${escapeHTML(lesson?.time || '')}`;
    const roomFooterNote = authenticatedAccountId
      ? 'В конференции могут участвовать вошедшие в Tutdesk пользователи с приглашением.'
      : 'Гостям понадобятся приглашение и временный код для входа.';
    pageContent.innerHTML = `<div class="room-page"><div class="room-topline"><div class="room-title-group"><div><h1>${escapeHTML(lessonTitle)}</h1><p>${roomSubtitle}</p></div><span class="room-status-badge" id="roomConnectionStatus">НЕ ПОДКЛЮЧЕНО</span></div><div class="room-call-actions">${lessonPicker}${inviteAction}<span class="room-clock" id="roomTimer">00:00</span><button class="button button-primary button-small" data-action="join-livekit">Подключиться к звонку</button></div></div><div class="room-layout"><section class="video-stage"><article class="video-tile" id="studentVideoTile"><div class="video-avatar">${escapeHTML(initials(partner))}</div><span class="video-name" id="remoteParticipantName">${escapeHTML(activeConferenceId ? 'Ожидание участников' : partner)}</span><span class="video-cam-state" id="remoteVideoState">${useIcon('cam-off')} Ожидает подключения</span></article><article class="video-tile video-tile--tutor" id="tutorVideoTile"><div class="video-avatar">${escapeHTML(initials(ownName))}</div><video id="localVideo" autoplay playsinline muted hidden></video><span class="video-name">Вы · ${escapeHTML(ownName)}</span><span class="video-cam-state" id="tutorVideoState">${useIcon('cam-off')} Камера выключена</span></article><div class="room-controls"><button class="room-control is-off" data-action="toggle-mic" title="Микрофон" aria-label="Микрофон">${useIcon('mic-off')}</button><button class="room-control is-off" data-action="toggle-camera" title="Камера" aria-label="Камера">${useIcon('cam-off')}</button><button class="room-control" data-action="share-screen" title="Показать экран" aria-label="Показать экран">${useIcon('monitor')}</button><span class="room-control-separator"></span><button class="room-control" data-action="open-board" title="Открыть доску" aria-label="Открыть доску">${useIcon('board')}</button><button class="room-control room-control--hangup" data-action="leave-room" title="Завершить" aria-label="Завершить">${useIcon('phone')}</button></div></section><aside class="room-aside"><h3>${activeConferenceId ? 'Конференция' : 'На занятии'}</h3><p>Пространство этой встречи</p><div class="room-info">${useIcon('users')}<div><strong>Участники</strong>${attendeesDescription}</div></div><div class="room-info">${useIcon('board')}<div><strong>Интерактивная доска</strong>${activeConferenceId ? 'Эта конференция не связана с общей доской' : 'Закреплена за занятием; работа сохранится для продолжения'}</div></div><div class="room-info">${useIcon('monitor')}<div><strong>Демонстрация экрана</strong>Поделитесь материалом ученику</div></div><div class="room-share-note">Код встречи: <strong>${escapeHTML(lessonId)}</strong><br />${escapeHTML(mediaNote)}</div></aside><div class="room-footer-note">${roomFooterNote}</div></div></div>`;
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

  function conferenceInviteUrl() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('conference', activeConferenceId);
    return url.toString();
  }

  async function copyConferenceLink() {
    if (!activeConferenceId) return;
    const inviteUrl = conferenceInviteUrl();
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
    meetingStartedAt = Date.now();
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
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => attachRemoteTrack(track, participant, Track));
    room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => detachRemoteTrack(track, participant));
    room.on(RoomEvent.ParticipantConnected, (participant) => updateRemoteParticipant(participant));
    room.on(RoomEvent.ParticipantDisconnected, (participant) => updateRemoteStatus(participant));
    room.on(RoomEvent.Disconnected, () => {
      if (liveKitRoom === room) {
        liveKitRoom = null; cameraEnabled = false; micEnabled = false; screenShareEnabled = false;
        clearRemoteParticipants();
        updateRoomConnection(false); resetRoomMediaButtons();
      }
    });
    try {
      await room.connect(credentials.serverUrl, credentials.token);
      liveKitRoom = room;
      closeModal();
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

  function attachRemoteTrack(track, participant, Track) {
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
      if (stateLabel) stateLabel.innerHTML = `${useIcon('cam')} \u041a\u0430\u043c\u0435\u0440\u0430 \u0432\u043a\u043b\u044e\u0447\u0435\u043d\u0430`;
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
    document.getElementById('taskNavLabel').textContent = studentMode ? 'Домашняя работа' : 'Планер';
    document.getElementById('lessonTier').hidden = plan === 'extreme' || studentMode;
    document.getElementById('sidePlanName').textContent = plan === 'extreme' ? 'Extreme' : 'Light';
    document.getElementById('sidePlanDescription').textContent = plan === 'extreme' ? 'Все инструменты для работы' : 'Созвоны и интерактивная доска';
    document.getElementById('profileName').textContent = account?.name || 'Гость';
    document.getElementById('profileRole').textContent = account ? (studentMode ? 'Ученик' : 'Репетитор') : 'Войти в кабинет';
    document.getElementById('profileInitials').textContent = initials(account?.name || '?');
    document.getElementById('topAvatar').textContent = initials(account?.name || '?');
    document.getElementById('topbarSpaceLabel').textContent = account ? (studentMode ? 'Личный кабинет ученика' : 'Пространство репетитора') : 'Личный кабинет';
    document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date());
    document.getElementById('footerYear').textContent = new Date().getFullYear();
    if (!account && currentView !== 'room') {
      pageContent.innerHTML = `<section class="auth-welcome"><span class="heading-kicker">TUTDESK</span><h1>Учёба и занятия — в одном пространстве.</h1><p>Создайте личный кабинет репетитора или ученика, чтобы вести занятия, готовить задания и работать на общей доске.</p><div class="auth-welcome-actions"><button class="button button-primary" data-action="account-register">Создать аккаунт</button><button class="button button-light" data-action="account-login">Войти</button></div></section>`;
      sidebar.classList.remove('is-open');
      return;
    }
    ({ overview: renderOverview, students: renderStudents, lessons: renderLessons, board: renderBoard, tasks: renderTasks, subscription: renderSubscription, room: renderRoom }[currentView] || renderOverview)();
    sidebar.classList.remove('is-open');
  }
  function navigate(view) {
    if (!pageNames[view]) return;
    if (!currentAccount() && view !== 'room' && view !== 'overview') { openForm('account-login'); return; }
    if (currentView === 'room' && view !== 'room') stopRoomMedia();
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
        showModal('Ваш профиль Tutdesk', 'Данные личного кабинета синхронизируются с сервером.', `<div class="profile-details"><strong>${escapeHTML(account?.name || 'Пользователь')}</strong><span>${escapeHTML(account?.email || '')}</span><span>${account?.role === 'student' ? 'Ученик' : 'Репетитор'}</span></div><button type="button" class="button button-danger" data-action="auth-logout">Выйти из аккаунта</button>`);
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
      showModal('Создать аккаунт Tutdesk', 'После регистрации отправим ссылку для подтверждения email.', `<form class="form-grid" data-form="account-register"><div class="form-field"><label for="accountName">Имя</label><input class="form-control" id="accountName" name="name" autocomplete="name" minlength="2" maxlength="80" placeholder="Имя и фамилия" required /></div><div class="form-field"><label for="accountEmail">Электронная почта</label><input class="form-control" id="accountEmail" name="email" type="email" autocomplete="email" placeholder="name@example.com" required /></div><div class="form-field"><label for="accountRole">Я регистрируюсь как</label><select class="form-control" id="accountRole" name="role" required><option value="tutor">Репетитор</option><option value="student">Ученик</option></select></div><div class="form-field"><label for="accountPassword">Пароль</label><input class="form-control" id="accountPassword" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /><span class="form-hint">Не менее 12 символов.</span></div><div class="form-field"><label for="accountPasswordConfirm">Повторите пароль</label><input class="form-control" id="accountPasswordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div><div class="form-actions"><button type="button" class="button button-light" data-action="account-login">У меня уже есть аккаунт</button><button class="button button-primary" type="submit">Зарегистрироваться</button></div></form>`);
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
      showModal('Новый пароль', 'Задайте новый пароль длиной не менее 12 символов.', `<form class="form-grid" data-form="password-reset"><input type="hidden" name="token" value="${escapeHTML(id || '')}" /><div class="form-field"><label for="newPassword">Новый пароль</label><input class="form-control" id="newPassword" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div><div class="form-field"><label for="newPasswordConfirm">Повторите пароль</label><input class="form-control" id="newPasswordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div><div class="form-actions"><button type="button" class="button button-light" data-action="account-login">Отмена</button><button class="button button-primary" type="submit">Сохранить пароль</button></div></form>`);
      return;
    }
    if (type === 'student') {
      showModal('Добавить ученика', 'Укажите email. Если профиль уже есть, он свяжется с вами без дублирования.', `<form class="form-grid" data-form="student"><div class="form-field"><label for="studentEmail">Email ученика</label><input class="form-control" id="studentEmail" name="email" type="email" placeholder="student@example.com" required /></div><div class="form-field"><label for="studentName">Имя и фамилия</label><input class="form-control" id="studentName" name="name" placeholder="Например, Мария Иванова" required /></div><div class="form-field"><label for="studentSubject">Предмет</label><input class="form-control" id="studentSubject" name="subject" placeholder="Например, математика" required /></div><div class="form-field"><label for="studentGrade">Класс или уровень</label><input class="form-control" id="studentGrade" name="grade" placeholder="Например, 8 класс" /></div><div class="form-field"><label for="studentNote">Заметка для ваших уроков</label><textarea class="form-textarea" id="studentNote" name="note" placeholder="Цели, темы и важные детали"></textarea></div><div class="account-note">Связь репетитора и ученика независимая: ученик может добавить несколько преподавателей.</div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Добавить ученика</button></div></form>`);
      return;
    }
    if (type === 'lesson') {
      const options = currentTutorStudents().map((student) => `<option value="${escapeHTML(student.id)}">${escapeHTML(student.name)} · ${escapeHTML(student.subject)}</option>`).join('');
      if (!options) { toast('Сначала добавьте ученика', 'После этого можно будет запланировать занятие.'); return; }
      showModal('Запланировать занятие', 'Занятие появится в вашем расписании.', `<form class="form-grid" data-form="lesson"><div class="form-field"><label for="lessonTitle">Тема занятия</label><input class="form-control" id="lessonTitle" name="title" placeholder="Например, квадратные уравнения" required /></div><div class="form-field"><label for="lessonStudent">Ученик</label><select class="form-control" id="lessonStudent" name="studentId" required>${options}</select></div><div class="form-grid form-grid--two"><div class="form-field"><label for="lessonDate">Дата</label><input class="form-control" id="lessonDate" name="date" type="date" value="${addDaysISO(1)}" required /></div><div class="form-field"><label for="lessonTime">Время</label><input class="form-control" id="lessonTime" name="time" type="time" value="16:00" required /></div></div><div class="form-field"><label for="lessonDuration">Длительность</label><select class="form-control" id="lessonDuration" name="duration"><option value="45">45 минут</option><option value="60" selected>60 минут</option><option value="90">90 минут</option></select></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Сохранить занятие</button></div></form>`);
      return;
    }
    if (type === 'task') {
      const options = currentTutorStudents().map((student) => `<option value="${escapeHTML(student.id)}">${escapeHTML(student.name)}</option>`).join('');
      const defaultKind = options ? 'homework' : 'personal';
      showModal('Новая задача', 'Добавьте личное дело или назначьте домашнюю работу.', `<form class="form-grid" data-form="task"><div class="form-field"><label for="taskKind">Тип задачи</label><select class="form-control" id="taskKind" name="kind"><option value="homework" ${defaultKind === 'homework' ? 'selected' : ''}>Домашнее задание ученику</option><option value="personal" ${defaultKind === 'personal' ? 'selected' : ''}>Моя личная задача</option></select></div><div class="form-field"><label for="taskTitle">Название</label><input class="form-control" id="taskTitle" name="title" placeholder="Например, подготовить примеры к уроку" required /></div><div class="form-field"><label for="taskDescription">Подробности</label><textarea class="form-textarea" id="taskDescription" name="description" placeholder="Что нужно сделать, страницы учебника или ссылка"></textarea></div><div class="form-field task-student-field" id="taskStudentWrap" ${defaultKind === 'personal' ? 'hidden' : ''}><label for="taskStudent">Назначить ученику</label><select class="form-control" id="taskStudent" name="studentId" ${defaultKind === 'personal' ? '' : 'required'}>${options || '<option value="">Сначала добавьте ученика</option>'}</select></div><div class="form-grid form-grid--two"><div class="form-field task-subject-field" id="taskSubjectWrap" ${defaultKind === 'personal' ? 'hidden' : ''}><label for="taskSubject">Предмет</label><input class="form-control" id="taskSubject" name="subject" value="${escapeHTML(currentTutorStudents()[0]?.subject || '')}" ${defaultKind === 'personal' ? '' : 'required'} /></div><div class="form-field"><label for="taskDue">Срок <span class="optional-label">необязательно</span></label><input class="form-control" id="taskDue" name="due" type="date" value="${addDaysISO(3)}" /></div></div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Создать задачу</button></div></form>`);
      const taskKind = document.getElementById('taskKind');
      const studentSelect = document.getElementById('taskStudent');
      taskKind?.addEventListener('change', () => {
        const isHomework = taskKind.value === 'homework';
        const studentWrap = document.getElementById('taskStudentWrap'); const subjectWrap = document.getElementById('taskSubjectWrap'); const subject = document.getElementById('taskSubject');
        if (studentWrap) studentWrap.hidden = !isHomework;
        if (subjectWrap) subjectWrap.hidden = !isHomework;
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
      const options = currentTutorLessons().map((lesson) => `<option value="${escapeHTML(lesson.id)}">${escapeHTML(dateLabel(lesson.date))} · ${escapeHTML(lesson.title)}</option>`).join('');
      if (!options) { toast('Нет доступных занятий', 'Сначала запланируйте занятие в Extreme.'); return; }
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
        const response = await fetch('/api/auth/register', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.name, email: data.email, role: data.role, password: data.password }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { toast(result.message || 'Не удалось создать аккаунт', result.error === 'auth_not_configured' ? 'Сервис аккаунтов ещё не настроен.' : 'Проверьте данные и попробуйте ещё раз.'); return; }
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
      const existingAccount = email ? state.accounts.find((account) => account.email.toLowerCase() === email && account.role === 'student') : null;
      let profile = existingAccount ? getStudent(existingAccount.studentId) : (email ? state.students.find((student) => student.email?.toLowerCase() === email) : null);
      if (profile && state.tutorLinks.some((link) => link.tutorId === currentTutorId() && link.studentId === profile.id)) { toast('Ученик уже связан с вашим профилем'); return; }
      if (!profile) {
        profile = { id: `student-${Date.now()}`, name: data.name.trim(), email: email || `student-${Date.now()}@tutdesk.local`, subject: data.subject.trim(), grade: data.grade.trim() || 'Новый ученик', note: data.note.trim(), lessons: 0, progress: 0, color: state.students.length % initialsByColor.length };
        state.students.push(profile);
      }
      if (!existingAccount) state.accounts.push({ id: `student-account-${Date.now()}`, role: 'student', name: profile.name, email: profile.email, studentId: profile.id });
      state.tutorLinks.push({ tutorId: currentTutorId(), studentId: profile.id, note: data.note.trim() });
      persist(); closeModal(); render(); toast('Ученик добавлен в ваш профиль', `${profile.name} может заниматься и у других репетиторов.`);
    } else if (form.dataset.form === 'lesson') {
      state.lessons.push({ id, tutorId: currentTutorId(), studentId: data.studentId, title: data.title.trim(), date: data.date, time: data.time, duration: Number(data.duration) || 60, status: 'scheduled' });
      persist(); closeModal(); render(); toast('Занятие добавлено в расписание', `${dateLabel(data.date)} · ${data.time}`);
    } else if (form.dataset.form === 'task') {
      const personal = data.kind === 'personal';
      if (!personal && !data.studentId) { toast('Выберите ученика', 'Для домашнего задания нужен адресат.'); return; }
      state.tasks.push({ id, kind: personal ? 'personal' : 'homework', tutorId: currentTutorId(), studentId: personal ? null : data.studentId, title: data.title.trim(), description: data.description.trim(), subject: personal ? 'Личное' : data.subject.trim(), due: data.due || '', status: 'todo' });
      persist(); closeModal(); render(); toast(personal ? 'Личная задача добавлена' : 'Домашнее задание назначено', personal ? 'Эту задачу видите только вы.' : studentName(data.studentId));
    } else if (form.dataset.form === 'copy-task') {
      const original = state.tasks.find((task) => task.id === form.dataset.id);
      if (!original) return;
      state.tasks.push({ ...original, id, studentId: data.studentId, due: data.due, status: 'todo' });
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
    const requestedLesson = state.lessons.find((lesson) => lesson.id === id) || nextLesson() || null;
    if (isStudentAccount() && requestedLesson?.studentId !== currentAccount()?.studentId) {
      toast('Это занятие недоступно', 'Откройте урок из своего кабинета ученика.');
      return;
    }
    if (!isStudentAccount() && requestedLesson && !currentTutorLessons().some((lesson) => lesson.id === requestedLesson.id)) {
      toast('Это занятие недоступно', 'Откройте урок из своего расписания.');
      return;
    }
    activeConferenceId = null;
    setConferenceUrl(null);
    state._activeLesson = requestedLesson;
    if (state._activeLesson?.boardId) state.currentBoardId = state._activeLesson.boardId;
    meetingStartedAt = Date.now();
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
        screenShareEnabled = !screenShareEnabled;
        await liveKitRoom.localParticipant.setScreenShareEnabled(screenShareEnabled);
        button.classList.toggle('is-on', screenShareEnabled);
        toast(screenShareEnabled ? 'Демонстрация экрана включена' : 'Демонстрация экрана завершена');
      } catch (error) { screenShareEnabled = !screenShareEnabled; toast('Не удалось показать экран', error.message || 'Выберите экран или окно для демонстрации.'); }
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
      if (boardTool === 'select') {
        const hit = hitBoardElement(board, p.x, p.y, width, height);
        if (hit) pushBoardHistory(board);
        boardDragElementId = hit?.id || null; lastPoint = normalized; boardSelectedId = boardDragElementId;
        drawBoardElements(context, board, width, height); canvas.style.cursor = hit ? 'move' : 'default'; return;
      }
      if (boardTool === 'eraser') {
        const hit = hitBoardElement(board, p.x, p.y, width, height);
        if (hit) { pushBoardHistory(board); board.elements = board.elements.filter((element) => element.id !== hit.id); saveBoard(board); drawBoardElements(context, board, width, height); updateBoardElementCount(board); }
        return;
      }
      if (boardTool === 'text' || boardTool === 'sticky') { boardTextPosition = normalized; openForm(boardTool === 'text' ? 'board-text' : 'board-sticky'); return; }
      pushBoardHistory(board); boardDrawing = true; boardPointerStart = normalized; lastPoint = normalized;
      const element = { id: `element-${Date.now()}`, type: boardTool === 'pen' ? 'path' : boardTool, color: boardColor, width: boardWidth, points: [{ x: normalized.x, y: normalized.y }], x1: normalized.x, y1: normalized.y, x2: normalized.x, y2: normalized.y };
      if (boardTool === 'sticky' || boardTool === 'text') return;
      board.elements.push(element); boardDraftId = element.id;
    };
    canvas.onpointermove = (event) => {
      const p = point(event); const normalized = { x: p.x / width, y: p.y / height };
      if (boardDragElementId) {
        const element = board.elements.find((item) => item.id === boardDragElementId);
        if (element && lastPoint) { moveBoardElement(element, normalized.x - lastPoint.x, normalized.y - lastPoint.y); lastPoint = normalized; drawBoardElements(context, board, width, height); }
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
      if (boardDrawing) { boardDrawing = false; const draft = board.elements.find((element) => element.id === boardDraftId); if (draft) delete draft.shiftLine; boardDraftId = null; saveBoard(board); updateBoardElementCount(board); drawBoardElements(context, board, width, height); }
      if (boardDragElementId) { boardDragElementId = null; saveBoard(board); }
    };
    canvas.onpointerup = canvas.onpointercancel = finish;
    canvas.ondblclick = (event) => { const p = point(event); const hit = hitBoardElement(board, p.x, p.y, width, height); if (hit && (hit.type === 'text' || hit.type === 'sticky')) openForm('board-edit', hit.id); };
    canvas.onpointerleave = () => { if (!boardDrawing && !boardDragElementId) canvas.style.cursor = boardTool === 'select' ? 'default' : 'crosshair'; };
    const color = document.getElementById('boardColor'); color?.addEventListener('input', () => { boardColor = color.value; });
    const size = document.getElementById('brushSize'); size?.addEventListener('input', () => { boardWidth = Number(size.value); const label = document.getElementById('boardWidthLabel'); if (label) label.textContent = `${boardWidth}px`; });
    document.getElementById('boardSelect')?.addEventListener('change', (event) => { state.currentBoardId = event.target.value; boardHistory = []; boardSelectedId = null; persist(); renderBoard(); });
    document.getElementById('roomLessonSelect')?.addEventListener('change', (event) => startLesson(event.target.value));
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
  function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 8) {
    let line = ''; let count = 0;
    for (const word of String(text).split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (context.measureText(next).width > maxWidth && line) { context.fillText(line, x, y); line = word; y += lineHeight; count++; if (count >= maxLines) return; } else line = next; }
    if (line) context.fillText(line, x, y);
  }
  function boardElementBounds(element, width, height) {
    if (element.type === 'path') { const xs = element.points.map((p) => p.x * width); const ys = element.points.map((p) => p.y * height); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    if (element.type === 'text') return { x: element.x * width, y: element.y * height - (element.fontSize || 20), w: Math.max(40, String(element.text).length * (element.fontSize || 20) * .58), h: String(element.text).split('\n').length * (element.fontSize || 20) * 1.4 };
    if (element.type === 'sticky') return { x: element.x * width, y: element.y * height, w: element.w * width, h: element.h * height };
    const x1 = element.x1 * width; const y1 = element.y1 * height; const x2 = element.x2 * width; const y2 = element.y2 * height;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
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
    else if (element.type === 'text' || element.type === 'sticky') { element.x += dx; element.y += dy; }
    else { element.x1 += dx; element.x2 += dx; element.y1 += dy; element.y2 += dy; }
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
    const link = document.createElement('a'); link.download = `tutdesk-доска-${dateToISO(new Date())}.png`; link.href = output.toDataURL('image/png'); link.click();
  }

  document.addEventListener('click', async (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { event.preventDefault(); navigate(viewButton.dataset.view); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'menu') sidebar.classList.toggle('is-open');
    else if (action === 'toggle-theme') applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    else if (action === 'open-modal') openForm(button.dataset.modal);
    else if (action === 'close-modal') closeModal();
    else if (action === 'start-lesson') startLesson(id);
    else if (action === 'choose-plan') { const account = currentAccount(); if (account) account.plan = button.dataset.plan; state.plan = button.dataset.plan; persist(); render(); toast(`Выбран план ${currentPlan() === 'light' ? 'Light' : 'Extreme'}`); }
    else if (action === 'task-filter') { taskFilter = button.dataset.filter; renderTasks(); }
    else if (action === 'task-status') { const task = state.tasks.find((item) => item.id === id); if (task) { task.status = task.kind === 'personal' ? (task.status === 'complete' ? 'todo' : 'complete') : (({ todo: 'submitted', submitted: 'complete', complete: 'todo' })[task.status] || 'todo'); persist(); render(); toast(task.kind === 'personal' ? (task.status === 'complete' ? 'Личная задача выполнена' : 'Личная задача возвращена в список') : `Статус: ${taskStatusLabel(task.status)}`, task.title); } }
    else if (action === 'student-task-status') { const task = state.tasks.find((item) => item.id === id); if (task && task.studentId === currentAccount()?.studentId) { task.status = task.status === 'submitted' ? 'todo' : 'submitted'; persist(); renderTasks(); toast(task.status === 'submitted' ? 'Задание отправлено репетитору' : 'Задание возвращено в работу'); } }
    else if (action === 'copy-task') openForm('copy-task', id);
    else if (action === 'lesson-board') { const lesson = state.lessons.find((item) => item.id === id); openLessonBoard(lesson); }
    else if (action === 'toggle-camera') await toggleCamera(button);
    else if (action === 'toggle-mic') await toggleMic(button);
    else if (action === 'share-screen') await shareScreen(button);
    else if (action === 'join-livekit') openLiveKitJoin();
    else if (action === 'create-conference') createConference();
    else if (action === 'copy-conference') copyConferenceLink();
    else if (action === 'open-board') { const lesson = activeConferenceId ? null : (state._activeLesson || nextLesson()); if (lesson) openLessonBoard(lesson); else navigate('board'); stopRoomMedia(); toast('Доска открыта', 'В этой доске можно продолжить работу на следующих занятиях.'); }
    else if (action === 'leave-room') { stopRoomMedia(); activeConferenceId = null; setConferenceUrl(null); navigate('overview'); toast('Вы вышли из комнаты'); }
    else if (action === 'board-tool') { boardTool = button.dataset.tool; boardSelectedId = null; document.querySelectorAll('[data-tool]').forEach((tool) => tool.classList.toggle('active', tool === button)); const canvas = document.getElementById('whiteboard'); if (canvas) { canvas.style.cursor = boardTool === 'select' ? 'default' : 'crosshair'; drawBoardElements(canvas.getContext('2d'), currentBoard(), canvas.clientWidth, canvas.clientHeight); } }
    else if (action === 'board-undo') undoBoard();
    else if (action === 'board-clear') clearBoard();
    else if (action === 'board-export') exportBoard();
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
    else if (action === 'profile') openForm('account-login');
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]'); if (!form) return;
    event.preventDefault();
    if (form.dataset.form === 'student-note') { const link = tutorLinkForStudent(form.dataset.id); if (link) { link.note = new FormData(form).get('note').trim(); persist(); closeModal(); if (currentView === 'students') renderStudents(); else render(); toast('Заметка сохранена'); } return; }
    submitForm(form);
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
  modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeModal(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modalBackdrop.hidden) closeModal();
    if ((event.key === 'Delete' || event.key === 'Backspace') && currentView === 'board' && boardSelectedId && !event.target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
      const board = currentBoard(); const canvas = document.getElementById('whiteboard');
      if (board && canvas) { pushBoardHistory(board); board.elements = board.elements.filter((item) => item.id !== boardSelectedId); boardSelectedId = null; saveBoard(board); drawBoardElements(canvas.getContext('2d'), board, canvas.clientWidth, canvas.clientHeight); updateBoardElementCount(board); }
    }
  });
  window.addEventListener('resize', () => { if (currentView === 'board') setupBoard(); });

  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('tutdesk-theme') === 'dark' ? 'dark' : 'light'; } catch (_) { /* storage can be disabled */ }
  applyTheme(savedTheme, false);
  initializeAuth();
})();
