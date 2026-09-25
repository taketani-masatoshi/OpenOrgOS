/**
 * Thin fs sync surface so recovery tests can inject rename failures.
 * Production always uses node:fs; do not add business logic here.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync as nodeRenameSync,
  rmSync,
  writeFileSync,
} from "node:fs";

export const fsSync = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync: nodeRenameSync,
  rmSync,
  writeFileSync,
};
