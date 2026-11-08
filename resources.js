import { collection, completeActivity, getDocs, limit, query } from "./firestore-client.js";
import { $, $$, db, state } from "./core.js";
import { courses } from "./course-catalog.js";

const lessons = [
  {
    id: "cs-python-variables",
    course: "Computer Science",
    subject: "computer-science",
    category: "Computer Science · Programming",
    title: "Understand variables and data types",
    intro: "A variable is a named storage location in memory used to hold data that can change during program execution.",
    learn: [
      "Use descriptive names for variables following standard conventions.",
      "Understand basic data types: strings, integers, floats, and booleans.",
      "Assign values using the assignment operator (=).",
      "Convert between data types when performing operations."
    ],
    example: "score = 100",
    working: ["The variable name is score.", "The value assigned is an integer: 100.", "The data type can be checked using type(score).", "The value can be updated later in the program."],
    question: "Which of the following is a boolean value?",
    options: ["\"True\"", "True", "1", "\"False\""],
    answer: 1,
    explanation: "True (without quotes and capitalized) represents a boolean value in Python.",
    correction: "Booleans represent truth values: True or False."
  }
];

let lessonUser = null;
let lessonProgress = {};
let bound = false;
const lessonPages = {
  "cs-python-variables": "computer-science/notes/variables-and-data-types"
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function completed(lessonId) {
  return Boolean(lessonProgress[lessonId]?.completed);
}

function renderCourseCards() {
  const container = $("#subject-course-grid");
  if (!container) return;
  container.innerHTML = courses.map((card) => {
    const courseLessons = lessons.filter((lesson) => lesson.course === card.lessonCourse);
    const done = courseLessons.filter((lesson) => completed(lesson.id)).length;
    return `<article class="subject-course ${card.tone}">
      <div class="subject-course-top"><span class="subject-course-icon">${escapeHtml(card.icon)}</span><span>${courseLessons.length ? `${courseLessons.length} ${courseLessons.length === 1 ? "mini-lesson" : "mini-lessons"}` : `${card.notes.length} ${card.notes.length === 1 ? "topic" : "topics"}`}</span></div>
      <p class="subject-course-label">${escapeHtml(card.group.toUpperCase())} · NOTES & PRACTICE</p><h3>${escapeHtml(card.title)}</h3><p class="subject-course-description">${escapeHtml(card.description)}</p>
      ${courseLessons.length ? `<div class="course-progress"><span>${done} of ${courseLessons.length} mini-lessons complete</span><i><b style="width:${Math.round(done / courseLessons.length * 100)}%"></b></i></div>` : `<div class="course-progress"><span>${card.notes.length} notes · ${card.worksheets.length} worksheet</span></div>`}
      <div class="course-open-links"><a class="course-open" href="/content/${card.slug}/notes/">Notes <span>→</span></a><a class="course-open" href="/content/${card.slug}/worksheets/">Worksheets <span>→</span></a></div>
    </article>`;
  }).join("");
}

function renderLessons(container) {
  container.innerHTML = lessons.map((lesson, index) => `
    <article class="resource-pick lesson-card ${index % 3 === 0 ? "pick-maths" : index % 3 === 1 ? "pick-science" : "pick-bitesize"}" data-subjects="${lesson.subject}" data-lesson-id="${lesson.id}">
      <span class="pick-topline"><span>${escapeHtml(lesson.category.slice(0, 1))}</span> STUDYGROUP LESSON · 5 MIN</span>
      <strong>${escapeHtml(lesson.title)}</strong>
      <p>${escapeHtml(lesson.intro)}</p>
      <div class="lesson-card-footer"><span class="lesson-completion" data-lesson-status="${lesson.id}">+10 XP on completion</span><a class="lesson-page-link" href="/content/${lessonPages[lesson.id]}/">Open full lesson →</a><button class="button button-light" type="button" data-lesson-toggle="${lesson.id}" aria-expanded="false">Quick lesson</button></div>
      <div class="lesson-body" id="lesson-body-${lesson.id}" hidden>
        <section><h4>By the end, you can…</h4><ul class="lesson-steps">${lesson.learn.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul></section>
        <section class="lesson-example"><h4>Worked example</h4><p class="lesson-problem">${escapeHtml(lesson.example)}</p><ol>${lesson.working.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>
        <form class="lesson-quiz" data-lesson-quiz="${lesson.id}">
          <h4>Quick check</h4><fieldset><legend>${escapeHtml(lesson.question)}</legend>
            ${lesson.options.map((option, optionIndex) => `<label><input type="radio" name="answer" value="${optionIndex}"><span>${escapeHtml(option)}</span></label>`).join("")}
          </fieldset>
          <button type="submit" class="button button-dark">Check answer</button>
          <p class="lesson-feedback" data-lesson-feedback="${lesson.id}" role="status" aria-live="polite"></p>
        </form>
      </div>
      <span class="pick-decoration" aria-hidden="true">${["∑", "◉", "⚛", "⌁", "“", "◷", "é"][index % 7]}</span>
    </article>`).join("");
  renderCourseCards();
  renderLessonProgress();
}

function renderLessonProgress() {
  $$("[data-lesson-status]").forEach((element) => {
    const done = completed(element.dataset.lessonStatus);
    element.textContent = done ? "Completed · +10 XP" : "Earn +10 XP";
    element.classList.toggle("is-complete", done);
  });
  const totalXp = Object.values(lessonProgress).reduce((sum, entry) => sum + (entry.completed ? Number(entry.xp) || 10 : 0), 0);
  const xp = $("#stat-xp");
  if (xp) xp.textContent = String(totalXp);
  window.dispatchEvent(new CustomEvent("studygroup:xpprogress", { detail: { xp: totalXp } }));
  renderCourseCards();
}

function applyResourceFilter() {
  const active = $("[data-resource-filter].is-active");
  const topic = active ? active.dataset.resourceFilter : "all";
  const search = $("#resource-search");
  const term = search ? search.value.trim().toLowerCase() : "";
  let shown = 0;
  $$(".resource-pick").forEach((card) => {
    const subjects = card.dataset.subjects.split(" ");
    const matchesTopic = topic === "all" || subjects.includes(topic);
    const matchesTerm = !term || card.textContent.toLowerCase().includes(term);
    card.hidden = !(matchesTopic && matchesTerm);
    if (!card.hidden) shown += 1;
  });
  const empty = $("#resource-empty");
  if (empty) empty.hidden = shown > 0;
}

function filterToSubject(subject) {
  const chip = $(`[data-resource-filter="${subject}"]`);
  if (!chip) return;
  $$("[data-resource-filter]").forEach((other) => other.classList.toggle("is-active", other === chip));
  const search = $("#resource-search");
  if (search) search.value = "";
  applyResourceFilter();
  $("#resources").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function completeLesson(lesson, feedback) {
  if (completed(lesson.id)) {
    feedback.textContent = `Already completed. ${lesson.explanation}`;
    feedback.classList.add("is-correct");
    return;
  }
  if (!lessonUser) {
    feedback.textContent = `Correct! ${lesson.explanation} Sign in to save your progress and earn XP.`;
    feedback.classList.add("is-correct");
    return;
  }
  try {
    const result = await completeActivity(lesson.id);
    lessonProgress[lesson.id] = { completed: true, xp: result.xp || 10 };
    renderLessonProgress();
    feedback.textContent = result.awarded
      ? `Correct! ${lesson.explanation} +10 XP earned.`
      : `Correct! ${lesson.explanation} You've already earned XP for this lesson.`;
    feedback.classList.add("is-correct");
  } catch (error) {
    console.error("Could not save lesson progress.", error);
    feedback.textContent = `Your answer is correct, but we couldn't save the XP: ${error.message || "please try again."}`;
    feedback.classList.add("is-error");
  }
}

function bindLessonInteractions(container) {
  container.addEventListener("click", async (event) => {
    const course = event.target.closest("[data-open-subject]");
    if (course) {
      filterToSubject(course.dataset.openSubject);
      return;
    }
    const toggle = event.target.closest("[data-lesson-toggle]");
    if (!toggle) return;
    const body = $(`#lesson-body-${CSS.escape(toggle.dataset.lessonToggle)}`);
    body.hidden = !body.hidden;
    toggle.setAttribute("aria-expanded", String(!body.hidden));
    toggle.textContent = body.hidden ? "Start lesson" : "Close lesson";
  });
  container.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-lesson-quiz]");
    if (!form) return;
    event.preventDefault();
    const lesson = lessons.find((entry) => entry.id === form.dataset.lessonQuiz);
    const feedback = $(`[data-lesson-feedback="${lesson.id}"]`);
    const answer = form.querySelector('input[name="answer"]:checked');
    feedback.classList.remove("is-correct", "is-error");
    if (!answer) {
      feedback.textContent = "Choose an answer first, then check it.";
      return;
    }
    if (Number(answer.value) !== lesson.answer) {
      feedback.textContent = `Not quite yet. ${lesson.correction}`;
      feedback.classList.add("is-error");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    await completeLesson(lesson, feedback);
    button.disabled = false;
  });
}

export async function setLessonUser(user) {
  lessonUser = user;
  lessonProgress = {};
  if (!user) {
    renderLessonProgress();
    return;
  }
  try {
    const progress = await getDocs(query(collection(db, "users", user.uid, "learningProgress"), limit(100)));
    lessonProgress = Object.fromEntries(progress.docs.map((entry) => [entry.id, entry.data()]));
    renderLessonProgress();
  } catch (error) {
    console.error("Could not load lesson progress.", error);
    const status = $("#lesson-library-status");
    if (status) status.textContent = "Lessons are available, but saved progress could not be loaded.";
  }
}

export function initResourceFilter() {
  const container = $("#resource-picks");
  if (container) {
    renderLessons(container);
    if (!bound) bindLessonInteractions(container);
  }
  bound = Boolean(container);
  $$("[data-resource-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("[data-resource-filter]").forEach((other) => other.classList.toggle("is-active", other === chip));
      applyResourceFilter();
    });
  });
  $("#resource-search")?.addEventListener("input", applyResourceFilter);
  applyResourceFilter();
}
