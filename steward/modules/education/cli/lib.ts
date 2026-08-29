import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import {
  educationClassesFileSchema,
  educationCoursesFileSchema,
  type EducationClass,
  type EducationCourse,
} from "./schema.js";

export const MODULE_ID = "education";

const ACTIVE_STATUS = "active";
const PERCENT_SCALE = 100;
const ONE_DECIMAL = 10;
const UNRESOLVED_COURSE = "(unknown course)";

function loadCourses(): EducationCourse[] | null {
  const file = loadModuleDataFile(MODULE_ID, "courses.yaml", educationCoursesFileSchema);
  return file ? file.data.courses : null;
}

function loadClasses(): EducationClass[] | null {
  const file = loadModuleDataFile(MODULE_ID, "classes.yaml", educationClassesFileSchema);
  return file ? file.data.classes : null;
}

function isActive(record: { status: string }): boolean {
  return record.status === ACTIVE_STATUS;
}

/** Seat utilization in percent, one decimal. Null when there is no capacity to divide by. */
function utilizationPct(enrolled: number, capacity: number): number | null {
  if (capacity <= 0) return null;
  return Math.round((enrolled / capacity) * PERCENT_SCALE * ONE_DECIMAL) / ONE_DECIMAL;
}

interface CourseEnrollment {
  course_id: string;
  course: string;
  classes: number;
  capacity: number;
  enrolled: number;
  seats_open: number;
  utilization_pct: number | null;
}

/** Aggregate active classes per course. Courses without active classes are still listed. */
function buildEnrollment(courses: EducationCourse[], classes: EducationClass[]): CourseEnrollment[] {
  const byCourse = new Map<string, CourseEnrollment>();
  const register = (courseId: string, name: string): CourseEnrollment => {
    const existing = byCourse.get(courseId);
    if (existing) return existing;
    const created: CourseEnrollment = {
      course_id: courseId,
      course: name,
      classes: 0,
      capacity: 0,
      enrolled: 0,
      seats_open: 0,
      utilization_pct: null,
    };
    byCourse.set(courseId, created);
    return created;
  };

  for (const course of courses) register(course.id, course.name);

  for (const cls of classes) {
    if (!isActive(cls)) continue;
    const row = register(cls.course_id, UNRESOLVED_COURSE);
    row.classes += 1;
    row.capacity += cls.capacity ?? 0;
    row.enrolled += cls.enrolled ?? 0;
  }

  for (const row of byCourse.values()) {
    row.seats_open = Math.max(row.capacity - row.enrolled, 0);
    row.utilization_pct = utilizationPct(row.enrolled, row.capacity);
  }
  return [...byCourse.values()].sort((a, b) => a.course_id.localeCompare(b.course_id));
}

function totals(rows: CourseEnrollment[]): {
  capacity: number;
  enrolled: number;
  utilization_pct: number | null;
} {
  const capacity = rows.reduce((sum, row) => sum + row.capacity, 0);
  const enrolled = rows.reduce((sum, row) => sum + row.enrolled, 0);
  return { capacity, enrolled, utilization_pct: utilizationPct(enrolled, capacity) };
}

export function runEducationShow(opts: { json?: boolean }): void {
  const courses = loadCourses() ?? [];
  const classes = loadClasses() ?? [];
  const overall = totals(buildEnrollment(courses, classes));

  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    courses: courses.length,
    active_courses: courses.filter(isActive).length,
    classes: classes.length,
    active_classes: classes.filter(isActive).length,
    capacity: overall.capacity,
    enrolled: overall.enrolled,
    utilization_pct: overall.utilization_pct,
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# education\n`);
  console.log(`courses: ${summary.courses} · active: ${summary.active_courses}`);
  console.log(`classes: ${summary.classes} · active: ${summary.active_classes}`);
  console.log(
    `seats: ${summary.enrolled}/${summary.capacity} · utilization: ${summary.utilization_pct ?? "—"}%`
  );
}

export function runEducationValidate(): void {
  const issues: string[] = [];
  const courses = loadCourses();
  const classes = loadClasses();

  if (!courses) issues.push("courses.yaml missing");
  if (!classes) issues.push("classes.yaml missing");

  const known = new Set((courses ?? []).map((course) => course.id));
  for (const cls of classes ?? []) {
    if (!known.has(cls.course_id)) {
      issues.push(`${cls.id}: unknown course_id ${cls.course_id}`);
    }
    if (cls.capacity !== undefined && (cls.enrolled ?? 0) > cls.capacity) {
      issues.push(`${cls.id}: enrolled ${cls.enrolled} exceeds capacity ${cls.capacity}`);
    }
    if (isActive(cls) && cls.capacity === undefined) {
      issues.push(`${cls.id}: active class without capacity`);
    }
  }

  if (issues.length) {
    console.error("✗ education:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log(`✓ education — ${courses?.length ?? 0} courses · ${classes?.length ?? 0} classes OK`);
  if (!isModuleEnabled(MODULE_ID)) {
    console.log("note: module not enabled in this tenant — catalog seed validated");
  }
}

export function runEducationEnrollment(opts: { json?: boolean }): void {
  const courses = loadCourses();
  const classes = loadClasses();
  if (!courses || !classes) {
    console.error("education: courses.yaml / classes.yaml not found");
    process.exit(1);
    return;
  }

  const rows = buildEnrollment(courses, classes);
  const overall = totals(rows);

  if (opts.json) {
    console.log(JSON.stringify({ module: MODULE_ID, courses: rows, total: overall }, null, 2));
    return;
  }

  console.log("# Enrollment vs capacity (active classes)\n");
  for (const row of rows) {
    console.log(
      `- ${row.course_id} · ${row.course} · ${row.classes} class(es) · ${row.enrolled}/${row.capacity} seats · open ${row.seats_open} · ${row.utilization_pct ?? "—"}%`
    );
  }
  console.log(
    `\ntotal: ${overall.enrolled}/${overall.capacity} seats · utilization ${overall.utilization_pct ?? "—"}%`
  );
}
