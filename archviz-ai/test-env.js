const { loadEnvConfig } = require('@next/env');
const projectDir = process.cwd();
loadEnvConfig(projectDir);
console.log("AGY_PATH IS:", process.env.AGY_PATH);
