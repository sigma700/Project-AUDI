export default {
  testEnvironment: 'node',
  transform: {},
  roots: ['<rootDir>/src'],
  testMatch: ['**/src/tests/**/*.test.js'],
  setupFiles: ['dotenv/config'],
  verbose: true,
  forceExit: true,
  testTimeout: 15000,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageThreshold: {
    global: {
      lines: 70,
    },
  },
};
