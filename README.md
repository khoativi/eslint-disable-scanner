# eslint-disable-scanner

A lightweight tool to detect and report ESLint disabled rules in your JavaScript/TypeScript projects.

## Overview
`eslint-disable-scanner` helps you maintain code quality by identifying where ESLint rules have been disabled in your codebase. It scans for `eslint-disable` comments and reports them in a clear, organized format, making it easier to track and review disabled rules.

## Features
- 🔍 Detects all forms of `eslint-disable` comments
- 📊 Groups findings by file for better readability
- ⚡ Fast and lightweight
- 🔧 Works with your existing ESLint configuration
- 🚀 Perfect for CI/CD pipelines

## Installation

```bash
npm install eslint-disable-scanner --save-dev
```

## Usage

Run in your project directory:

```bash
npx eslint-disable-scanner
```

Example output:
```sh
Running eslint-disable-checker...

✖ Found 2 error rules and 1 warning rule disabled:

src/main.ts
  1:1     error  Rule 'no-console' was disabled.
  10:29   warning  Rule '@typescript-eslint/no-floating-promises' was disabled.

src/app.service.ts
  6:33   error  Rule 'no-console' was disabled.

✖ Found disabled ESLint error rules. Process will stop.
```

## CI/CD Integration

Add to your CI pipeline to prevent unwanted rule disabling:

```bash
npx eslint-disable-scanner
```

The command will exit with code 1 if any disabled rules are found, making it perfect for CI/CD enforcement.

## Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## License

MIT - see [LICENSE](LICENSE) for details.