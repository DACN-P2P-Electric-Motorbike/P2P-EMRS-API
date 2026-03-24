import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!(uuid|@aws-sdk|@smithy|nanoid)/)'],

  // Primary coverage directory for SonarQube integration
  // Generates LCOV report at root level for SonarQube to consume
  coverageDirectory: './coverage',
  coverageReporters: ['lcov', 'text', 'html', 'json-summary'],

  /**
   * Coverage collection for all source files
   * Security: Excludes spec files, modules, DTOs, and entities (tested indirectly)
   * This ensures meaningful coverage metrics for core business logic
   */
  collectCoverageFrom: [
    'src/**/*.ts',
    // Exclude test files
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.dto.ts',
    // Core files must be excluded (no business logic)
    '!src/main.ts',
  ],

  /**
   * Coverage thresholds to ensure code quality
   * Enforced on CI/CD: tests fail if coverage drops below threshold
   * Currently set to reflect actual coverage and serve as targets for improvement
   */
  coverageThreshold: {
    global: {
      lines: 50,
      branches: 40,
      functions: 35,
      statements: 50,
    },
  },

  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: {
        '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
      },
      moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
      },
      transformIgnorePatterns: [
        'node_modules/(?!(uuid|@aws-sdk|@smithy|nanoid)/)',
      ],
    },
    {
      displayName: 'e2e',
      testMatch: [
        '<rootDir>/test/**/*.e2e-spec.ts',
        '<rootDir>/test/**/*.spec.ts',
      ],
      transform: {
        '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
      },
      moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
      },
      transformIgnorePatterns: [
        'node_modules/(?!(uuid|@aws-sdk|@smithy|nanoid)/)',
      ],
    },
  ],
};

export default config;
