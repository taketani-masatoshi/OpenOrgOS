/**
 * Co-located Zod contract for the education activation seeds.
 * Mirrors `steward/modules/education/seed/*.yaml.example`.
 */

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const educationCourseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  duration_weeks: z.number().int().positive().optional(),
  price_yen: z.number().int().nonnegative().optional(),
  status: z.string().min(1),
});

export const educationCoursesFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  courses: z.array(educationCourseSchema).default([]),
});

export const educationClassSchema = z.object({
  id: z.string().min(1),
  course_id: z.string().min(1),
  name: z.string().min(1),
  capacity: z.number().int().nonnegative().optional(),
  enrolled: z.number().int().nonnegative().optional(),
  start_date: isoDate.optional(),
  status: z.string().min(1),
});

export const educationClassesFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  classes: z.array(educationClassSchema).default([]),
});

export type EducationCourse = z.output<typeof educationCourseSchema>;
export type EducationClass = z.output<typeof educationClassSchema>;
export type EducationCoursesFile = z.output<typeof educationCoursesFileSchema>;
export type EducationClassesFile = z.output<typeof educationClassesFileSchema>;
