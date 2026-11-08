import { courses } from "./course-catalog.js";
import { lessonGuides } from "./lesson-guides.js";
import { authClient, getCurrentSession, getSessionUser } from "./auth-client.js";
import { collection, completeActivity, doc, getDoc, getDocs, limit, query } from "./firestore-client.js";
import { db } from "./core.js";
import { earnedNameTag } from "./helpers.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const courseSlug = window.location.pathname.split("/").filter(Boolean)[1];
const pageType = window.location.pathname.split("/").filter(Boolean)[2];
const topicSlug = window.location.pathname.split("/").filter(Boolean)[3];
const course = courses.find((entry) => entry.slug === courseSlug);
const slugify = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const note = course?.notes.find((entry) => slugify(entry.title) === topicSlug);
const lessonGuide = topicSlug ? lessonGuides[`${courseSlug}/${topicSlug}`] : null;
const main = document.querySelector("#course-content");

function renderCourseNavigation() {
  return `<nav class="course-side-nav" aria-label="Subjects">
    <a class="course-side-brand" href="/dashboard/" aria-label="StudyGroup home"><img src="/assets/wordmark.png" alt="StudyGroup"></a>
    <a class="course-side-home" href="/dashboard/">← My study space</a>
    <p>SUBJECTS</p>
    ${courses.map((item) => `<a class="course-side-link${item.slug === course?.slug ? " is-current" : ""}" href="/content/${item.slug}/notes/"${item.slug === course?.slug ? ' aria-current="page"' : ""} title="${escapeHtml(item.title)}"><span class="course-side-icon ${item.tone}">${escapeHtml(item.icon)}</span><span class="course-side-name">${escapeHtml(item.title)}</span></a>`).join("")}
    <div class="course-sidebar-account" id="course-sidebar-account"><a href="/?auth=signin">Sign in to your account</a></div>
  </nav>`;
}

