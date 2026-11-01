export const SUBJECTS = [
  "General",
  "Maths",
  "English Language",
  "English Literature",
  "Biology",
  "Chemistry",
  "Physics",
  "Combined Science",
  "History",
  "Geography",
  "Computer Science",
  "Languages",
  "Religious Studies",
  "Other"
];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function cleanNickname(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function validNickname(value) {
  return /^[A-Za-z0-9 _.-]{2,24}$/.test(value);
}

export function sanitizeNickname(value, fallback) {
  const stripped = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 _.-]/g, "");
  const cleaned = cleanNickname(stripped).slice(0, 24).trim();
  return validNickname(cleaned) ? cleaned : fallback;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function daysUntil(dateString, now = new Date()) {
  const target = new Date(`${dateString}T00:00:00`);
  return Math.round((target - startOfDay(now)) / 86400000);
}

export function formatDay(dateString) {
  const target = new Date(`${dateString}T00:00:00`);
  return `${target.getDate()} ${MONTHS[target.getMonth()]}`;
}

export function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function describeDue(dateString, now = new Date()) {
  if (!dateString) return "No due date";
  const days = daysUntil(dateString, now);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "Overdue by 1 day";
  if (days < 0) return `Overdue by ${Math.abs(days)} days`;
  if (days < 7) return `Due in ${days} days`;
  return `Due ${formatDay(dateString)}`;
}

export function describeCountdown(dateString, now = new Date()) {
  const days = daysUntil(dateString, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return "Finished";
  if (days < 14) return `${days} days to go`;
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  return rest ? `${weeks}w ${rest}d to go` : `${weeks} weeks to go`;
}

export function parseCards(text) {
  const cards = [];
  let skipped = 0;
  String(text || "").split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/\s*\|\s*|\t+/);
    if (parts.length < 2) {
      skipped += 1;
      return;
    }
    const question = parts[0].trim();
    const answer = parts.slice(1).join(" | ").trim();
    const valid = question.length >= 1 && question.length <= 200 && answer.length >= 1 && answer.length <= 400;
    if (!valid || cards.length >= 100) {
      skipped += 1;
      return;
    }
    cards.push({ q: question, a: answer });
  });
  return { cards, skipped };
}

export function shuffle(list, random = Math.random) {
  const copy = list.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function makeCode(randomValues) {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += CODE_ALPHABET[randomValues[index] % CODE_ALPHABET.length];
  }
  return code;
}

export function computeStats(sessions, tasks, now = new Date()) {
  const minutesByDay = new Map();
  sessions.forEach((session) => {
    if (!session.date) return;
    const key = dateKey(session.date);
    minutesByDay.set(key, (minutesByDay.get(key) || 0) + session.minutes);
  });

  const today = startOfDay(now);
  const bars = [];
  let week = 0;
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const minutes = minutesByDay.get(dateKey(day)) || 0;
    week += minutes;
    bars.push({ key: dateKey(day), label: WEEKDAYS[day.getDay()], minutes });
  }

  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!minutesByDay.has(dateKey(cursor))) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  let streak = 0;
  while (minutesByDay.has(dateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }

  return {
    today: minutesByDay.get(dateKey(today)) || 0,
    week,
    streak,
    open: tasks.filter((task) => !task.done).length,
    bars
  };
}

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export const QUOTES = [
  "Small steps every day beat big pushes once a month.",
  "You don't have to feel ready. You just have to start.",
  "Mistakes in revision are free. Make them now, learn from them now.",
  "Ten focused minutes is better than an hour of scrolling.",
  "Your future self is quietly cheering for you today.",
  "Hard topics get easier the moment you stop avoiding them.",
  "Rest is part of revising. Take the break, then come back strong.",
  "Progress is progress, even when it feels slow.",
  "Ask the question. Someone else in the room is wondering the same thing.",
  "Done is better than perfect when you're building a habit.",
  "Every flashcard you flip is a tiny win.",
  "Be kind to yourself and keep showing up."
];

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

export function quoteOfDay(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return QUOTES[day % QUOTES.length];
}

export function weekStartKey(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  return dateKey(start);
}

export function percentOf(score, outOf) {
  return outOf > 0 ? roundOne((score / outOf) * 100) : 0;
}

export function summariseScores(scores) {
  const groups = new Map();
  scores.forEach((entry) => {
    if (!groups.has(entry.subject)) groups.set(entry.subject, []);
    groups.get(entry.subject).push(entry);
  });
  return Array.from(groups, ([subject, list]) => {
    const ordered = list.slice().sort((first, second) => (first.takenOn < second.takenOn ? -1 : first.takenOn > second.takenOn ? 1 : 0));
    const percents = ordered.map((entry) => percentOf(entry.score, entry.outOf));
    const total = percents.reduce((sum, value) => sum + value, 0);
    const latest = percents[percents.length - 1];
    const trend = percents.length >= 2 ? roundOne(latest - percents[percents.length - 2]) : 0;
    return {
      subject,
      count: percents.length,
      average: roundOne(total / percents.length),
      best: Math.max(...percents),
      latest,
      trend
    };
  }).sort((first, second) => first.subject.localeCompare(second.subject));
}

export function computeBadges(input) {
  const stats = input.stats;
  const totalMinutes = input.sessions.reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
  const doneTasks = input.tasks.filter((task) => task.done).length;
  const cardCount = input.decks.reduce((sum, deck) => sum + (Array.isArray(deck.cards) ? deck.cards.length : 0), 0);
  const ownsGroup = input.groups.some((group) => group.ownerId === input.uid);
  const goal = input.goal;
  const definitions = [
    ["first-focus", "First focus", "Log your first focus session.", input.sessions.length, 1],
    ["hour-power", "Hour power", "Study for 60 minutes in total.", totalMinutes, 60],
    ["ten-hours", "Ten hour club", "Study for 600 minutes in total.", totalMinutes, 600],
    ["streak-3", "On a roll", "Study 3 days in a row.", stats.streak, 3],
    ["streak-7", "Week warrior", "Study 7 days in a row.", stats.streak, 7],
    ["goal-getter", "Goal getter", "Reach your daily goal.", stats.today, goal],
    ["task-starter", "Task starter", "Finish your first task.", doneTasks, 1],
    ["task-master", "Task master", "Finish 25 tasks.", doneTasks, 25],
    ["deck-builder", "Deck builder", "Create your first flashcard deck.", input.decks.length, 1],
    ["card-collector", "Card collector", "Have 50 flashcards.", cardCount, 50],
    ["note-taker", "Note taker", "Write your first note.", input.notes.length, 1],
    ["score-keeper", "Score keeper", "Log your first score.", input.scores.length, 1],
    ["exam-ready", "Exam ready", "Add an exam date.", input.exams.length, 1],
    ["team-player", "Team player", "Join a study group.", input.groups.length, 1],
    ["group-founder", "Group founder", "Start your own group.", ownsGroup ? 1 : 0, 1],
    ["on-the-board", "On the board", "Join the leaderboard.", input.optIn ? 1 : 0, 1]
  ];
  return definitions.map(([id, title, text, value, target]) => ({
    id,
    title,
    text,
    value,
    target,
    unlocked: value >= target,
    progress: `${Math.min(value, target)} / ${target}`
  }));
}
