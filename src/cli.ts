#!/usr/bin/env node

import { runChecker } from './checker';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

/**
 * CLI entry point for eslint-disable-scanner.
 * Detects ESLint config and runs the checker.
 * @module CLI
 */

async function main() {
  const cwd = process.cwd();
  const flatConfigFiles = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts'
  ];

  const legacyConfigFiles = [
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    '.eslintrc'
  ];

  const hasFlatConfig = flatConfigFiles.some((file) =>
    fs.existsSync(path.join(cwd, file))
  );

  const hasLegacyConfig = legacyConfigFiles.some((file) =>
    fs.existsSync(path.join(cwd, file))
  );

  if (!hasFlatConfig && !hasLegacyConfig) {
    chalk.cyan('No ESLint config found in current directory.');
    process.exit(1);
  }

  try {
    await runChecker(cwd, hasFlatConfig);
    process.exit(0);
  } catch (err) {
    console.error(
      chalk.red.bold('✖', err instanceof Error ? err.message : err)
    );
    process.exit(1);
  }
}

/**
 * Main function to execute the CLI logic.
 * Detects ESLint config type and runs the checker.
 * Exits with code 1 if errors are found.
 * @returns {Promise<void>}
 */
main();