function renderNotes() {
  if (topicSlug) return renderFullLesson(note, lessonGuide);
  const notes = topicSlug ? course.notes.filter((entry) => slugify(entry.title) === topicSlug) : course.notes;
  return `<div class="course-material-list">${notes.map((note, index) => `<article class="course-note-card">
    <div class="course-note-kicker">STUDYGROUP NOTES · ${String(index + 1).padStart(2, "0")}</div>
    ${topicSlug ? "" : `<a class="course-note-title-link" href="/content/${course.slug}/notes/${slugify(note.title)}/"><h3>${escapeHtml(note.title)}</h3><span>Open lesson →</span></a>`}
    ${topicSlug ? `<h3>${escapeHtml(note.title)}</h3>` : ""}<p>${escapeHtml(note.summary)}</p>
    <ul>${note.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
    <div class="course-example"><strong>Worked example</strong><p>${escapeHtml(note.example)}</p></div>
  </article>`).join("")}</div>`;
}

function renderFullLesson(lesson, guide) {
  if (!guide) {
    return `<article class="course-note-card"><h2>${escapeHtml(lesson.title)}</h2><p>${escapeHtml(lesson.summary)}</p><ul>${lesson.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul><div class="course-example"><strong>Worked example</strong><p>${escapeHtml(lesson.example)}</p></div></article>`;
  }
  const slides = [
    `<div class="lesson-slide lesson-slide-intro" data-lesson-slide><span class="lesson-slide-kicker">WELCOME · ${escapeHtml(guide.duration)}</span><h2>${escapeHtml(lesson.title)}</h2><p>${escapeHtml(lesson.summary)}</p><h3>By the end, you can…</h3><ul>${lesson.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul><p class="lesson-slide-tip">Move through one idea at a time. Your place is saved on this device, so you can quit and come back later.</p></div>`,
    ...guide.stages.map((stage, index) => `<div class="lesson-slide" data-lesson-slide><span class="lesson-slide-kicker">BUILD THE IDEA · STEP ${index + 1} OF ${guide.stages.length}</span><h2>${escapeHtml(stage.title)}</h2><p>${escapeHtml(stage.text)}</p><div class="lesson-stage-example"><strong>PICTURE IT</strong><span>${escapeHtml(stage.example)}</span></div><label class="lesson-reflection">Make it yours <small>Write one short note or example in your own words.</small><textarea rows="3" maxlength="400" data-reflection="${index}" placeholder="Your thought…"></textarea></label></div>`),
    `<div class="lesson-slide" data-lesson-slide><span class="lesson-slide-kicker">THINK IT THROUGH · WORKED MODEL</span><h2>Let's work through it together.</h2><div class="lesson-worked-prompt"><span>THE QUESTION</span><p>${escapeHtml(lesson.example)}</p></div><ol class="lesson-worked-steps">${guide.worked.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><aside class="lesson-misconception"><span>↗</span><p><strong>Watch out for this</strong>${escapeHtml(guide.misconception)}</p></aside></div>`,
    ...guide.questions.map((question, index) => `<div class="lesson-slide" data-lesson-slide><span class="lesson-slide-kicker">YOUR TURN · CHECK ${index + 1} OF ${guide.questions.length}</span><h2>Try it before you reveal.</h2><p class="lesson-slide-question">${escapeHtml(question.prompt)}</p><form class="lesson-self-check"><label>Your attempt<textarea rows="3" maxlength="500" required placeholder="Write your answer or working…"></textarea></label><button class="lesson-check-button" type="submit">Compare with the answer</button><div class="lesson-answer-reveal" hidden><strong>Suggested answer: ${escapeHtml(question.answer)}</strong><p>${escapeHtml(question.why)}</p><span>Take a moment to compare this with your attempt. You can continue when you're ready.</span></div></form></div>`),
    `<div class="lesson-slide lesson-slide-finish" data-lesson-slide><span class="lesson-slide-kicker">LESSON COMPLETE</span><h2>That's a real step forward.</h2><p>Say the main idea in your own words. When you're ready, save your progress and collect your XP.</p><div class="lesson-finish-reminder"><strong>${escapeHtml(lesson.title)}</strong><span>${escapeHtml(lesson.summary)}</span></div><button class="lesson-complete-button" type="button" data-complete-lesson>Complete lesson · earn 10 XP <span>✓</span></button><p class="lesson-complete-status" data-complete-status role="status" aria-live="polite"></p></div>`
  ];
  return `<section class="lesson-player" data-lesson-slug="${escapeHtml(`${courseSlug}/${topicSlug}`)}" data-activity-id="${escapeHtml(`full-${courseSlug}-${topicSlug}`)}">
    <header class="lesson-player-header"><div><span class="lesson-player-course">${escapeHtml(course.title)} · GUIDED LESSON</span><h2>${escapeHtml(lesson.title)}</h2></div><a class="lesson-quit-button" href="/content/${course.slug}/notes/">Quit lesson <span aria-hidden="true">×</span></a></header>
    <div class="lesson-player-progress"><span data-slide-label>Getting ready…</span><progress max="${slides.length}" value="1" data-slide-progress></progress></div>
    <div class="lesson-slide-viewport">${slides.join("")}</div>
    <footer class="lesson-player-controls"><button class="lesson-nav-button" type="button" data-slide-prev>← Back</button><span data-slide-count></span><button class="lesson-nav-button lesson-nav-next" type="button" data-slide-next>Continue →</button></footer>
  </section>`;
}

function renderWorksheets() {
  return `<div class="course-material-list worksheet-list">${course.worksheets.map((sheet, sheetIndex) => `<article class="course-note-card course-worksheet">
    <div class="course-note-kicker">STUDYGROUP PRACTICE · ${sheet.questions.length} QUESTIONS</div><h3>${escapeHtml(sheet.title)}</h3>
    <p>Enter an answer for each question and check it straight away. Complete the whole sheet to earn 10 XP.</p>
    <form class="worksheet-player" data-worksheet-id="${escapeHtml(`worksheet-${course.slug}-${sheetIndex + 1}`)}">
      <ol class="worksheet-questions">${sheet.questions.map((question, questionIndex) => `<li class="worksheet-question" data-worksheet-question="${questionIndex}">
        <label><span>${escapeHtml(question.prompt)}</span><input type="text" autocomplete="off" maxlength="500" placeholder="Type your answer…" required /></label>
        <button class="worksheet-check-button" type="button" data-check-answer="${questionIndex}">Check answer</button>
        <div class="worksheet-feedback" data-question-feedback="${questionIndex}" role="status" aria-live="polite"></div>
        <details class="worksheet-working"><summary>Show a hint and working</summary><ol>${question.working.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><p><strong>Answer: ${escapeHtml(question.answer)}</strong></p></details>
      </li>`).join("")}</ol>
      <div class="worksheet-result" data-worksheet-result role="status" aria-live="polite">0 of ${sheet.questions.length} correct</div>
      <button class="button button-dark worksheet-complete" type="button" data-complete-worksheet disabled>Complete worksheet · earn 10 XP</button>
    </form>
    <button class="button button-light worksheet-print" type="button">Print this worksheet</button>
  </article>`).join("")}</div>`;
}

function renderSubjectLibrary() {
  const science = courses.filter((item) => item.group === "science");
  const maths = courses.filter((item) => item.group === "maths");
  const english = courses.filter((item) => item.group === "english");
  const humanities = courses.filter((item) => item.group === "humanities");
  const languages = courses.filter((item) => item.group === "languages");
  const sections = [["Mathematics", maths, "Build confidence with numbers, patterns and problem solving."], ["English", english, "Strengthen reading, analysis and communication."], ["Science", science, "Understand the ideas behind the natural world."], ["Humanities & computing", humanities, "Explore people, places, evidence and technology."], ["Languages", languages, "Develop vocabulary and confident communication."]].filter(([, items]) => items.length);
  document.title = "Explore subjects | StudyGroup";
  main.innerHTML = `<div class="course-layout course-library-layout">${renderCourseNavigation()}<section class="course-main course-library-home">
    <div class="library-topline"><a href="/dashboard/">← My study space</a><span>STUDYGROUP SUBJECT LIBRARY</span></div>
    <section class="library-hero"><div class="library-hero-copy"><span class="eyebrow"><span></span> YOUR LEARNING, IN ONE PLACE</span><h1>Make your next study session count.</h1><p>Explore clear notes, guided lessons and practice worksheets, organised by subject and ready whenever you are.</p><a class="library-hero-link" href="#library-subjects">Explore subjects <span>↓</span></a></div><div class="library-hero-art" aria-hidden="true"><div class="library-art-sheet"><span>SG / STUDY NOTES</span><i></i><i></i><i></i><b>01</b></div><div class="library-art-stamp">LEARN<br>STEP BY<br>STEP</div><div class="library-art-orbit"></div></div></section>
    <div class="library-overview-stats"><article><strong>${courses.length}</strong><span>Subjects</span></article><article><strong>${courses.reduce((sum, item) => sum + item.notes.length, 0)}</strong><span>Notes & lessons</span></article><article><strong>${courses.reduce((sum, item) => sum + item.worksheets.length, 0)}</strong><span>Worksheets</span></article><article><strong>Free</strong><span>Always to explore</span></article></div>
    <section class="library-subject-section" id="library-subjects"><div class="library-section-heading"><div><span class="eyebrow"><span></span> THE SUBJECT COLLECTION</span><h2>What are you studying today?</h2><p>Choose a subject to find your notes and practice.</p></div><label class="library-search"><span>⌕</span><input id="subject-search" type="search" placeholder="Search subjects…" aria-label="Search subjects"></label></div>
      ${sections.map(([title, items, description]) => `<section class="library-category" data-library-category><div class="library-category-heading"><div><h3>${title}</h3><p>${description}</p></div><span>${items.length} ${items.length === 1 ? "subject" : "subjects"}</span></div><div class="library-subject-grid">${items.map((item) => `<article class="library-subject-card" data-subject-card data-search="${escapeHtml(`${item.title} ${item.description}`.toLowerCase())}"><a class="library-card-main" href="/content/${item.slug}/notes/"><span class="library-card-icon ${item.tone}">${escapeHtml(item.icon)}</span><span class="library-card-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span><span class="library-card-arrow">↗</span></a><div class="library-card-footer"><a href="/content/${item.slug}/notes/">${item.notes.length} ${item.notes.length === 1 ? "note" : "notes"}</a><a href="/content/${item.slug}/worksheets/">${item.worksheets.length} ${item.worksheets.length === 1 ? "worksheet" : "worksheets"}</a></div></article>`).join("")}</div></section>`).join("")}
      <div class="library-no-results" id="subject-no-results" hidden>No subjects match that search. Try another word.</div>
    </section><footer class="library-footer"><span>STUDYGROUP ACADEMY</span><span>Small steps. Strong foundations.</span><a href="/dashboard/">Back to your study space ↑</a></footer>
  </section></div>`;
  void renderSidebarAccount();
  const search = document.querySelector("#subject-search");
  search?.addEventListener("input", () => {
    const term = search.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll("[data-library-category]").forEach((section) => {
      let count = 0;
      section.querySelectorAll("[data-subject-card]").forEach((card) => {
        const show = !term || card.dataset.search.includes(term);
        card.hidden = !show;
        if (show) count += 1;
      });
      section.hidden = count === 0;
      visible += count;
    });
    const empty = document.querySelector("#subject-no-results");
    if (empty) empty.hidden = visible !== 0;
  });
}

if (window.location.pathname.replace(/\/+$/, "") === "/content" || !course || !["notes", "worksheets"].includes(pageType) || (topicSlug && (!note || pageType !== "notes"))) {
  if (window.location.pathname.replace(/\/+$/, "") === "/content") renderSubjectLibrary();
  else {
    document.title = "StudyGroup subject library";
    main.innerHTML = `<header class="site-header course-header"><a class="brand" href="/"><img src="/assets/wordmark.png" alt="StudyGroup"></a><nav class="site-nav" aria-label="Main navigation"><a href="/dashboard/">My study space</a></nav></header><section class="course-not-found"><span class="eyebrow"><span></span> SUBJECT LIBRARY</span><h1>Find your next step.</h1><p>Choose a subject to open its notes and practice worksheets.</p><div class="course-not-found-links">${courses.map((item) => `<a class="course-side-link" href="/content/${item.slug}/notes/"><span class="course-side-icon ${item.tone}">${escapeHtml(item.icon)}</span>${escapeHtml(item.title)} <span>→</span></a>`).join("")}</div></section>`;
  }
} else {
  const label = topicSlug ? "Lesson" : pageType === "notes" ? "Notes" : "Worksheets";
  document.title = `${topicSlug ? note.title : `${course.title} ${label}`} | StudyGroup`;
  main.innerHTML = `<div class="course-layout">${renderCourseNavigation()}
    <section class="course-main">
      <a class="course-breadcrumb" href="/content/">All subjects <span>›</span> ${escapeHtml(course.title)}</a>
      <div class="course-page-heading"><span class="course-side-icon ${course.tone}">${escapeHtml(course.icon)}</span><div><span class="eyebrow"><span></span> FREE STUDYGROUP LEARNING</span><h1>${escapeHtml(topicSlug ? note.title : `${course.title} ${label.toLowerCase()}`)}</h1><p>${escapeHtml(course.description)} Original starter materials, written for StudyGroup.</p></div></div>
      <nav class="course-view-tabs" aria-label="${escapeHtml(course.title)} materials">
        <a href="/content/${course.slug}/notes/"${pageType === "notes" ? ' aria-current="page"' : ""}>Notes <span>${course.notes.length}</span></a>
        <a href="/content/${course.slug}/worksheets/"${pageType === "worksheets" ? ' aria-current="page"' : ""}>Worksheets <span>${course.worksheets.length}</span></a>
      </nav>
      ${topicSlug ? `<a class="course-back-link" href="/content/${course.slug}/notes/">← All ${escapeHtml(course.title)} notes</a>` : ""}
      ${pageType === "notes" ? renderNotes() : renderWorksheets()}
      <p class="course-disclaimer">These are original starter resources, not a complete exam-board specification. Check your course specification and your teacher's guidance.</p>
    </section>
  </div>`;
  void renderSidebarAccount();
  bindFullLesson();
  bindWorksheets();
}

function bindFullLesson() {
  const lesson = document.querySelector(".lesson-player");
  if (!lesson) return;
  const slides = Array.from(lesson.querySelectorAll("[data-lesson-slide]"));
  const previous = lesson.querySelector("[data-slide-prev]");
  const next = lesson.querySelector("[data-slide-next]");
  const progress = lesson.querySelector("[data-slide-progress]");
  const count = lesson.querySelector("[data-slide-count]");
  const label = lesson.querySelector("[data-slide-label]");
  const stepKey = `studygroup-lesson-step:${lesson.dataset.lessonSlug}`;
  const completionKey = `studygroup-lesson:${lesson.dataset.lessonSlug}`;
  let activeIndex = 0;
  try {
    activeIndex = Math.min(slides.length - 1, Math.max(0, Number(localStorage.getItem(stepKey)) || 0));
  } catch (error) {
    console.error("Could not restore the lesson position.", error);
  }
  const showSlide = (index) => {
    activeIndex = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== activeIndex; });
    progress.value = activeIndex + 1;
    count.textContent = `${activeIndex + 1} / ${slides.length}`;
    label.textContent = activeIndex === slides.length - 1 ? "Ready to finish" : `Step ${activeIndex + 1} of ${slides.length}`;
    previous.disabled = activeIndex === 0;
    next.hidden = activeIndex === slides.length - 1;
    next.disabled = false;
    try {
      localStorage.setItem(stepKey, String(activeIndex));
    } catch (error) {
      console.error("Could not save the lesson position.", error);
    }
  };
  const selfChecks = Array.from(lesson.querySelectorAll(".lesson-self-check"));
  selfChecks.forEach((form, index) => {
    const savedAnswerKey = `${stepKey}:answer:${index}`;
    const checkedKey = `${stepKey}:checked:${index}`;
    const answer = form.querySelector("textarea");
    try {
      answer.value = localStorage.getItem(savedAnswerKey) || "";
      if (localStorage.getItem(checkedKey) === "true") {
        form.dataset.checked = "true";
        form.querySelector(".lesson-answer-reveal").hidden = false;
        form.querySelector(".lesson-check-button").disabled = true;
      }
    } catch (error) {
      console.error("Could not restore a saved self-check.", error);
    }
    answer.addEventListener("input", () => {
      try { localStorage.setItem(savedAnswerKey, answer.value); } catch (error) {
        console.error("Could not save your self-check response.", error);
      }
    });
  });
  lesson.addEventListener("submit", (event) => {
    const form = event.target.closest(".lesson-self-check");
    if (!form) return;
    event.preventDefault();
    const answer = form.querySelector("textarea");
    if (!answer.value.trim()) {
      answer.focus();
      answer.setCustomValidity("Write an attempt before comparing answers.");
      answer.reportValidity();
      answer.setCustomValidity("");
      return;
    }
    form.dataset.checked = "true";
    form.querySelector(".lesson-answer-reveal").hidden = false;
    form.querySelector(".lesson-check-button").disabled = true;
    const formIndex = selfChecks.indexOf(form);
    try { localStorage.setItem(`${stepKey}:checked:${formIndex}`, "true"); } catch (error) {
      console.error("Could not save your self-check progress.", error);
    }
  });
  lesson.querySelectorAll("[data-reflection]").forEach((input) => {
    const key = `${stepKey}:reflection:${input.dataset.reflection}`;
    try { input.value = localStorage.getItem(key) || ""; } catch (error) {
      console.error("Could not restore a saved reflection.", error);
    }
    input.addEventListener("input", () => {
      try { localStorage.setItem(key, input.value); } catch (error) {
        console.error("Could not save a lesson reflection.", error);
      }
    });
  });
  previous.addEventListener("click", () => showSlide(activeIndex - 1));
  next.addEventListener("click", () => showSlide(activeIndex + 1));
  const completeButton = lesson.querySelector("[data-complete-lesson]");
  const status = lesson.querySelector("[data-complete-status]");
  completeButton.addEventListener("click", async () => {
    completeButton.disabled = true;
    completeButton.textContent = "Saving your progress…";
    try {
      const session = await getCurrentSession();
      if (session.error) throw session.error;
      if (getSessionUser(session)) {
        const result = await completeActivity(lesson.dataset.activityId);
        status.textContent = result.awarded
          ? "Lesson complete — 10 XP earned. Your progress is saved to your account."
          : "You already completed this lesson and earned its XP.";
      } else {
        status.textContent = "Lesson complete on this device. Sign in to save progress and earn leaderboard XP.";
      }
      localStorage.setItem(completionKey, "completed");
      localStorage.removeItem(stepKey);
      completeButton.classList.add("is-complete");
      completeButton.textContent = "Lesson complete ✓";
    } catch (error) {
      console.error("Could not complete the lesson.", error);
      status.textContent = error.message || "Progress could not be saved. Please try again.";
      completeButton.disabled = false;
      completeButton.textContent = "Try saving again · earn 10 XP";
    }
  });
  showSlide(activeIndex);
}

