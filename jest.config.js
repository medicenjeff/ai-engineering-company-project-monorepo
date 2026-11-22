/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  testEnvironment: "node",
  roots: ["<rootDir>/packages/shared/frontend"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2022",
          module: "CommonJS",
          strict: true,
        },
      },
    ],
  },
  collectCoverageFrom: ["packages/shared/frontend/auth-utils.ts"],
};