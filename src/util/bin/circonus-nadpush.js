#!/usr/bin/env node
// --expose-gc --max-old-space-size=32 --max-executable-size=64 --optimize-for-size

// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

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

'use strict';

// core modules
const http = require('http');
const https = require('https');
const path = require('path');

// app modules
const settings = require(path.resolve(path.join(__dirname, '..', 'lib', 'nadpush', 'settings')));
const log = require(path.resolve(path.join(__dirname, '..', 'lib', 'nadpush', 'log')));
const cert = require(path.resolve(path.join(__dirname, '..', 'lib', 'nadpush', 'cert')));

/**
 * send metrics to circonus
 * @arg {String} metricJson metrics in json format
 * @returns {Undefined} nothing
 */
function sendMetrics(metricJson) {
    if (metricJson === null) {
        log.warn('No metrics to send');

        return;
    }

    if (settings.verbose) {
        log.info(`Sending metrics to broker (${settings.check_url.href})`);
    }

    if (!Array.isArray(settings.send_req_opts.ca) || settings.send_req_opts.ca.length === 0) {
        log.warn('No Broker CA cert loaded yet, not sending metrics.');

        return;
    }

    let metrics = {};

    try {
        metrics = JSON.parse(metricJson);
    } catch (err) {
        log.warn(`Error parsing JSON from NAD ${err}`);

        return;
    }

    metrics.npmem = process.memoryUsage();
    const fullmetrics = JSON.stringify(metrics);
    const client = settings.send_req_opts.protocol === 'https:' ? https : http;

    if (!{}.hasOwnProperty.call(settings.send_req_opts, 'agent') || settings.send_req_opts.agent === false) {
        settings.send_req_opts.agent = new client.Agent();
        settings.send_req_opts.agent.keepAlive = false;
        settings.send_req_opts.agent.keepAliveMsecs = 0;
        settings.send_req_opts.agent.maxSockets = 1;
        settings.send_req_opts.agent.maxFreeSockets = 1;
        settings.send_req_opts.agent.maxCachedSessions = 0;
    }

    const req = client.request(settings.send_req_opts);

    req.setHeader('Content-Length', Buffer.byteLength(fullmetrics));

    req.on('response', (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('error', (err) => {
            console.dir(err);
        });

        res.once('end', () => {
            if (res.statusCode !== 200) {
                log.warn(`Error sending metrics: ${data}`);

                return;
            }

            try {
                const result = JSON.parse(data);

                if (!settings.silent) {
                    log.info(`${result.stats} metrics sent to broker.`);
                }
            } catch (err) {
                log.warn(`Error parsing metric send result ${err} ${data}`);
            }

            metrics = null;
            metricJson = null; // eslint-disable-line no-param-reassign
        });
    });

    req.once('error', (err) => {
        log.error(`Error sending metrics to broker ${err}`);
    });

    req.write(fullmetrics);
    req.end();
}


/**
 * fetch metrics from local nad instance
 * @returns {Undefined} nothing
 */
function fetchMetrics() {
    if (settings.verbose) {
        log.info(`Fetching metrics from NAD ${settings.nad_url.href}`);
    }

    // a) be a nice citizen, don't consume/hold resources unecessarily.
    // b) gc aggressively, not in a time-sensitive loop.
    if (global.gc) {
        global.gc();
    }

    const client = settings.nad_url.protocol === 'https:' ? https : http;

    client.get(settings.nad_url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.once('end', () => {
            if (res.statusCode !== 200) {
                log.warn(`Error fetching metrics: ${data}`);

                return;
            }

            sendMetrics(data);
        });
    }).once('error', (err) => {
        log.error(`Error fetching metrics from NAD ${settings.nad_url.href} ${err}`);
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
