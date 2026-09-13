// @ts-check
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = tseslint.config(
  {
    files: ["**/*.ts"],
    ignores: ["projects/**/*"],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/component-class-suffix": [
        "error",
        { suffixes: ["Page", "Component"] },
      ],
      "@angular-eslint/component-selector": [
        "error",
        { type: "element", prefix: "app", style: "kebab-case" },
      ],
      "@angular-eslint/directive-selector": [
        "error",
        { type: "attribute", prefix: "app", style: "camelCase" },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [...angular.configs.templateRecommended],
    rules: {},
  },
  {
    // src/core must stay framework-agnostic plain TypeScript so it can be
    // reused from a future Flutter or native port without a rewrite.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@angular/*",
            "@ionic/*",
            "@capacitor/*",
            "rxjs",
            "rxjs/*",
          ],
        },
      ],
    },
  },
  {
    // src/app must go through the @core/* alias, never reach into src/core
    // with a relative path, so the boundary stays visible at a glance.
    files: ["src/app/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**/core/**", "../**/core"],
              message: "Import from '@core/*' instead of a relative path into src/core.",
            },
          ],
        },
      ],
    },
  }
);
