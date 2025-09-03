import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                global: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "prefer-const": "warn",
            "no-useless-escape": "error"
        }
    }
];