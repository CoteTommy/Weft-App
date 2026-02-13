import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

let tailwindcss
try {
  const tailwindModule = await import('eslint-plugin-tailwindcss')
  tailwindcss = tailwindModule.default || tailwindModule
} catch {
  tailwindcss = null
}

export default defineConfig([
  globalIgnores(['dist', 'src-tauri/target', 'src-tauri/gen']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      ...(tailwindcss ? { tailwindcss } : {}),
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^\\u0000', '^react$', '^react-dom$', '^react-router-dom$', '^react-router$'],
            ['^@?\\w'],
            ['^@app/', '^@features/', '^@shared/', '^@lib/', '^@runtime/', '^@platform/'],
            ['^\\.\\./', '^\\./'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: false }],
      ...(tailwindcss
        ? {
            'tailwindcss/classnames-order': 'warn',
            'tailwindcss/no-unnecessary-arbitrary-value': 'warn',
            'tailwindcss/no-custom-classname': 'off',
          }
        : {}),
    },
    settings: {
      tailwindcss: {
        config: {},
      },
    },
  },
])
