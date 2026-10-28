import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Keep browser/component tests and Node-host tests in independent
     * Vitest projects. This replaces the deprecated per-file environment configuration.
     *
     * Browser tests need happy-dom and Angular's TestBed initialization.
     * Server-host tests need a real Node environment and must not initialize
     * the Angular DOM testing environment.
     *
     * The include/exclude patterns are deliberately disjoint: each test
     * runs once, and new tests under test/host/ stay in the Node project.
     */
    projects: [
      {
        test: {
          name: 'browser',
          environment: 'happy-dom',
          include: ['test/**/*.test.ts'],
          exclude: ['test/host/**'],
          setupFiles: ['./test/setup.ts'],
        },
      },
      {
        test: {
          name: 'node-host',
          environment: 'node',
          include: ['test/host/**/*.test.ts'],
        },
      },
    ],
  },
});
