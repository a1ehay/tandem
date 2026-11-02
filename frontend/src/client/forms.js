export function createForms(dependencies) {
  const { state, pad, useIcon, currentTutorStudents, currentTutorLessons, escapeHTML, dateLabel, toast, addDaysISO, getStudent, getAccount, currentTutorId, currentPlanner, studentName, currentBoard, createBoard, pushBoardHistory, saveBoard, uiState, appState, persist, render, views, modalBackdrop, modalCard, initialsByColor } = dependencies;
  function showModal(title, subtitle, body) {
    modalCard.innerHTML = `<div class="modal-head"><div><h2 id="modalTitle">${title}</h2><p>${subtitle}</p></div><button class="modal-close" data-action="close-modal" aria-label="Закрыть">${useIcon('close')}</button></div>${body}`;
    modalBackdrop.hidden = false;
    const first = modalCard.querySelector('input,select,textarea');
    if (first) window.setTimeout(() => first.focus(), 40);
  }
  function closeModal() { modalBackdrop.hidden = true; modalCard.innerHTML = ''; }
  function openForm(type, id) {
    if (type === 'account-login') {
      showModal('Войти в Tandem', 'Выберите созданный в этом браузере профиль.', `<form class="form-grid" data-form="account-login"><div class="form-field"><label for="accountProfile">Личный кабинет</label><select class="form-control" id="accountProfile" name="accountId" required>${state.accounts.map((account) => `<option value="${escapeHTML(account.id)}" ${account.id === state.currentAccountId ? 'selected' : ''}>${escapeHTML(account.name)} · ${account.role === 'student' ? 'ученик' : 'репетитор'}</option>`).join('')}</select></div><div class="account-demo-note">Демо вход хранит профили только в этом браузере. Пароли и настоящая авторизация пока не подключены.</div><div class="form-actions auth-actions"><button type="button" class="button button-light google-button" data-action="google-login">${useIcon('spark')} Продолжить с Google</button><button class="button button-primary" type="submit">Войти</button></div><button type="button" class="text-link" data-action="account-register">Создать новый аккаунт</button></form>`);
      return;
    }
    if (type === 'account-register') {
      showModal('Создать аккаунт', 'Выберите роль — профиль и разделы настроятся автоматически.', `<form class="form-grid" data-form="account-register"><div class="form-field"><label for="accountName">Имя</label><input class="form-control" id="accountName" name="name" placeholder="Имя и фамилия" required /></div><div class="form-field"><label for="accountEmail">Электронная почта</label><input class="form-control" id="accountEmail" name="email" type="email" placeholder="name@example.com" required /></div><div class="form-field"><label for="accountRole">Я регистрируюсь как</label><select class="form-control" id="accountRole" name="role"><option value="tutor">Репетитор</option><option value="student">Ученик</option></select></div><div class="form-grid form-grid--two"><div class="form-field"><label for="accountSubject">Предмет / класс</label><input class="form-control" id="accountSubject" name="subject" placeholder="Например, математика · 8 класс" /></div><div class="form-field"><label for="accountGrade">Уровень</label><input class="form-control" id="accountGrade" name="grade" placeholder="Например, 8 класс" /></div></div><div class="account-demo-note">Демо аккаунт будет сохранён локально. Для защищённого входа и Google OAuth понадобится серверная настройка.</div><div class="form-actions"><button type="button" class="button button-light" data-action="account-login">У меня уже есть аккаунт</button><button class="button button-primary" type="submit">Создать</button></div></form>`);
      return;
    }
    if (type === 'student') {
      showModal('Добавить ученика', 'Укажите email. Если профиль уже есть, он свяжется с вами без дублирования.', `<form class="form-grid" data-form="student"><div class="form-field"><label for="studentEmail">Email ученика</label><input class="form-control" id="studentEmail" name="email" type="email" placeholder="student@example.com" required /></div><div class="form-field"><label for="studentName">Имя и фамилия</label><input class="form-control" id="studentName" name="name" placeholder="Например, Мария Иванова" required /></div><div class="form-field"><label for="studentSubject">Предмет</label><input class="form-control" id="studentSubject" name="subject" placeholder="Например, математика" required /></div><div class="form-field"><label for="studentGrade">Класс или уровень</label><input class="form-control" id="studentGrade" name="grade" placeholder="Например, 8 класс" /></div><div class="form-field"><label for="studentNote">Заметка для ваших уроков</label><textarea class="form-textarea" id="studentNote" name="note" placeholder="Цели, темы и важные детали"></textarea></div><div class="account-demo-note">Связь репетитора и ученика независимая: ученик может добавить несколько преподавателей.</div><div class="form-actions"><button type="button" class="button button-light" data-action="close-modal">Отмена</button><button class="button button-primary" type="submit">Добавить ученика</button></div></form>`);
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

  function submitForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const id = `${form.dataset.form}-${Date.now()}`;
    if (form.dataset.form === 'account-login') {
      const account = getAccount(data.accountId); if (!account) return;
      state.currentAccountId = account.id; appState.currentView = 'overview'; persist(); closeModal(); render(); toast('Вы вошли в демо-кабинет', account.role === 'student' ? 'Роль: ученик' : 'Роль: репетитор');
    } else if (form.dataset.form === 'account-register') {
      const email = data.email.trim().toLowerCase();
      if (state.accounts.some((account) => account.email.toLowerCase() === email)) { toast('Этот email уже зарегистрирован', 'Выберите профиль через «Войти».'); return; }
      const role = data.role === 'student' ? 'student' : 'tutor';
      let studentId = null;
      if (role === 'student') {
        studentId = `student-${Date.now()}`;
        state.students.push({ id: studentId, name: data.name.trim(), email, subject: data.subject.trim() || 'Предмет не указан', grade: data.grade.trim() || '', note: '', lessons: 0, progress: 0, color: state.students.length % initialsByColor.length });
      }
      state.accounts.push({ id, role, name: data.name.trim(), email, studentId, ...(role === 'tutor' ? { plan: 'light' } : {}) });
      state.currentAccountId = id; appState.currentView = 'overview'; persist(); closeModal(); render(); toast('Демо-аккаунт создан', role === 'student' ? 'Личный кабинет ученика готов.' : 'Личный кабинет репетитора готов.');
    } else if (form.dataset.form === 'student') {
      const email = (data.email || '').trim().toLowerCase();
      const existingAccount = email ? state.accounts.find((account) => account.email.toLowerCase() === email && account.role === 'student') : null;
      let profile = existingAccount ? getStudent(existingAccount.studentId) : (email ? state.students.find((student) => student.email?.toLowerCase() === email) : null);
      if (profile && state.tutorLinks.some((link) => link.tutorId === currentTutorId() && link.studentId === profile.id)) { toast('Ученик уже связан с вашим профилем'); return; }
      if (!profile) {
        profile = { id: `student-${Date.now()}`, name: data.name.trim(), email: email || `student-${Date.now()}@tandem.local`, subject: data.subject.trim(), grade: data.grade.trim() || 'Новый ученик', note: data.note.trim(), lessons: 0, progress: 0, color: state.students.length % initialsByColor.length };
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
      createBoard(data.name); closeModal(); views.renderBoard(); toast('Доска создана', data.name.trim());
    } else if (form.dataset.form === 'board-attach') {
      const lesson = state.lessons.find((item) => item.id === data.lessonId); const board = currentBoard();
      if (!lesson || !board) return;
      const oldBoard = state.boards.find((item) => item.id === lesson.boardId);
      if (oldBoard && oldBoard.id !== board.id) oldBoard.lessonIds = oldBoard.lessonIds.filter((lessonId) => lessonId !== lesson.id);
      lesson.boardId = board.id; if (!board.lessonIds.includes(lesson.id)) board.lessonIds.push(lesson.id);
      persist(); closeModal(); views.renderBoard(); toast('Доска привязана к занятию', lesson.title);
    } else if (form.dataset.form === 'board-text' || form.dataset.form === 'board-sticky') {
      const board = currentBoard(); if (!board || !appState.boardTextPosition) return;
      pushBoardHistory(board);
      const canvas = document.getElementById('whiteboard'); const sticky = form.dataset.form === 'board-sticky';
      const element = sticky
        ? { id, type: 'sticky', x: appState.boardTextPosition.x, y: appState.boardTextPosition.y, w: Math.min(.8, 205 / (canvas?.clientWidth || 740)), h: Math.min(.8, 148 / (canvas?.clientHeight || 420)), text: data.text.trim(), fill: data.fill || '#fff1a8', color: '#414638', width: 1 }
        : { id, type: 'text', x: appState.boardTextPosition.x, y: appState.boardTextPosition.y, text: data.text.trim(), color: uiState.boardColor, width: uiState.boardWidth, fontSize: Math.max(16, uiState.boardWidth * 6) };
      board.elements.push(element); appState.boardTextPosition = null; saveBoard(board); closeModal(); views.renderBoard();
    } else if (form.dataset.form === 'board-edit') {
      const board = currentBoard(); const element = board?.elements.find((item) => item.id === form.dataset.id);
      if (!element) return;
      pushBoardHistory(board); element.text = data.text.trim(); if (data.fill) element.fill = data.fill;
      saveBoard(board); closeModal(); views.renderBoard();
    } else if (form.dataset.form === 'planner-block') {
      const type = form.dataset.type;
      currentPlanner().blocks.push({ id, type, text: data.text.trim(), ...(type === 'todo' ? { checked: false } : {}) });
      persist(); closeModal(); views.renderTasks();
    }
  }

  return { showModal, closeModal, openForm, submitForm };
}
