import { collection, completeActivity, getDocs, limit, query } from "./firestore-client.js";
import { $, $$, db, state } from "./core.js";
import { courses } from "./course-catalog.js";

const lessons = [
  {
    id: "maths-linear-equations",
    course: "Maths",
    subject: "maths",
    category: "Mathematics · Algebra",
    title: "Solve linear equations",
    intro: "An equation is a balance. Whatever you do to one side, do to the other, then isolate the unknown.",
    learn: [
      "Collect variable terms on one side and number terms on the other.",
      "Undo addition or subtraction before undoing multiplication or division.",
      "Keep both sides balanced at every step.",
      "Substitute your answer into the original equation to check it."
    ],
    example: "Solve 3(x - 2) + 5 = 20.",
    working: ["Expand the brackets: 3x - 6 + 5 = 20.", "Simplify: 3x - 1 = 20.", "Add 1 to both sides: 3x = 21.", "Divide by 3: x = 7.", "Check: 3(7 - 2) + 5 = 20."],
    question: "Solve 4(x + 1) = 28.",
    options: ["x = 5", "x = 6", "x = 7", "x = 24"],
    answer: 1,
    explanation: "Divide both sides by 4 to get x + 1 = 7, then subtract 1. Therefore x = 6.",
    correction: "Start by dividing both sides by the number multiplying the brackets."
  },
  {
    id: "maths-percentage-change",
    course: "Maths",
    subject: "maths",
    category: "Mathematics · Number",
    title: "Find a percentage change",
    intro: "A percentage change compares the amount of change with the original amount, not the final amount.",
    learn: [
      "Work out the change by subtracting the original value from the new value.",
      "Divide the change by the original value.",
      "Multiply by 100 to convert the fraction to a percentage.",
      "State whether the result is an increase or a decrease."
    ],
    example: "A price rises from £40 to £46.",
    working: ["Change = £46 - £40 = £6.", "Compare with the original: 6 ÷ 40 = 0.15.", "Convert to a percentage: 0.15 × 100 = 15%.", "The price increased by 15%."],
    question: "A quantity falls from 80 to 68. What is the percentage decrease?",
    options: ["12%", "15%", "17.6%", "85%"],
    answer: 1,
    explanation: "The decrease is 12. Divide by the original 80: 12 ÷ 80 × 100 = 15%.",
    correction: "Use the original value, 80, as the denominator."
  },
  {
    id: "maths-straight-line-gradient",
    course: "Maths",
    subject: "maths",
    category: "Mathematics · Graphs",
    title: "Understand gradient",
    intro: "Gradient measures how steep a straight line is: the vertical change divided by the horizontal change.",
    learn: [
      "Choose two clear points on the line.",
      "Find the change in y (the rise).",
      "Find the change in x (the run).",
      "Calculate gradient = change in y ÷ change in x; keep the signs."
    ],
    example: "Find the gradient through (2, 3) and (6, 11).",
    working: ["Change in y = 11 - 3 = 8.", "Change in x = 6 - 2 = 4.", "Gradient = 8 ÷ 4 = 2.", "The line rises 2 units for every 1 unit moved right."],
    question: "What is the gradient through (1, 7) and (4, 1)?",
    options: ["-2", "-1/2", "2", "6"],
    answer: 0,
    explanation: "Change in y is 1 - 7 = -6 and change in x is 4 - 1 = 3. So the gradient is -6 ÷ 3 = -2.",
    correction: "Subtract the y-coordinates and x-coordinates in the same order."
  },
  {
    id: "biology-cell-transport",
    course: "Biology",
    subject: "science",
    category: "Biology · Cells",
    title: "Diffusion, osmosis and active transport",
    intro: "Cells exchange substances across their membranes using different processes, depending on the direction and type of movement.",
    learn: [
      "Diffusion is the net movement of particles from a higher to a lower concentration.",
      "Osmosis is the net movement of water through a partially permeable membrane.",
      "Active transport moves particles against their concentration gradient.",
      "Active transport requires energy released by respiration."
    ],
    example: "A root hair cell absorbs mineral ions from dilute soil.",
    working: ["There are fewer mineral ions in the soil than inside the cell.", "The ions move from lower to higher concentration.", "This is against the concentration gradient.", "The cell uses active transport and energy from respiration."],
    question: "Which process lets oxygen move from the lungs into the blood when oxygen concentration is higher in the lungs?",
    options: ["Active transport", "Diffusion", "Osmosis", "Respiration"],
    answer: 1,
    explanation: "Oxygen particles move down their concentration gradient, so the net movement is diffusion.",
    correction: "Check whether the particles move down or against the concentration gradient."
  },
  {
    id: "chemistry-atoms-and-ions",
    course: "Chemistry",
    subject: "science",
    category: "Chemistry · Atomic structure",
    title: "Work out an ion's charge",
    intro: "An ion forms when an atom gains or loses electrons. Its charge depends on the difference between protons and electrons.",
    learn: [
      "A proton has charge +1; an electron has charge -1; a neutron has no charge.",
      "A neutral atom has equal numbers of protons and electrons.",
      "Losing electrons creates a positive ion; gaining electrons creates a negative ion.",
      "The charge size is the number of electrons gained or lost."
    ],
    example: "A magnesium atom has 12 protons and loses 2 electrons.",
    working: ["It starts neutral with 12 electrons.", "After losing 2, it has 10 electrons and 12 protons.", "There are two more positive charges than negative charges.", "The ion is Mg²⁺."],
    question: "A chlorine atom gains one electron. What charge does its ion have?",
    options: ["1+", "1-", "2-", "0"],
    answer: 1,
    explanation: "Gaining one electron adds one negative charge, so the ion has charge 1-.",
    correction: "Remember: electrons are negative, so gaining one makes the ion more negative."
  },
  {
    id: "physics-series-circuits",
    course: "Physics",
    subject: "science",
    category: "Physics · Electricity",
    title: "Current and resistance in a series circuit",
    intro: "In a series circuit, components share one path. The current is the same at every point in that path.",
    learn: [
      "Current is the rate of flow of electric charge.",
      "The current is equal at every point in a series circuit.",
      "Total resistance in series is the sum of the component resistances.",
      "Use potential difference = current × resistance (V = IR)."
    ],
    example: "A 6 V battery is connected to a 2 Ω resistor and a 1 Ω resistor in series.",
    working: ["Total resistance = 2 + 1 = 3 Ω.", "Rearrange V = IR to get I = V ÷ R.", "Current = 6 ÷ 3 = 2 A.", "The current is 2 A everywhere in the series loop."],
    question: "A 12 V supply is connected across a 4 Ω resistor. What is the current?",
    options: ["0.33 A", "3 A", "8 A", "48 A"],
    answer: 1,
    explanation: "I = V ÷ R = 12 ÷ 4 = 3 A.",
    correction: "Rearrange V = IR to I = V ÷ R."
  },
  {
    id: "english-language-analysis",
    course: "English",
    subject: "english",
    category: "English · Language",
    title: "Build a focused analysis paragraph",
    intro: "A strong analysis explains how a writer's specific choice shapes meaning and a reader's response.",
    learn: [
      "Make one clear point about an idea, character or mood.",
      "Select a short quotation that directly supports that point.",
      "Zoom in on a word or technique and explain its associations.",
      "Link the effect to the reader or the wider moment in the text."
    ],
    example: "“The wind clawed at the door.”",
    working: ["Point: the setting feels threatening.", "Evidence: the writer describes the wind as “clawed”.", "Zoom: “clawed” suggests an animal attacking or scratching.", "Effect: the house feels vulnerable, building tension for the reader."],
    question: "Which comment analyses the word “clawed” most precisely?",
    options: ["It is a verb.", "It makes the sentence longer.", "It suggests a hostile animal attack, making the setting feel unsafe.", "It tells us the door is wooden."],
    answer: 2,
    explanation: "This explains the verb's connotations and connects them to the mood created for the reader.",
    correction: "Go beyond naming a technique: explain what the word suggests and why that matters."
  },
  {
    id: "history-cause-and-consequence",
    course: "History",
    subject: "humanities",
    category: "History · Explanation",
    title: "Explain a chain of cause and consequence",
    intro: "Historical explanation shows how a specific factor led to a change, rather than listing events.",
    learn: [
      "Name a precise cause and place it in its historical context.",
      "Explain how it affected people's choices or circumstances.",
      "Show the next link in the chain: why did that change matter?",
      "Support the explanation with accurate, relevant evidence."
    ],
    example: "Explain how a shortage of food can increase public unrest.",
    working: ["A poor harvest can reduce the food available in a town.", "Scarcity can push food prices up.", "Families on low incomes may struggle to buy enough.", "Anger about hardship can lead to protests or demands for change."],
    question: "Which sentence makes the clearest causal link?",
    options: ["People were unhappy and then there was a protest.", "Food prices rose, so some families could not afford bread; their hardship helped fuel protests.", "There were many events in the town.", "The protest happened in the past."],
    answer: 1,
    explanation: "It connects a specific pressure (prices) to hardship and then to a consequence (protests).",
    correction: "A strong explanation uses connecting language and makes each step in the chain clear."
  },
  {
    id: "french-present-tense",
    course: "French",
    subject: "languages",
    category: "French · Grammar",
    title: "Form regular present-tense -er verbs",
    intro: "Many French verbs use a regular pattern in the present tense. Remove -er, then add an ending for the subject.",
    learn: [
      "For parler (to speak), remove -er to find the stem parl-.",
      "The endings are -e, -es, -e, -ons, -ez, -ent.",
      "Match each ending to je, tu, il/elle, nous, vous, ils/elles.",
      "The written -ent ending is silent in speech."
    ],
    example: "Conjugate parler for nous and ils.",
    working: ["Nous uses -ons: nous parlons (we speak).", "Ils uses -ent: ils parlent (they speak).", "The written endings differ, but both are pronounced with the stem."],
    question: "How do you say “you (plural/formal) speak”?",
    options: ["Tu parles", "Vous parlez", "Vous parlons", "Ils parlent"],
    answer: 1,
    explanation: "Vous takes the -ez ending: vous parlez.",
    correction: "Match vous with -ez."
  },
  {
    id: "spanish-estar",
    course: "Spanish",
    subject: "languages",
    category: "Spanish · Grammar",
    title: "Use estar for location and states",
    intro: "Estar is commonly used to talk about where someone or something is, and about states that can change.",
    learn: [
      "The present-tense forms include estoy, estás, está, estamos, estáis and están.",
      "Use estar for location: Madrid está en España.",
      "Use the form that agrees with the subject.",
      "Estar is one of two common Spanish verbs translated as “to be”; its use depends on meaning."
    ],
    example: "Translate “We are at home.”",
    working: ["The subject is nosotros (we).", "The nosotros form of estar is estamos.", "“At home” is en casa.", "The sentence is Estamos en casa."],
    question: "Complete: nosotros ______ en casa.",
    options: ["estoy", "está", "estamos", "están"],
    answer: 2,
    explanation: "Estamos is the nosotros form of estar.",
    correction: "Match nosotros with estamos."
  }
];

let lessonUser = null;
let lessonProgress = {};
let bound = false;
const lessonPages = {
  "maths-linear-equations": "maths/notes/solving-linear-equations",
  "maths-percentage-change": "maths/notes/percentage-change",
  "maths-straight-line-gradient": "maths/notes/understand-gradient",
  "biology-cell-transport": "biology/notes/moving-substances-in-and-out-of-cells",
  "chemistry-atoms-and-ions": "chemistry/notes/atoms-ions-and-charge",
  "physics-series-circuits": "physics/notes/current-and-resistance-in-a-series-circuit",
  "english-language-analysis": "english/notes/build-an-analysis-paragraph",
  "history-cause-and-consequence": "history/notes/explain-a-chain-of-cause-and-consequence",
  "french-present-tense": "french/notes/regular-present-tense-er-verbs",
  "spanish-estar": "spanish/notes/using-estar-for-temporary-states-and-location"
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
