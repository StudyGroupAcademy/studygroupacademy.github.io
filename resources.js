import { $ } from "./core.js";

export async function setLessonUser(user) {}

export function initResourceFilter() {
  const container = $("#resource-picks") || $(".resource-grid") || $("#resource-grid");
  if (container) {
    container.innerHTML = "";
  }
  const courseGrid = $("#subject-course-grid");
  if (courseGrid) {
    courseGrid.innerHTML = "";
  }
}
