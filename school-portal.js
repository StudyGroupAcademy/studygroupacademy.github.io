import { $, $$ } from "./core.js";
import { schoolRequest, uploadSchoolFile } from "./school-client.js";
import { setSchoolCalendarEvents } from "./workspace.js";

const adminEmail = "mitolecule@gmail.com";
const teacherPermissions = [
  ["post_homework", "Post homework"],
  ["edit_shared_homework", "Work on shared homework"],
  ["review_student_submissions", "Review submissions and private comments"],
  ["invite_and_manage_accounts", "Invite and manage accounts"],
  ["view_student_grades", "View student grades"],
  ["grade_student_work", "Grade student work and leave feedback"]
];
const studentPermissions = [
  ["view_homework", "View homework"],
  ["upload_submissions", "Hand in written work or files"],
  ["comment_privately_to_teachers", "Comment privately to teachers"],
  ["view_feedback_and_grades", "View teacher feedback and grades"]
];
const fileTypes = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png";
let currentUser = null;
let currentProfile = null;
let context = null;
let adminData = null;
let globalNotifications = [];
let notificationTimer = null;
let bound = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function setStatus(message, error = false) {
  const element = $("#school-status");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", error);
}

function renderPermissions() {
  const role = $("#school-invite-form").elements.role.value;
  const permissions = role === "teacher" ? teacherPermissions : studentPermissions;
  $("#invite-permissions").innerHTML = permissions.map(([key, title]) => {
    const checked = role === "student" || ["post_homework", "edit_shared_homework", "review_student_submissions", "grade_student_work"].includes(key);
    return `<label class="permission-option"><input type="checkbox" name="permissions" value="${key}" ${checked ? "checked" : ""}><span>${title}</span></label>`;
  }).join("");
}

function renderAdminApplications() {
  const section = $("#school-admin-section");
  section.hidden = !adminData;
  if (!adminData) return;
  const list = $("#school-applications");
  if (!adminData.applications.length) {
    list.innerHTML = '<div class="empty-state"><strong>No school applications yet</strong><p>New school requests will appear here for review.</p></div>';
    return;
  }
  list.innerHTML = adminData.applications.map((application) => {
    const status = escapeHtml(application.status);
    const action = application.status === "pending"
      ? `<div class="school-actions"><button class="button button-dark" type="button" data-school-review="approve" data-application-id="${escapeHtml(application.id)}">Approve and create school invite</button><button class="button button-light" type="button" data-school-review="decline" data-application-id="${escapeHtml(application.id)}">Decline</button></div>`
      : application.status === "approved"
        ? `<button class="button button-light" type="button" data-school-admin-invite="${escapeHtml(application.id)}">Create new school admin invite link</button>`
        : "";
    return `<article class="school-record"><div class="school-record-head"><strong>${escapeHtml(application.school_name)}</strong><span class="school-status-pill">${status}</span></div>
      <p><b>Contact:</b> ${escapeHtml(application.contact_name)} · ${escapeHtml(application.contact_email)}</p>
      <p><b>Website:</b> ${escapeHtml(application.website)} · <b>Domain:</b> ${escapeHtml(application.school_domain)}</p>
      <p><b>Address:</b> ${escapeHtml(application.address)}</p>
      <p><b>Verification details:</b> ${escapeHtml(application.verification_details)}</p>
      <div class="school-review-result" id="school-review-result-${escapeHtml(application.id)}"></div>${action}</article>`;
  }).join("");
}

function renderNotifications(notifications = [], adminInbox = false) {
  const list = $(adminInbox ? "#school-admin-notifications-list" : "#school-notifications");
  if (!list) return;
  if (adminInbox) $("#school-admin-notifications").hidden = false;
  if (!notifications.length) {
    list.innerHTML = '<div class="empty-state"><strong>You are all caught up</strong><p>Homework and account updates will appear here.</p></div>';
    return;
  }
  list.innerHTML = notifications.map((notification) => `
    <article class="school-notification ${notification.read_at ? "" : "is-unread"}">
      <div><strong>${escapeHtml(notification.title)}</strong><p>${escapeHtml(notification.body)}</p><small>${escapeHtml(formatDate(notification.created_at))}</small></div>
      ${!notification.read_at ? `<button class="button button-light" type="button" data-notification-read="${escapeHtml(notification.id)}">Mark read</button>` : ""}
    </article>`).join("");
}