function normalizeAnswer(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[−–]/g, "-").replace(/[\s.,!?;:'"()\[\]{}]/g, "");
}

function bindWorksheets() {
  document.querySelectorAll(".worksheet-player").forEach((worksheet) => {
    const questions = Array.from(worksheet.querySelectorAll("[data-worksheet-question]"));
    const result = worksheet.querySelector("[data-worksheet-result]");
    const completeButton = worksheet.querySelector("[data-complete-worksheet]");
    const completionKey = `studygroup-worksheet:${worksheet.dataset.worksheetId}`;
    let completedOnDevice = false;
    try { completedOnDevice = localStorage.getItem(completionKey) === "completed"; } catch (error) {
      console.error("Could not restore worksheet completion.", error);
    }
    if (completedOnDevice) result.textContent = "Worksheet completed on this device. Check your answers again any time.";
    worksheet.addEventListener("click", async (event) => {
      const checkButton = event.target.closest("[data-check-answer]");
      if (checkButton) {
        const question = questions[Number(checkButton.dataset.checkAnswer)];
        const input = question.querySelector("input");
        const feedback = question.querySelector("[data-question-feedback]");
        const sheet = course.worksheets[Number(worksheet.dataset.worksheetId.split("-").at(-1)) - 1];
        const correctAnswer = sheet.questions[Number(checkButton.dataset.checkAnswer)].answer;
        if (!input.value.trim()) {
          input.focus();
          feedback.textContent = "Enter an answer before checking.";
          feedback.classList.add("is-error");
          return;
        }
        feedback.classList.remove("is-error", "is-correct");
        if (normalizeAnswer(input.value) === normalizeAnswer(correctAnswer)) {
          question.dataset.correct = "true";
          input.disabled = true;
          checkButton.disabled = true;
          feedback.innerHTML = `<strong>Correct!</strong> ${escapeHtml(sheet.questions[Number(checkButton.dataset.checkAnswer)].working.join(" "))} Answer: ${escapeHtml(correctAnswer)}`;
          feedback.classList.add("is-correct");
        } else {
          feedback.textContent = `Not quite yet. Try again; hint: ${sheet.questions[Number(checkButton.dataset.checkAnswer)].working[0]}`;
          feedback.classList.add("is-error");
        }
        const score = questions.filter((item) => item.dataset.correct === "true").length;
        result.textContent = `${score} of ${questions.length} correct`;
        completeButton.disabled = score !== questions.length;
        return;
      }
      if (event.target.closest(".worksheet-print")) window.print();
      const awardButton = event.target.closest("[data-complete-worksheet]");
      if (!awardButton || awardButton.disabled) return;
      awardButton.disabled = true;
      awardButton.textContent = "Saving your progress…";
      try {
        const session = await getCurrentSession();
        if (session.error) throw session.error;
        if (getSessionUser(session)) {
          const award = await completeActivity(worksheet.dataset.worksheetId);
          result.textContent = award.awarded
            ? "All answers correct — 10 XP earned. Your progress is saved."
            : "Worksheet complete — you already earned its XP.";
        } else {
          result.textContent = "All answers correct — worksheet completed on this device. Sign in to save it and earn XP.";
        }
        localStorage.setItem(completionKey, "completed");
        awardButton.textContent = "Worksheet complete ✓";
      } catch (error) {
        console.error("Could not save worksheet completion.", error);
        result.textContent = error.message || "Progress could not be saved. Please try again.";
        awardButton.disabled = false;
        awardButton.textContent = "Try saving again · earn 10 XP";
      }
    });
  });
}

async function renderSidebarAccount() {
  const container = document.querySelector("#course-sidebar-account");
  if (!container) return;
  try {
    const result = await getCurrentSession();
    if (result.error) throw result.error;
    const user = getSessionUser(result);
    if (!user) return;
    let name = user.name || user.email?.split("@")[0] || "Learner";
    let handle = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15) || "learner";
    let nameTag = null;
    try {
      const userId = user.uid || user.id;
      if (!userId) throw new Error("The signed-in account does not include a user ID.");
      const profile = await getDoc(doc(db, "users", userId));
      const profileData = profile.data() || {};
      const isPlaceholder = (value) => !value || ["learner", "student", "user"].includes(String(value).trim().toLowerCase());
      const displayName = [profileData.nickname, profileData.displayName].find((value) => !isPlaceholder(value));
      if (displayName) name = String(displayName).trim();
      handle = profile.data()?.handle || handle;
      const progress = await getDocs(query(collection(db, "users", userId, "learningProgress"), limit(100)));
      const xp = progress.docs.reduce((total, entry) => {
        const data = entry.data();
        return data.completed ? total + (Number(data.xp) || 10) : total;
      }, 0);
      nameTag = earnedNameTag(xp);
    } catch (error) {
      console.error("Could not load the account name for the subject library.", error);
    }
    container.innerHTML = `<details class="course-account-menu">
      <summary><span class="course-account-avatar">${escapeHtml(name.slice(0, 1).toUpperCase())}</span><span class="course-account-copy"><strong>${escapeHtml(name)}${nameTag ? ` <span class="earned-name-tag">${escapeHtml(`[${nameTag.tag}]`)}</span>` : ""}</strong><small>@${escapeHtml(handle)}</small></span><span class="course-account-chevron"></span></summary>
      <div class="course-account-popover"><a href="/dashboard/?settings=profile">Profile & account settings</a><a href="/dashboard/">My study dashboard</a><button type="button" id="course-sign-out">Log out</button></div>
    </details>`;
    container.querySelector("#course-sign-out").addEventListener("click", async () => {
      try {
        const signedOut = await authClient.signOut();
        if (signedOut?.error) throw signedOut.error;
        const sessionResult = await getCurrentSession();
        if (sessionResult?.error) throw sessionResult.error;
        if (getSessionUser(sessionResult)) throw new Error("Your session is still active. Please try logging out again.");
        window.location.assign(new URL("/", window.location.origin).toString());
      } catch (error) {
        console.error("Could not sign out from the subject library.", error);
        container.insertAdjacentHTML("beforeend", `<p class="course-account-error">${escapeHtml(error.message || "Sign out failed. Please try again.")}</p>`);
      }
    });
  } catch (error) {
    console.error("Could not load the signed-in account menu for the subject library.", error);
    container.innerHTML = '<a href="/dashboard/">Open my study dashboard</a>';
  }
}
