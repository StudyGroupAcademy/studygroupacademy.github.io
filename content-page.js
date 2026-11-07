import { courses } from "./course-catalog.js";
import { lessonGuides } from "./lesson-guides.js";
import { authClient } from "./auth-client.js";
import { doc, getDoc } from "./firestore-client.js";
import { db } from "./core.js";

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
    ${courses.map((item) => `<a class="course-side-link${item.slug === course.slug ? " is-current" : ""}" href="/content/${item.slug}/notes/"${item.slug === course.slug ? ' aria-current="page"' : ""} title="${escapeHtml(item.title)}"><span class="course-side-icon ${item.tone}">${escapeHtml(item.icon)}</span><span class="course-side-name">${escapeHtml(item.title)}</span></a>`).join("")}
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
  return `<div class="full-lesson" data-lesson-slug="${escapeHtml(`${courseSlug}/${topicSlug}`)}">
    <section class="lesson-welcome">
      <div><span class="lesson-welcome-kicker">YOUR LEARNING PATH · ${escapeHtml(guide.duration)}</span><h2>Understand it. Practise it. Make it stick.</h2><p>${escapeHtml(lesson.summary)} This lesson moves from the core idea to a worked model and independent retrieval practice.</p></div>
      <a class="lesson-start-button" href="#lesson-ideas">Start learning <span>↓</span></a>
    </section>
    <div class="lesson-roadmap" aria-label="Lesson sections">
      <a href="#lesson-goals"><span>01</span> Goals</a><a href="#lesson-ideas"><span>02</span> Build the idea</a><a href="#lesson-worked"><span>03</span> Worked model</a><a href="#lesson-practice"><span>04</span> Practice</a>
    </div>
    <section class="lesson-goals" id="lesson-goals">
      <div class="lesson-section-heading"><span class="lesson-section-number">01</span><div><span class="lesson-section-label">YOUR DESTINATION</span><h2>By the end, you can…</h2></div></div>
      <div class="lesson-goal-grid">${lesson.points.map((point, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(point)}</p></article>`).join("")}</div>
    </section>
    <section class="lesson-ideas" id="lesson-ideas">
      <div class="lesson-section-heading"><span class="lesson-section-number">02</span><div><span class="lesson-section-label">BUILD THE IDEA</span><h2>Learn it in small steps.</h2></div></div>
      <div class="lesson-stage-list">${guide.stages.map((stage, index) => `<article class="lesson-stage"><span class="lesson-stage-index">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(stage.title)}</h3><p>${escapeHtml(stage.text)}</p><div class="lesson-stage-example"><strong>Picture it</strong><span>${escapeHtml(stage.example)}</span></div></div></article>`).join("")}</div>
    </section>
    <section class="lesson-worked" id="lesson-worked">
      <div class="lesson-section-heading"><span class="lesson-section-number">03</span><div><span class="lesson-section-label">THINK IT THROUGH</span><h2>Worked example, step by step.</h2></div></div>
      <div class="lesson-worked-card"><div class="lesson-worked-prompt"><span>THE QUESTION</span><p>${escapeHtml(lesson.example)}</p></div><ol>${guide.worked.map((step) => `<li><span>${escapeHtml(step)}</span></li>`).join("")}</ol></div>
      <aside class="lesson-misconception"><span>↗</span><p><strong>Watch out for this</strong>${escapeHtml(guide.misconception)}</p></aside>
    </section>
    <section class="lesson-practice" id="lesson-practice">
      <div class="lesson-section-heading"><span class="lesson-section-number">04</span><div><span class="lesson-section-label">RETRIEVAL PRACTICE</span><h2>Now try it without looking.</h2><p>Have a go first, then open the answer and explanation to check your thinking.</p></div></div>
      <div class="lesson-question-list">${guide.questions.map((question, index) => `<article class="lesson-question"><span class="lesson-question-index">CHECK ${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(question.prompt)}</p><details><summary>Reveal answer and reasoning</summary><div><strong>${escapeHtml(question.answer)}</strong><p>${escapeHtml(question.why)}</p></div></details></article>`).join("")}</div>
    </section>
    <section class="lesson-finish">
      <div><span class="lesson-section-label">A SMALL WIN COUNTS</span><h2>What will you remember?</h2><p>Say the main idea in your own words, then mark the lesson complete when you feel ready.</p></div>
      <button class="lesson-complete-button" type="button" data-complete-lesson>Mark lesson complete <span>✓</span></button>
      <p class="lesson-complete-status" data-complete-status role="status" aria-live="polite"></p>
    </section>
  </div>`;
}

function renderWorksheets() {
  return `<div class="course-material-list">${course.worksheets.map((sheet) => `<article class="course-note-card course-worksheet">
    <div class="course-note-kicker">STUDYGROUP PRACTICE</div><h3>${escapeHtml(sheet.title)}</h3>
    <ol class="worksheet-questions">${sheet.questions.map((question) => `<li>
      <p>${escapeHtml(question.prompt)}</p>
      <details><summary>Show answer and working</summary><p><strong>${escapeHtml(question.answer)}</strong></p><ol>${question.working.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></details>
    </li>`).join("")}</ol>
    <button class="button button-light" type="button" onclick="window.print()">Print this worksheet</button>
  </article>`).join("")}</div>`;
}

if (!course || !["notes", "worksheets"].includes(pageType) || (topicSlug && (!note || pageType !== "notes"))) {
  document.title = "StudyGroup subject library";
  main.innerHTML = `<header class="site-header course-header"><a class="brand" href="/"><img src="/assets/wordmark.png" alt="StudyGroup"></a><nav class="site-nav" aria-label="Main navigation"><a href="/dashboard/">My study space</a></nav></header><section class="course-not-found"><span class="eyebrow"><span></span> SUBJECT LIBRARY</span><h1>Find your next step.</h1><p>Choose a subject to open its notes and practice worksheets.</p><div class="course-not-found-links">${courses.map((item) => `<a class="course-side-link" href="/content/${item.slug}/notes/"><span class="course-side-icon ${item.tone}">${escapeHtml(item.icon)}</span>${escapeHtml(item.title)} <span>→</span></a>`).join("")}</div></section>`;
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
  bindLessonCompletion();
}

function bindLessonCompletion() {
  const lesson = document.querySelector("[data-lesson-slug]");
  if (!lesson) return;
  const key = `studygroup-lesson:${lesson.dataset.lessonSlug}`;
  const button = lesson.querySelector("[data-complete-lesson]");
  const status = lesson.querySelector("[data-complete-status]");
  const markComplete = () => {
    try {
      localStorage.setItem(key, "completed");
      button.classList.add("is-complete");
      button.innerHTML = "Lesson complete <span>✓</span>";
      status.textContent = "Nice work. Your progress is saved on this device.";
    } catch (error) {
      console.error("Could not save this lesson's completion status.", error);
      status.textContent = "The lesson is complete, but progress could not be saved in this browser.";
    }
  };
  try {
    if (localStorage.getItem(key) === "completed") {
      button.classList.add("is-complete");
      button.innerHTML = "Lesson complete <span>✓</span>";
      status.textContent = "You've already completed this lesson on this device.";
    }
  } catch (error) {
    console.error("Could not load this lesson's completion status.", error);
  }
  button.addEventListener("click", markComplete);
}

async function renderSidebarAccount() {
  const container = document.querySelector("#course-sidebar-account");
  if (!container) return;
  try {
    const result = await authClient.getSession();
    if (result.error) throw result.error;
    const user = result.data?.user;
    if (!user) return;
    let name = user.name || user.email?.split("@")[0] || "Learner";
    try {
      const userId = user.uid || user.id;
      if (!userId) throw new Error("The signed-in account does not include a user ID.");
      const profile = await getDoc(doc(db, "users", userId));
      const displayName = profile.data()?.displayName;
      if (typeof displayName === "string" && displayName.trim()) name = displayName.trim();
    } catch (error) {
      console.error("Could not load the account name for the subject library.", error);
    }
    const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15) || "learner";
    container.innerHTML = `<details class="course-account-menu">
      <summary><span class="course-account-avatar">${escapeHtml(name.slice(0, 1).toUpperCase())}</span><span class="course-account-copy"><strong>${escapeHtml(name)}</strong><small>@${escapeHtml(handle)}</small></span><span class="course-account-chevron"></span></summary>
      <div class="course-account-popover"><a href="/dashboard/?settings=profile">Profile & account settings</a><a href="/dashboard/">My study dashboard</a><button type="button" id="course-sign-out">Log out</button></div>
    </details>`;
    container.querySelector("#course-sign-out").addEventListener("click", async () => {
      try {
        const signedOut = await authClient.signOut();
        if (signedOut.error) throw signedOut.error;
        window.location.assign("/");
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
