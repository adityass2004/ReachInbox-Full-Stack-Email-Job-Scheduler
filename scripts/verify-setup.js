#!/usr/bin/env node

/**
 * ReachInbox Email Job Scheduler - Environment & Project Verifier
 * Validates local node prerequisites and workspace setup.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("--- Verifying ReachInbox Scheduler Setup ---");

// Check required directories
const requiredDirs = [
  "apps/api",
  "apps/worker",
  "apps/web",
  "packages/shared",
  "prisma",
  "docker",
  "scripts",
];

let allDirsExist = true;
for (const dir of requiredDirs) {
  const fullPath = path.join(rootDir, dir);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ Directory present: ${dir}`);
  } else {
    console.error(`✗ Missing directory: ${dir}`);
    allDirsExist = false;
  }
}

// Check root files
const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "tsconfig.json",
  ".gitignore",
  ".env.example",
  "docker/docker-compose.yml",
  "prisma/schema.prisma",
];

let allFilesExist = true;
for (const file of requiredFiles) {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ File present: ${file}`);
  } else {
    console.error(`✗ Missing file: ${file}`);
    allFilesExist = false;
  }
}

if (allDirsExist && allFilesExist) {
  console.log("\n✓ Project foundation verification passed successfully!\n");
  process.exit(0);
} else {
  console.error("\n✗ Project foundation verification failed.\n");
  process.exit(1);
}
