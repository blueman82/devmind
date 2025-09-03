import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        files: ["src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module"
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "prefer-const": "warn"
        }
    }
];