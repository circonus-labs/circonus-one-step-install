// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');

//
// broker ca certificate loader
//
module.exports.load = (certFile, certURL, cb) => {
    if (certFile === null && certURL === null) {
        cb(new Error('Need file or URL to load Broker CA cert.'));

        return;
    }

    if (certFile !== null) {
        try {
            const cert = fs.readFileSync(certFile);

            cb(null, cert);

            return;
        } catch (err) {
            cb(err);

            return;
        }
    }

    if (certURL !== null) {
        const client = certURL.protocol === 'https:' ? https : http;

        client.get(certURL, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    cb(new Error(`Error fetching CA cert (${certURL.href}) ${data}`));

                    return;
                }

                cb(null, data);
            });
        }).on('error', (err) => {
            cb(err);
        });
    }
};


// promise for later use (node v6, or when omnibus updated to node v4)
// function certLoad(certFile, certUrl) {
//
//     if (certFile !== null) {
//         return new Promise((resolve, reject) => {
//             fs.readFile(certFile, (err, data) => {
//                 if (err) {
//                     reject(err);
//                 } else {
//                     resolve(data);
//                 }
//             });
//         });
//     }
//
//     if (certUrl !== null) {
//         return new Promise((resolve, reject) => {
//             http.get(certUrl, (res) => {
//                 let data = "";
//
//                 res.on("data", (chunk) => {
//                     data += chunk;
//                 });
//
//                 res.on("end", () => {
//                     if (res.statusCode >= 200 && res.statusCode < 300) {
//                         resolve(data);
//                     } else {
//                         reject(new Error(`HTTP error ${res.statusCode}` `${data}`));
//                     }
//                 });
//             }).on("error", (err) => {
//                 reject(err);
//             });
//         });
//     }
//
//     return new Error("No cert file/url provided.");
// }
//
// certLoad(settings.cert_file, settings.cert_url).
//     then((brokerCert) => {
//         settings.send_req_opts.ca.push(brokerCert);
//         fetchMetrics();
//     }).
//     catch((err) => {
//         throw err;
//     });


// END
