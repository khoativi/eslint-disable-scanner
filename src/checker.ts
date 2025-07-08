import { globSync } from 'glob';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ESLint } from 'eslint';
import { LegacyESLint } from 'eslint/use-at-your-own-risk';

/**
 * Represents a disabled ESLint rule found in the codebase.
 * @public
 */
export type DisabledRule = {
  /** The file where the rule is disabled. */
  file: string;
  /** The line number where the rule is disabled. */
  line: number;
  /** The column number where the rule is disabled. */
  column: number;
  /** The severity type of the rule (warning or error). */
  type: 'warning' | 'error';
  /** The name of the disabled rule. */
  rule: string;
};

/**
 * Determines the severity level of a given rule from the ESLint config.
 * @param config - The ESLint config object.
 * @param ruleName - The name of the rule to check.
 * @returns The severity level: 'off', 'warning', or 'error'.
 * @internal
 */
function getRuleLevel(
  config: ESLint.ConfigData,
  ruleName: string
): 'off' | 'warning' | 'error' {
  const rule = config.rules?.[ruleName];
  if (!rule) return 'off';
  const severity = Array.isArray(rule) ? rule[0] : rule;
  if (severity === 'off' || severity === 0) return 'off';
  if (severity === 'warn' || severity === 1) return 'warning';
  if (severity === 'error' || severity === 2) return 'error';
  return 'off';
}

/**
 * Runs the checker to find disabled ESLint rules in the target directory.
 * @param targetDir - The directory to scan for source files.
 * @param hasFlatConfig - Whether the project uses the new ESLint flat config.
 * @throws If any disabled rules with severity 'error' are found.
 * @public
 */
export async function runChecker(targetDir: string, hasFlatConfig: boolean) {
  console.log(chalk.cyan('\nRunning eslint-disable-scanner...\n'));

  // This variable will hold the ESLint instance (new or legacy) depending on the config type
  let eslint: ESLint | LegacyESLint;
  if (hasFlatConfig) {
    eslint = new ESLint({ cwd: targetDir });
  } else {
    eslint = new LegacyESLint({ cwd: targetDir });
  }

  // 2. Get the list of all files, then filter them using ESLint's config
  const allFiles = globSync('**/*.{js,jsx,ts,tsx}', {
    cwd: targetDir,
    ignore: [
      'node_modules/**', // NodeJS, build tools
      '.next/**', // NextJS, Gatsby, build tools
      'out/**', // NextJS, Gatsby, build tools
      'dist/**', // NextJS, NestJS, Gatsby, build tools
      'build/**', // ReactJS, Express, NestJS, React Native
      'coverage/**', // Jest, testing
      'logs/**', // NestJS, Express
      'tmp/**', // NestJS, Express
      '.expo/**', // React Native
      '.expo-shared/**', // React Native
      '.turbo/**', // TurboRepo/monorepo
      '.vercel/**', // Vercel/Next.js
      '.firebase/**', // Firebase
      '.idea/**', // JetBrains IDEs
      '.vscode/**', // VSCode settings
      '.husky/**', // Husky git hooks
      'android/**', // React Native
      'ios/**', // React Native
      'public/**', // ReactJS, NextJS
      'static/**', // NextJS, Gatsby
      '.cache/**', // Gatsby, build tools
      '.storybook/**', // Storybook
      '.git/**', // Git repo
      '.DS_Store', // macOS
      '*.log' // log files
    ],
    absolute: true
  });

  // Filter out files that are ignored by .eslintignore or ignorePatterns in the ESLint config
  const files = (
    await Promise.all(
      allFiles.map(async (file) => {
        const isIgnored = await eslint.isPathIgnored(file);
        return isIgnored ? null : file;
      })
    )
  ).filter((file): file is string => file !== null);

  const disabledRules: DisabledRule[] = [];

  for (const file of files) {
    // Retrieve the effective ESLint config for each file
    const config = await eslint.calculateConfigForFile(file);

    const content = fs.readFileSync(file, 'utf8');

    // Regex to match block comments that disable ESLint rules at the top of the file
    const blockDisableRegex = /\/\*\s*eslint-disable\s+([^\*]*)\*\//g;
    let matchBlock;
    while ((matchBlock = blockDisableRegex.exec(content)) !== null) {
      const rulesStr = matchBlock[1];
      const rules = rulesStr
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      for (const rule of rules) {
        const level = getRuleLevel(config, rule);
        if (level === 'off') continue;
        disabledRules.push({
          file: path.relative(targetDir, file),
          line: 1,
          column: 1,
          type: level,
          rule
        });
      }
    }

    // Split the file content into lines for line-by-line analysis
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const match = line.match(/eslint-disable(?:-next-line|-line)?\s+(.*)/);
      if (match) {
        const rulesStr = match[1];
        const rules = rulesStr
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);

        for (const rule of rules) {
          const level = getRuleLevel(config, rule);
          if (level === 'off') continue;
          disabledRules.push({
            file: path.relative(targetDir, file),
            line: idx + 1,
            column: line.indexOf(rule) + 1,
            type: level,
            rule
          });
        }
      }
    });
  }

  // Display the results and handle the presence of disabled rules
  if (disabledRules.length > 0) {
    const errorCount = disabledRules.filter(
      (rule) => rule.type === 'error'
    ).length;
    const warningCount = disabledRules.filter(
      (rule) => rule.type === 'warning'
    ).length;

    console.log(
      chalk.magenta.bold(
        `✖ Found ${errorCount} error rule${errorCount !== 1 ? 's' : ''} and ${warningCount} warning rule${warningCount !== 1 ? 's' : ''} disabled:\n`
      )
    );

    const grouped: Record<string, DisabledRule[]> = {};
    for (const rule of disabledRules) {
      if (!grouped[rule.file]) grouped[rule.file] = [];
      grouped[rule.file].push(rule);
    }

    Object.entries(grouped).forEach(([file, rules]) => {
      console.log(chalk.underline(file));
      // Find the maximum length of the position column (line:column)
      const maxPosLength = Math.max(
        ...rules.map((item) => `${item.line}:${item.column}`.length)
      );
      rules.forEach((item) => {
        const typeColor =
          item.type === 'error' ? chalk.red('error') : chalk.yellow('warning');
        const pos = `${item.line}:${item.column}`.padEnd(maxPosLength + 3); // +3 for spacing
        console.log(
          `  ${chalk.gray(pos)}${typeColor}  Rule '${chalk.bold(item.rule)}' was disabled.`
        );
      });
      console.log(); // blank line between files
    });

    if (disabledRules.some((item) => item.type === 'error')) {
      throw new Error('Found disabled ESLint error rules. Process will stop.');
    } else {
      console.log(
        chalk.yellow(
          '\nOnly warning rules were disabled. Process will continue.\n'
        )
      );
    }
  } else {
    console.log(chalk.green('✔ No disabled ESLint rules found.\n'));
  }
}
