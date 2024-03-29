// From https://github.com/w3c/horizontal-issue-tracker/blob/server/lib/config.js.
/* eslint-env node */

"use strict";

const path = require('path');
const { program } = require('commander');

const config = {};

program
  .option('--gh-token <token>', undefined, process.env["GITHUB_TOKEN"] || "missing-GitHub-token")
  .option('--repos <list>', "if set, the comma-separated list of Github repositories to scan. e.g. 'w3c/webauthn,whatwg/html'", undefined)
  .option('--out-dir <directory>', "where to write scan results", "summaries");

program.parse();
const options = program.opts();

// environment variables

config.env = process.env["NODE_ENV"] || config.env || "development";
config.port = process.env["PORT"] || config.port || 8080;
config.host = process.env["HOST"] || config.host || "localhost";
config.basedir = process.env["NODE_BASEDIR"] || config.basedir || path.resolve(__dirname, "..");

// DEBUG mode

config.debug = (config.env === "development") || config.debug || false;

// auth tokens and keys

config.ghToken = options.ghToken;

// app specifics

config.cache = config.cache || "https://labs.w3.org/github-cache";
config.outDir = options.outDir;
config.repos = options.repos && options.repos.split(',');

// dump the configuration into the server log (but not in the server monitor!)
console.log("".padStart(80, '-'));
console.log("Configuration:");
for (const [key, value] of Object.entries(config)) {
  console.log(`${key.padStart(20, ' ')} = ${value}`);
}
console.log("".padStart(80, '-'));

// options is an array of String
config.checkOptions = function (...options) {
  let correct = true;
  options.forEach(option => {
    if (!config[option]) {
      console.error(`config.${option} is missing.`);
      correct = false;
    }
  });
  return correct;
}

module.exports = config;
