#!/usr/bin/env node
// --expose-gc --max-old-space-size=32 --max-executable-size=64 --optimize-for-size

/*eslint-env node, es6 */
/*eslint-disable no-warning-comments, no-magic-numbers, no-process-exit */

/**
 * NAD Pusher - push NAD metrics to an HTTPTRAP check
 *
 * Use case:
 * 1. system sending metrics which has strong ingress filtering
 * 2. prevent exposure of a port providing information about the system
 * 3. virtual machines
 * 4. docker container (note, system metrics don't work if in a container)
 *    @todo nad cadvisor plugin for system metrics
 *
 * Provides:
 * 1. Run NAD on "-p 127.0.0.1:2609" isolate to only allow incoming connections from localhost
 * 2. Schedule poll of NAD and PUT to check
 *
 */

"use strict";

// core modules
const http = require("http");
const https = require("https");
const path = require("path");

// app modules
const settings = require(path.resolve(path.join(__dirname, "..", "lib", "nadpush", "settings")));
const log = require(path.resolve(path.join(__dirname, "..", "lib", "nadpush", "log")));
const cert = require(path.resolve(path.join(__dirname, "..", "lib", "nadpush", "cert")));

function sendMetrics(metricJson) {
    if (metricJson === null) {
        log.warn("No metrics to send");
        return;
    }

    if (settings.verbose) {
        log.info(`Sending metrics to broker (${settings.check_url.href})`);
    }

    if (!Array.isArray(settings.send_req_opts.ca) || settings.send_req_opts.ca.length === 0) {
        log.warn("No Broker CA cert loaded yet, not sending metrics.");
        return;
    }

    let metrics = {};

    try {
        metrics = JSON.parse(metricJson);
    }
    catch (err) {
        log.warn(`Error parsing JSON from NAD ${err}`);
        return;
    }

    const req = https.request(settings.send_req_opts);

    req.on("response", (res) => {
        let data = "";

        res.on("data", (chunk) => {
            data += chunk;
        });

        res.once("end", () => {
            if (res.statusCode !== 200) {
                log.warn(`Error sending metrics: ${data}`);
                return;
            }

            try {
                const result = JSON.parse(data);

                log.info(`${result.stats} metrics sent to broker.`);
            }
            catch (err) {
                log.warn(`Error parsing metric send result ${err} ${data}`);
            }

            metrics = null;
            metricJson = null; //eslint-disable-line no-param-reassign

        });
    });

    req.once("error", (err) => {
        log.error(`Error sending metrics to broker ${err}`);
    });

    metrics.npmem = process.memoryUsage();
    req.write(JSON.stringify(metrics));
    req.end();
}


function fetchMetrics() {
    if (settings.send_req_opts.ca[0] === null) {
        if (settings.verbose) {
            log.info("CA cert not initialized yet, waiting for next cycle.");
        }
        return;
    }

    if (settings.verbose) {
        log.info(`Fetching metrics from NAD ${settings.nad_url}`);
    }

    // a) be a nice citizen, don't consume/hold resources unecessarily.
    // b) gc aggressively, not in a time-sensitive loop.
    if (global.gc) {
        global.gc();
    }

    const client = settings.nad_url.protocol === "https:" ? https : http;

    client.get(settings.nad_url, (res) => {
        let data = "";

        res.on("data", (chunk) => {
            data += chunk;
        });

        res.once("end", () => {
            if (res.statusCode !== 200) {
                log.warn(`Error fetching metrics: ${data}`);
                return;
            }

            sendMetrics(data);

        });
    }).once("error", (err) => {
        log.error(`Error fetching metrics from NAD ${settings.nad_url} ${err}`);
    });

}


cert.load(settings.cert_file, settings.cert_url, (err, brokerCert) => {
    if (err) {
        // unable to load the cert, no point in continuing
        log.error(`Unable to load Broker CA cert ${err}`);
        process.exit(1);
    }

    if (brokerCert) {
        settings.send_req_opts.ca.push(brokerCert);
        fetchMetrics();
    }
});


//
// start sending metrics
//
settings.poller = setInterval(fetchMetrics, settings.poll_interval * 1000);

// END
