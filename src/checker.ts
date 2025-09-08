import { globSync } from 'glob';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ESLint } from 'eslint';
import { LegacyESLint } from 'eslint/use-at-your-own-risk';
import minimatch from 'minimatch';

/**
 * Represents a disabled ESLint rule found in the codebase.
 * @public
 */
export type DisabledRule = {
  file: string;
  line: number;
  column: number;
  type: 'warning' | 'error';
  rule: string;
  reasonMissing?: boolean;
};

/**
 * Determines the severity level of a given rule from the ESLint config.
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
 */
export async function runChecker(targetDir: string, hasFlatConfig: boolean) {
  console.log(chalk.cyan('\nRunning eslint-disable-scanner...\n'));

  // Load whitelist
  const allowFile = path.join(targetDir, '.eslint-disable-allow.json');
  let allowedRules: string[] = [];
  let allowedPatterns: string[] = [];
  if (fs.existsSync(allowFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(allowFile, 'utf8'));
      allowedRules = cfg.allowedRules ?? [];
      allowedPatterns = cfg.allowedPatterns ?? [];
    } catch (e) {
      console.warn(chalk.yellow(`⚠️  Cannot parse ${allowFile}: ${e}`));
    }
  }

  // Init ESLint
  const eslint = hasFlatConfig
    ? new ESLint({ cwd: targetDir })
    : new LegacyESLint({ cwd: targetDir });

  // Get files
  const allFiles = globSync('**/*.{js,jsx,ts,tsx}', {
    cwd: targetDir,
    ignore: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'logs/**',
      'tmp/**',
      '.expo/**',
      '.expo-shared/**',
      '.turbo/**',
      '.vercel/**',
      '.firebase/**',
      '.idea/**',
      '.vscode/**',
      '.husky/**',
      'android/**',
      'ios/**',
      'public/**',
      'static/**',
      '.cache/**',
      '.storybook/**',
      '.git/**',
      '.DS_Store',
      '*.log'
    ],
    absolute: true
  });

  const files = (
    await Promise.all(
      allFiles.map(async (file) =>
        (await eslint.isPathIgnored(file)) ? null : file
      )
    )
  ).filter((file): file is string => file !== null);

  const disabledRules: DisabledRule[] = [];

  for (const file of files) {
    if (allowedPatterns.some((p) => minimatch(file, p))) continue;

    const config = await eslint.calculateConfigForFile(file);
    const content = fs.readFileSync(file, 'utf8');

    // block comments
    const blockDisableRegex = /\/\*\s*eslint-disable\s+([^\*]*)\*\//g;
    let matchBlock;
    while ((matchBlock = blockDisableRegex.exec(content)) !== null) {
      const [rulesPart, reason] = matchBlock[1]
        .split('--')
        .map((s) => s.trim());
      const rules = rulesPart
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);

      for (const rule of rules) {
        if (allowedRules.includes(rule)) continue;
        const level = getRuleLevel(config, rule);
        if (level === 'off') continue;
        disabledRules.push({
          file: path.relative(targetDir, file),
          line: 1,
          column: 1,
          type: level,
          rule,
          reasonMissing: !reason
        });
      }
    }

    // line by line
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const m = line.match(/eslint-disable(?:-next-line|-line)?\s+(.*)/);
      if (m) {
        const [rulesPart, reason] = m[1].split('--').map((s) => s.trim());
        const rules = rulesPart
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);

        for (const rule of rules) {
          if (allowedRules.includes(rule)) continue;
          const level = getRuleLevel(config, rule);
          if (level === 'off') continue;
          disabledRules.push({
            file: path.relative(targetDir, file),
            line: idx + 1,
            column: line.indexOf(rule) + 1,
            type: level,
            rule,
            reasonMissing: !reason
          });
        }
      }
    });
  }

  if (disabledRules.length > 0) {
    const errorCount = disabledRules.filter((r) => r.type === 'error').length;
    const warningCount = disabledRules.filter(
      (r) => r.type === 'warning'
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
      const maxPosLength = Math.max(
        ...rules.map((item) => `${item.line}:${item.column}`.length)
      );
      rules.forEach((item) => {
        const typeColor =
          item.type === 'error' ? chalk.red('error') : chalk.yellow('warning');
        const pos = `${item.line}:${item.column}`.padEnd(maxPosLength + 3);
        const reasonText = item.reasonMissing ? chalk.red(' (no reason)') : '';
        console.log(
          `  ${chalk.gray(pos)}${typeColor}  Rule '${chalk.bold(item.rule)}' was disabled${reasonText}.`
        );
      });
      console.log();
    });

    // chỉ kill khi error + thiếu lý do
    const shouldFail = disabledRules.some(
      (item) => item.type === 'error' && item.reasonMissing
    );

    if (shouldFail) {
      throw new Error(
        'Found disabled ESLint error rules without reason. Process will stop.'
      );
    } else {
      console.log(
        chalk.yellow(
          '\nDisabled rules found (warnings and/or error with reason). Process will continue.\n'
        )
      );
    }
  } else {
    console.log(chalk.green('✔ No disabled ESLint rules found.\n'));
  }
}
