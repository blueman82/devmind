import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Enable globals like describe, test, expect
    globals: true,
    
    // Test file patterns
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '**/*.d.ts'],
    
    // Environment settings
    environment: 'node',
    
    // Test timeout
    testTimeout: 10000,
    
    // Coverage configuration
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'coverage/**',
        'dist/**',
        'node_modules/**',
        'src/tests/**',
        '**/*.d.ts',
        '**/*.config.js',
        '**/mock*.js'
      ]
    },
    
    // Reporter configuration
    reporter: ['verbose'],
    
    // Parallel execution
    threads: true,
    maxThreads: 4,
    
    // Watch mode settings
    watch: false,
    
    // SQLite database isolation for tests
    pool: 'threads',
    isolate: true,
    
    // Setup files for test initialization
    setupFiles: [],
    
    // Mock settings
    clearMocks: true,
    restoreMocks: true
  }
})