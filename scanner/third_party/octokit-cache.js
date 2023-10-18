// From https://github.com/w3c/horizontal-issue-tracker/blob/server/lib/octokit-cache.js.
/* eslint-env node */

"use strict";

import { Octokit as BaseOctokit } from "@octokit/core";
import { throttling } from "@octokit/plugin-throttling";
import Bottleneck from "bottleneck";
import fetch from "node-fetch";
import config from "./config.cjs";
import monitor from './monitor.cjs';
const Octokit = BaseOctokit.plugin(throttling);

const ghLimiter = new Bottleneck({
  maxConcurrent: 20,
});

const MAX_RETRIES = 3;

// check the configuration
if (!config.checkOptions("cache", "ghToken")) {
  monitor.error("Invalid configuration");
  throw new Error("Invalid configuration");
}

const octokit = new Octokit({
  auth: config.ghToken,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      if (options.request.retryCount < MAX_RETRIES) {
        monitor.warn(`Rate limit exceeded, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        monitor.error(`Rate limit exceeded, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    },
    onSecondaryRateLimit: (retryAfter, options) => {
      monitor.error(`Secondary rate limit exceeded, giving up`);
      return false;
    },
    onAbuseLimit: (retryAfter, options) => {
      if (options.request.retryCount < MAX_RETRIES) {
        monitor.warn(`Abuse detection triggered, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        monitor.error(`Abuse detection triggered, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    }
  }
});

octokit.get = async function (query_url, options) {
  if (options && options.ttl !== undefined) {
    if (query_url.indexOf("?") !== -1) {
      query_url += "&";
    } else {
      query_url += "?";
    }
    query_url += "ttl=" + options.ttl;
  }
  if (options && options.fields) {
    if (query_url.indexOf("?") !== -1) {
      query_url += "&";
    } else {
      query_url += "?";
    }
    query_url += "fields=" + options.fields;
  }

  function attempt(number) {
    return ghLimiter.schedule(()=>fetch(config.cache + query_url)).then(async res => {
      if (res.ok) return res.json();
      if (res.status === 504 && number < 3) {
        // The server was acting as a gateway or proxy and
        // did not receive a timely response from the upstream server.
        // so try again
        return attempt(number++);
      }
      throw new Error("github-cache complained " + res.status + ` ${query_url}: ${await res.text()}`,
        { cause: res.status });
    });
  }
  return attempt(0);
}

export default octokit;