function renderGlobalNotifications(notifications = []) {
  globalNotifications = notifications;
  const list = $("#notification-menu-list");
  const count = $("#notification-count");
  if (!list || !count) return;
  const unread = notifications.filter((item) => !item.read_at).length;
  count.textContent = unread > 99 ? "99+" : String(unread);
  count.hidden = unread === 0;
  list.innerHTML = notifications.length ? notifications.map((item) => `
    <article class="notification-menu-item ${item.read_at ? "" : "is-unread"}">
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><small>${escapeHtml(formatDate(item.created_at, true))}</small></div>
      ${!item.read_at ? `<button type="button" data-notification-read="${escapeHtml(item.id)}">Mark read</button>` : ""}
    </article>`).join("") : '<p class="notification-empty">You are all caught up.</p>';
}

async function refreshGlobalNotifications() {
  if (!currentUser) return;
  try {
    const result = await schoolRequest("notifications-list");
    renderGlobalNotifications(result.notifications || []);
  } catch (error) {
    console.warn("Could not refresh notifications.", error);
  }
}

function formatDate(value, includeTime = false) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function fileButton(kind, id, label) {
  return `<button class="button button-light" type="button" data-school-file="${kind}" data-resource-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
}

function renderComments(comments, submissionId, canComment) {
  const ownComments = comments.filter((comment) => comment.submission_id === submissionId);
  return `<div class="school-comments">${ownComments.length
    ? ownComments.map((comment) => `<p><span>${comment.author_id === currentUser.uid ? "You" : "Teacher"}</span> ${escapeHtml(comment.body)} <small>${escapeHtml(formatDate(comment.created_at, true))}</small></p>`).join("")
    : '<p class="form-hint">Private comments are visible only to this student and the teachers assigned to this homework.</p>'}
  ${canComment ? `<form class="school-comment-form" data-school-comment="${escapeHtml(submissionId)}"><label>Private comment<textarea name="body" maxlength="2000" required placeholder="Write a note for the assigned teachers"></textarea></label><button class="button button-light" type="submit">Send private comment</button></form>` : ""}</div>`;
}

function renderStudentSubmission(assignment) {
  const submission = assignment.own_submission;
  const canComment = context.member.permissions.includes("comment_privately_to_teachers");
  const comments = submission ? renderComments(assignment.comments, submission.id, canComment) : "";
  const submittedFile = submission?.attachment
    ? fileButton("submission", submission.id, `Download your work (${submission.attachment.originalFilename || "file"})`)
    : "";
  const grade = submission?.grade !== null && submission?.grade !== undefined && context.member.permissions.includes("view_feedback_and_grades")
    ? `<div class="school-grade-result"><strong>${escapeHtml(submission.grade)}%</strong><span>${escapeHtml(submission.grade_feedback || "Your teacher has graded this work.")}</span></div>`
    : "";
  const existing = submission
    ? `<div class="school-submission"><strong>Handed in ${escapeHtml(formatDate(submission.submitted_at, true))}</strong>${submission.text_answer ? `<p>${escapeHtml(submission.text_answer)}</p>` : ""}${submittedFile}${grade}${comments}</div>`
    : "";
  const canSubmit = context.member.permissions.includes("upload_submissions");
  return `${existing}${canSubmit ? `<form class="school-submission-form" data-school-submit="${escapeHtml(assignment.id)}">
      <label>${submission ? "Update your work" : "Hand in your work"}<textarea name="textAnswer" maxlength="10000" placeholder="Write an answer, or attach a file below"></textarea></label>
      <label>Attach your work (optional)<input name="file" type="file" accept="${fileTypes}"></label>
      <button class="button button-dark" type="submit">${submission ? "Update submission" : "Submit homework"}</button>
    </form>` : '<p class="form-hint">Your school has not enabled file or written submissions for this account.</p>'}${!canComment && submission ? '<p class="form-hint">Private comments are not enabled for this account.</p>' : ""}`;
}

function renderTeacherSubmissions(assignment) {
  const canReview = context.member.role === "school_admin" || context.member.permissions.includes("review_student_submissions");
  if (!canReview) return "";
  if (!assignment.submissions.length) return '<p class="form-hint">No student submissions yet.</p>';
  return `<div class="school-submissions">${assignment.submissions.map((submission) => `
    <section class="school-submission"><strong>${escapeHtml(submission.student_name || "Student")} · ${escapeHtml(formatDate(submission.submitted_at, true))}</strong>
      ${submission.text_answer ? `<p>${escapeHtml(submission.text_answer)}</p>` : ""}
      ${submission.attachment ? fileButton("submission", submission.id, `Download submitted file (${submission.attachment.originalFilename || "file"})`) : ""}
      ${submission.grade !== null && submission.grade !== undefined && (context.member.permissions.includes("view_student_grades") || context.member.permissions.includes("grade_student_work") || context.member.role === "school_admin") ? `<div class="school-grade-result"><strong>${escapeHtml(submission.grade)}%</strong><span>${escapeHtml(submission.grade_feedback || "No written feedback")}</span></div>` : ""}
      ${context.member.permissions.includes("grade_student_work") || context.member.role === "school_admin" ? `<form class="school-grade-form" data-school-grade="${escapeHtml(submission.id)}"><label>Grade (%)<input name="grade" type="number" min="0" max="100" step="0.5" value="${submission.grade ?? ""}" required></label><label>Feedback<textarea name="feedback" maxlength="2000" placeholder="What went well? What should improve?">${escapeHtml(submission.grade_feedback || "")}</textarea></label><button class="button button-light" type="submit">Save grade and feedback</button></form>` : ""}
      ${renderComments(assignment.comments, submission.id, context.member.role === "teacher" && assignment.teacher_ids.includes(currentUser.uid))}
    </section>`).join("")}</div>`;
}

function renderAssignments(assignments = []) {
  const list = $("#school-assignments");
  const member = context?.member;
  if (!list || !member) return;
  if (!assignments.length) {
    list.innerHTML = '<div class="empty-state"><strong>No homework yet</strong><p>When your school shares an assignment, it will appear here with its subject, due time and instructions.</p></div>';
    return;
  }
  list.innerHTML = assignments.map((assignment) => {
    const due = assignment.due_at ? `Due ${formatDate(assignment.due_at, true)}` : "No due date";
    const teachers = assignment.teacher_ids?.length ? `${assignment.teacher_ids.length} assigned teacher${assignment.teacher_ids.length === 1 ? "" : "s"}` : "";
    const attached = assignment.attachment
      ? fileButton("assignment", assignment.id, `Download instructions (${assignment.attachment.originalFilename || "file"})`)
      : "";
    const activity = member.role === "student" ? renderStudentSubmission(assignment) : renderTeacherSubmissions(assignment);
    const canEdit = member.role === "school_admin" || (member.permissions.includes("edit_shared_homework") && assignment.teacher_ids?.includes(currentUser.uid));
    const dueValue = assignment.due_at ? new Date(assignment.due_at).toISOString().slice(0, 16) : "";
    const editForm = canEdit ? `<details class="school-edit-details"><summary>Edit shared homework</summary><form class="school-edit-form" data-school-edit="${escapeHtml(assignment.id)}"><label>Title<input name="title" maxlength="180" value="${escapeHtml(assignment.title)}" required></label><label>Subject<input name="subject" maxlength="80" value="${escapeHtml(assignment.subject)}" required></label><label>Instructions<textarea name="instructions" maxlength="5000" required>${escapeHtml(assignment.instructions)}</textarea></label><label>Due date and time<input name="dueAt" type="datetime-local" value="${escapeHtml(dueValue)}"></label><button class="button button-light" type="submit">Save changes</button></form></details>` : "";
    return `<article class="school-assignment"><div class="school-assignment-heading"><span class="school-subject">${escapeHtml(assignment.subject)}</span><span>${escapeHtml(due)}</span></div>
      <h4>${escapeHtml(assignment.title)}</h4><p>${escapeHtml(assignment.instructions)}</p><div class="school-file-row">${attached}<small>${escapeHtml(teachers)}</small></div>${editForm}${activity}</article>`;
  }).join("");
}

function renderTodayAssignments(assignments = []) {
  const list = $("#today-school-homework");
  if (!list) return;
  const upcoming = assignments
    .filter((assignment) => assignment.due_at)
    .sort((first, second) => new Date(first.due_at) - new Date(second.due_at))
    .slice(0, 3);
  list.innerHTML = upcoming.length
    ? `${upcoming.map((assignment) => `<div class="today-homework-item"><strong>${escapeHtml(assignment.title)}</strong><small>${escapeHtml(assignment.subject)} · ${escapeHtml(formatDate(assignment.due_at, true))}</small></div>`).join("")}<button class="today-school-link" type="button" data-tab="school">Open school homework →</button>`
    : '<p class="muted-line">No school deadlines to show yet.</p>';
}

function renderTeachers(teachers = []) {
  const container = $("#assignment-collaborators");
  if (!container) return;
  const options = teachers.filter((teacher) => teacher.user_id !== currentUser.uid);
  container.innerHTML = options.length
    ? options.map((teacher) => `<label class="permission-option"><input type="checkbox" name="teacherIds" value="${escapeHtml(teacher.user_id)}"><span>${escapeHtml(teacher.display_name)} · ${escapeHtml(teacher.email)}</span></label>`).join("")
    : '<p class="form-hint">Invite another teacher and grant shared-homework permission to co-author assignments.</p>';
}

function configureMember(member) {
  const isSchoolAccount = Boolean(member);
  const accountBadge = $("#account-badge");
  if (accountBadge) accountBadge.textContent = isSchoolAccount
    ? member.role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Personal account";
  $("#school-portal").hidden = !isSchoolAccount;
  $("#school-application-state").hidden = isSchoolAccount;
  $("#school-title").textContent = isSchoolAccount ? member.school_name : "School accounts";
  $("#school-summary").textContent = isSchoolAccount
    ? `${member.display_name} · ${member.role.replace("_", " ")}. Homework and permissions for ${member.school_name}.`
    : "Teacher and student accounts are created only from verified school invitations.";
  $("#school-invite-section").hidden = !isSchoolAccount ||
    (member.role !== "school_admin" && !member.permissions.includes("invite_and_manage_accounts"));
  $("#school-assignment-create").hidden = !isSchoolAccount ||
    (!['teacher', 'school_admin'].includes(member.role) || (member.role !== "school_admin" && !member.permissions.includes("post_homework")));
  if (isSchoolAccount && ["student", "teacher", "school_admin"].includes(member.role)) {
    $('[data-tab="school"]').click();
  }
}

async function loadSchoolContext() {
  if (!currentUser) return;
  setStatus("Loading your school workspace…");
  try {
    const inviteToken = new URLSearchParams(window.location.search).get("invite");
    if (inviteToken) {
      const displayName = currentProfile?.displayName || currentUser.displayName || currentUser.name || "School member";
      await schoolRequest("accept-invite", { token: inviteToken, displayName });
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.toString());
      setStatus("Your school invitation is accepted. Welcome to your school workspace.");
    }

    context = await schoolRequest("context");
    const notificationResult = await schoolRequest("notifications-list");
    renderGlobalNotifications(notificationResult.notifications || []);
    setSchoolCalendarEvents(context.assignments || []);
    adminData = currentUser.email?.toLowerCase() === adminEmail
      ? await schoolRequest("admin-list")
      : null;
    configureMember(context.member);
    renderAdminApplications();
    renderNotifications(context.notifications || [], false);
    renderAssignments(context.assignments || []);
    renderTodayAssignments(context.assignments || []);
    renderTeachers(context.teachers || []);

    if (!context.member && !context.pendingApplication) {
      $("#school-application-message").innerHTML = 'Schools can request a verified workspace from the <a href="../#homework-uploads">school sign-up form</a>. Teacher and student accounts are only created by school invitation.';
      setStatus(currentUser.email?.toLowerCase() === adminEmail
        ? "Review school applications below. Approvals create a one-time school admin invite link."
        : "This is a personal learner account. Ask your school administrator for a teacher or student invite.");
    } else if (context.pendingApplication) {
      $("#school-application-message").textContent = `Your school application for ${context.pendingApplication.school_name} is ${context.pendingApplication.status}. The StudyGroup administrator will review it.`;
      setStatus("School application status loaded.");
    } else {
      setStatus(`${context.member.school_name} workspace ready. Notifications and homework update when you refresh.`);
    }

    if (adminData) {
      const inbox = [...(adminData.notifications || []), ...(context.member ? context.notifications || [] : [])];
      renderAdminApplications();
      renderNotifications(inbox, true);
    }
  } catch (error) {
    console.error("Could not load the school workspace.", error);
    setStatus(error.message || "The school workspace could not be loaded. Try refreshing.", true);
    $("#school-portal").hidden = true;
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  try {
    if (form.id === "school-invite-form") {
      event.preventDefault();
      const permissions = [...form.querySelectorAll('input[name="permissions"]:checked')].map((input) => input.value);
      const result = await schoolRequest("invite-member", {
        schoolId: context.member.school_id,
        email: form.elements.email.value,
        role: form.elements.role.value,
        permissions
      });
      $("#invite-result").innerHTML = `Share this one-time link with ${escapeHtml(result.invite.email)}: <a href="${escapeHtml(result.inviteUrl)}">${escapeHtml(result.inviteUrl)}</a>`;
      form.reset();
      renderPermissions();
      setStatus("Invite created. Copy the link and send it directly to the invited person's email address.");
      return;
    }

    if (form.id === "school-assignment-form") {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      let attachment = null;
      const file = form.elements.file.files[0];
      if (file) attachment = await uploadSchoolFile(file, "teacher-homework", context.member.school_id);
      const teacherIds = [...form.querySelectorAll('input[name="teacherIds"]:checked')].map((input) => input.value);
      const dueAt = form.elements.dueAt.value ? new Date(form.elements.dueAt.value).toISOString() : null;
      await schoolRequest("create-assignment", {
        schoolId: context.member.school_id,
        title: form.elements.title.value,
        subject: form.elements.subject.value,
        instructions: form.elements.instructions.value,
        dueAt,
        attachment,
        teacherIds
      });
      form.reset();
      await loadSchoolContext();
      setStatus("Homework posted. Students in this school were notified.");
      return;
    }

    if (form.matches("[data-school-submit]")) {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      let attachment = null;
      const file = form.elements.file.files[0];
      if (file) attachment = await uploadSchoolFile(file, "student-submission", context.member.school_id);
      await schoolRequest("submit-assignment", {
        assignmentId: form.dataset.schoolSubmit,
        textAnswer: form.elements.textAnswer.value,
        attachment
      });
      await loadSchoolContext();
      setStatus("Your work has been handed in. Your assigned teachers have been notified.");
      return;
    }

    if (form.matches("[data-school-edit]")) {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      await schoolRequest("update-assignment", {
        assignmentId: form.dataset.schoolEdit,
        title: form.elements.title.value,
        subject: form.elements.subject.value,
        instructions: form.elements.instructions.value,
        dueAt: form.elements.dueAt.value ? new Date(form.elements.dueAt.value).toISOString() : null
      });
      await loadSchoolContext();
      setStatus("Shared homework updated successfully.");
      return;
    }

    if (form.matches("[data-school-grade]")) {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      await schoolRequest("grade-submission", {
        submissionId: form.dataset.schoolGrade,
        grade: form.elements.grade.value,
        feedback: form.elements.feedback.value
      });
      await loadSchoolContext();
      setStatus("Grade and feedback saved. The student has been notified.");
      return;
    }

    if (form.matches("[data-school-comment]")) {
      event.preventDefault();
      const body = form.elements.body.value.trim();
      await schoolRequest("comment", { submissionId: form.dataset.schoolComment, body });
      await loadSchoolContext();
      setStatus("Your private comment was sent to the student and assigned teachers.");
    }
  } catch (error) {
    console.error("A school workspace action failed.", error);
    setStatus(error.message || "That school action could not be completed.", true);
  } finally {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = false;
  }
}

async function handleClick(event) {
  const review = event.target.closest("[data-school-review]");
  const reissue = event.target.closest("[data-school-admin-invite]");
  const file = event.target.closest("[data-school-file]");
  const read = event.target.closest("[data-notification-read]");
  try {
    if (review) {
      review.disabled = true;
      const result = await schoolRequest("review", {
        decision: review.dataset.schoolReview,
        applicationId: review.dataset.applicationId
      });
      await loadSchoolContext();
      const output = $(`#school-review-result-${CSS.escape(review.dataset.applicationId)}`);
      output.innerHTML = result.inviteUrl
        ? `<p>Approved. Send this invite link to ${escapeHtml(result.inviteEmail)} (it expires in 14 days):</p><p><a href="${escapeHtml(result.inviteUrl)}">${escapeHtml(result.inviteUrl)}</a></p>`
        : "<p>Application declined.</p>";
      setStatus("Application review saved. The admin invite link is shown in the approved application.");
      return;
    }
    if (reissue) {
      reissue.disabled = true;
      const result = await schoolRequest("create-admin-invite", { applicationId: reissue.dataset.schoolAdminInvite });
      const output = $(`#school-review-result-${CSS.escape(reissue.dataset.schoolAdminInvite)}`);
      output.innerHTML = `<p>Send this new school admin invite to ${escapeHtml(result.inviteEmail || result.invite?.email)} (it expires in 14 days):</p><p><a href="${escapeHtml(result.inviteUrl)}">${escapeHtml(result.inviteUrl)}</a></p>`;
      return;
    }
    if (file) {
      file.disabled = true;
      const result = await schoolRequest("file-url", { kind: file.dataset.schoolFile, resourceId: file.dataset.resourceId });
      window.open(result.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (read) {
      await schoolRequest("mark-notification-read", { notificationId: read.dataset.notificationRead });
      await refreshGlobalNotifications();
      if (context?.member) {
        const refreshed = await schoolRequest("context");
        context.notifications = refreshed.notifications || [];
        renderNotifications(context.notifications, false);
      }
    }
  } catch (error) {
    console.error("A school workspace action failed.", error);
    setStatus(error.message || "That school action could not be completed.", true);
  } finally {
    if (review) review.disabled = false;
    if (reissue) reissue.disabled = false;
    if (file) file.disabled = false;
  }
}

export function initSchoolPortal() {
  if (bound) return;
  bound = true;
  $("#school-invite-form").elements.role.addEventListener("change", renderPermissions);
  $("#school-refresh").addEventListener("click", loadSchoolContext);
  $("#school-portal").addEventListener("submit", handleSubmit);
  $("#school-admin-section").addEventListener("click", handleClick);
  $("#school-admin-notifications").addEventListener("click", handleClick);
  $("#school-portal").addEventListener("click", handleClick);
  $("#global-notification-menu").addEventListener("click", handleClick);
  $("#notification-toggle").addEventListener("click", () => {
    const panel = $("#notification-popover");
    const opening = panel.hidden;
    panel.hidden = !opening;
    $("#notification-toggle").setAttribute("aria-expanded", String(opening));
    if (opening) refreshGlobalNotifications();
  });
  $("#notifications-refresh").addEventListener("click", refreshGlobalNotifications);
  renderPermissions();
}

export async function startSchoolPortal(user, profile) {
  currentUser = user;
  currentProfile = profile;
  await loadSchoolContext();
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = setInterval(refreshGlobalNotifications, 20000);
}
