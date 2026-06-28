// Modern flat ESLint configuration for ESLint v9+
export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        // Browser globals
        window: true,
        document: true,
        localStorage: true,
        indexedDB: true,
        FileReader: true,
        fetch: true,
        setTimeout: true,
        clearTimeout: true,
        console: true,
        Promise: true,
        URL: true,
        // Node globals
        process: true,
        module: true,
        require: true,
        // Testing globals
        describe: true,
        it: true,
        test: true,
        expect: true,
        vi: true,
        beforeEach: true,
        afterEach: true,
        beforeAll: true,
        afterAll: true,
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-empty": "warn",
      "no-constant-condition": "warn"
    }
  }
]
