import path from 'path';

// Use process.cwd() for project root - works when running tests from project directory
const PROJECT_ROOT = process.cwd();
export const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');
export const TARGET = path.join(TMP_DIR, 'target');
export const DATA_DIR = path.join(PROJECT_ROOT, 'test', 'data');
export const CONTENTS = '// eslint-disable-next-line no-unused-vars\nvar thing = true;\n';
