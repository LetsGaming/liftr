// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import globals from "globals";

const tsRules = {
  ...tseslint.configs.recommended.rules,
  "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  "no-unused-vars": "off",
  // Core no-undef isn't type-aware, so it false-positives on ambient/lib types (RequestInit,
  // HTMLIonRefresherElement, …) that only exist in type position. tsc/vue-tsc (pnpm typecheck)
  // is the real, type-aware check for genuinely undefined identifiers — this is typescript-eslint's
  // own documented recommendation for TS files, not a suppressed real error.
  "no-undef": "off",
};

const NODE_PACKAGES = ["packages/server/**", "packages/db/**", "packages/ingest/**"];

/** Flat config (ESLint 9). One config for the whole pnpm workspace: node packages
 *  (server/db/ingest) get Node globals, the client package gets browser globals — `crypto` and
 *  `Buffer` in particular mean something different in each, so this split matters, not just
 *  convenience. */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/data/**",
      "**/android/**",
      "**/*.d.ts",
      "packages/client/src/locales/**",
      "fitness-tracker-mockups-v2.html",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: "module" },
      globals: { ...globals.es2022 },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: tsRules,
  },
  {
    files: NODE_PACKAGES.map((p) => `${p}/*.{ts,tsx}`).concat(NODE_PACKAGES.map((p) => `${p}/**/*.{ts,tsx}`)),
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["packages/client/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
  },
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: "module",
        extraFileExtensions: [".vue"],
      },
      globals: { ...globals.browser },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      ...tsRules,
      // Domain SVG icon maps are hand-authored kebab markup rendered via v-html (see
      // App.vue/ExerciseIcon.vue's own comments on why that's safe here) — not app template
      // style, so the self-closing-tag convention doesn't apply to them.
      "vue/html-self-closing": "off",
      // `slot="fixed"`/`slot="start"` etc. on ion-* elements are native web-component light-DOM
      // slotting (Ionic's own API), not Vue 2's deprecated `<template slot="...">` component
      // API — this rule can't tell the two apart, so it false-positives on every Ionic
      // component the app uses (IonRefresher, IonButtons, …). See ionic.md: "reach for ion-*
      // components" — this pattern is expected, not a Vue-slot anti-pattern.
      "vue/no-deprecated-slot-attribute": "off",
      // Many components here use a plain optional prop (`foo?: T`) relying on an explicit
      // `!= null`/`??` check at the read site rather than a `withDefaults` entry — a deliberate,
      // consistent convention (undefined is a meaningful "not provided" state, not every
      // optional prop wants a default), not an oversight per-component.
      "vue/require-default-prop": "off",
    },
  },
  prettier,
];
