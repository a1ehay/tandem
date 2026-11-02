import { addDaysISO, initialsByColor } from './utils.js';
  const STORAGE_KEY = 'tandem-tutor-prototype-v2';
  const LEGACY_STORAGE_KEY = 'tandem-tutor-prototype-v1';
  const sampleState = () => ({
    plan: 'light',
    students: [
      { id: 'student-masha', name: 'Маша Крылова', email: 'masha@example.com', subject: 'Математика', grade: '8 класс', note: 'Готовимся к контрольной по дробям и уравнениям.', lessons: 12, progress: 72, color: 0 },
      { id: 'student-ilya', name: 'Илья Соколов', email: 'ilya@example.com', subject: 'Физика', grade: '9 класс', note: 'Разбираем механику и готовимся к ОГЭ.', lessons: 8, progress: 58, color: 1 },
      { id: 'student-sasha', name: 'Саша Миронова', email: 'sasha@example.com', subject: 'Английский', grade: '7 класс', note: 'Расширяем словарный запас и практикуем времена.', lessons: 16, progress: 86, color: 2 }
    ],
    lessons: [
      { id: 'lesson-masha', tutorId: 'tutor-demo', studentId: 'student-masha', boardId: 'board-masha', title: 'Дроби и действия с ними', date: addDaysISO(1), time: '16:00', duration: 60, status: 'scheduled' },
      { id: 'lesson-ilya', tutorId: 'tutor-demo', studentId: 'student-ilya', title: 'Законы Ньютона', date: addDaysISO(1), time: '17:30', duration: 60, status: 'scheduled' },
      { id: 'lesson-sasha', tutorId: 'tutor-demo', studentId: 'student-sasha', title: 'Past Simple и Past Continuous', date: addDaysISO(2), time: '15:00', duration: 45, status: 'scheduled' },
      { id: 'lesson-masha-other', tutorId: 'tutor-demo-2', studentId: 'student-masha', title: 'Практика по дробям', date: addDaysISO(3), time: '18:00', duration: 45, status: 'scheduled' }
    ],
    tasks: [
      { id: 'task-masha', kind: 'homework', tutorId: 'tutor-demo', studentId: 'student-masha', title: 'Действия с обыкновенными дробями', description: 'Решить номера 214, 218 и 221 из учебника.', subject: 'Математика', due: addDaysISO(2), status: 'todo' },
      { id: 'task-ilya', kind: 'homework', tutorId: 'tutor-demo', studentId: 'student-ilya', title: 'Задачи по законам Ньютона', description: 'Разобрать задачу с наклонной плоскостью.', subject: 'Физика', due: addDaysISO(0), status: 'submitted' },
      { id: 'task-sasha', kind: 'homework', tutorId: 'tutor-demo', studentId: 'student-sasha', title: 'Слова и короткий рассказ', description: 'Выучить слова из урока и написать 5 предложений.', subject: 'Английский', due: addDaysISO(3), status: 'todo' },
      { id: 'task-prep', kind: 'personal', tutorId: 'tutor-demo', studentId: null, title: 'Подготовить примеры к уроку', description: 'Подобрать три задачи на действия с дробями.', subject: 'Личное', due: addDaysISO(1), status: 'todo' }
    ],
    currentAccountId: 'tutor-demo',
    accounts: [
      { id: 'tutor-demo', role: 'tutor', name: 'Анна Петрова', email: 'anna@example.com', studentId: null, plan: 'light' },
      { id: 'student-account-masha', role: 'student', name: 'Маша Крылова', email: 'masha@example.com', studentId: 'student-masha' },
      { id: 'student-account-ilya', role: 'student', name: 'Илья Соколов', email: 'ilya@example.com', studentId: 'student-ilya' },
      { id: 'student-account-sasha', role: 'student', name: 'Саша Миронова', email: 'sasha@example.com', studentId: 'student-sasha' },
      { id: 'tutor-demo-2', role: 'tutor', name: 'Дмитрий Волков', email: 'dmitry@example.com', studentId: null, plan: 'light' }
    ],
    tutorLinks: [
      { tutorId: 'tutor-demo', studentId: 'student-masha', note: 'Готовимся к контрольной по дробям и уравнениям.', progress: 72 }, { tutorId: 'tutor-demo', studentId: 'student-ilya', note: 'Разбираем механику и готовимся к ОГЭ.', progress: 58 }, { tutorId: 'tutor-demo', studentId: 'student-sasha', note: 'Расширяем словарный запас и практикуем времена.', progress: 86 },
      { tutorId: 'tutor-demo-2', studentId: 'student-masha', note: 'Отдельный курс практики дробей.', progress: 34 }
    ],
    boards: [
      { id: 'board-masha', tutorId: 'tutor-demo', name: 'Дроби и действия с ними', lessonIds: ['lesson-masha'], elements: [], updatedAt: Date.now() },
      { id: 'board-notes', tutorId: 'tutor-demo', name: 'Новая доска', lessonIds: [], elements: [], updatedAt: Date.now() }
    ],
    currentBoardId: 'board-masha',
    plannerByTutor: {
      'tutor-demo': { title: 'План на неделю', blocks: [
        { id: 'block-title', type: 'heading', text: 'План на неделю' },
        { id: 'block-note', type: 'paragraph', text: 'Соберите мысли, подготовку и задания в одном рабочем пространстве.' },
        { id: 'block-todo', type: 'todo', text: 'Подготовить разогрев по дробям', checked: false },
        { id: 'block-callout', type: 'callout', text: 'После урока с Машей продолжить работу на той же доске.' }
      ] }
    }
  });
  const loadState = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!stored) return sampleState();
      const value = JSON.parse(stored);
      const defaults = sampleState();
      const upgraded = { ...defaults, ...value, students: Array.isArray(value.students) ? value.students : defaults.students, lessons: Array.isArray(value.lessons) ? value.lessons : defaults.lessons, tasks: Array.isArray(value.tasks) ? value.tasks : defaults.tasks };
      upgraded.accounts = Array.isArray(value.accounts) ? value.accounts : defaults.accounts;
      if (!Array.isArray(value.accounts) && value.plan) upgraded.accounts[0].plan = value.plan;
      upgraded.tutorLinks = Array.isArray(value.tutorLinks) ? value.tutorLinks : defaults.tutorLinks;
      upgraded.boards = Array.isArray(value.boards) ? value.boards : defaults.boards;
      upgraded.plannerByTutor = value.plannerByTutor && typeof value.plannerByTutor === 'object' ? value.plannerByTutor : defaults.plannerByTutor;
      if (!value.plannerByTutor && Array.isArray(value.plannerBlocks)) upgraded.plannerByTutor['tutor-demo'] = { title: value.plannerTitle || 'План на неделю', blocks: value.plannerBlocks };
      if (!upgraded.lessons.some((lesson) => lesson.boardId)) upgraded.lessons[0].boardId = upgraded.boards[0]?.id;
      upgraded.currentBoardId = upgraded.boards.some((board) => board.id === value.currentBoardId) ? value.currentBoardId : upgraded.boards[0]?.id;
      return upgraded;
    } catch (_) { return sampleState(); }
  };
  export const state = loadState();
  export const persist = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* storage can be disabled */ }
  };
  export const getStudent = (id) => state.students.find((student) => student.id === id);
  export const getAccount = (id) => state.accounts.find((account) => account.id === id);
  export const currentAccount = () => getAccount(state.currentAccountId) || state.accounts[0];
  export const currentPlan = () => currentAccount()?.plan || state.plan || 'light';
  export const isStudentAccount = () => currentAccount()?.role === 'student';
  export const currentTutorId = () => isStudentAccount() ? null : currentAccount()?.id;
  export const linkedStudentIds = (tutorId = currentTutorId()) => state.tutorLinks.filter((link) => link.tutorId === tutorId).map((link) => link.studentId);
  export const tutorLinkForStudent = (studentId, tutorId = currentTutorId()) => state.tutorLinks.find((link) => link.tutorId === tutorId && link.studentId === studentId);
  export const currentTutorStudents = () => linkedStudentIds().map(getStudent).filter(Boolean);
  export const tasksForCurrentTutor = () => state.tasks.filter((task) => task.tutorId === currentTutorId() || (!task.tutorId && currentTutorId() === 'tutor-demo'));
  export const tasksForCurrentStudent = () => state.tasks.filter((task) => task.kind !== 'personal' && task.studentId === currentAccount()?.studentId);
  export const currentPlanner = () => { const tutorId = currentTutorId() || 'student-planner'; state.plannerByTutor ||= {}; return state.plannerByTutor[tutorId] ||= { title: 'План на неделю', blocks: [] }; };
  export const currentBoard = () => state.boards.find((board) => board.id === state.currentBoardId) || state.boards[0];
export const studentName = (id) => getStudent(id)?.name || 'Ученик';
export const studentColor = (student) => initialsByColor[(student?.color ?? 0) % initialsByColor.length];
export const taskStatusLabel = (status) => ({ todo: 'Назначено', submitted: 'Сдано', complete: 'Проверено' }[status] || 'Назначено');
export const nextLesson = () => {
  const studentIds = isStudentAccount() ? [currentAccount()?.studentId] : linkedStudentIds();
  return state.lessons.filter((lesson) => studentIds.includes(lesson.studentId) && lesson.date >= addDaysISO(0)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
};
export const currentTutorLessons = () => state.lessons.filter((lesson) => linkedStudentIds().includes(lesson.studentId) && (lesson.tutorId === currentTutorId() || (!lesson.tutorId && currentTutorId() === 'tutor-demo')));
