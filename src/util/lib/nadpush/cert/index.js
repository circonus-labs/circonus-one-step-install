/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");

//
// broker ca certificate loader
//
module.exports.load = function(certFile, certURL, cb) { //eslint-disable-line consistent-return

    if (certFile === null && certURL === null) {
        return cb(new Error("Need file or URL to load Broker CA cert."));
    }

    if (certFile !== null) {
        try {
            const cert = fs.readFileSync(certFile);

            return cb(null, cert);
        }
        catch (err) {
            return cb(err);
        }
    }

    if (certURL !== null) {
        const client = certURL.protocol === "https:" ? https : http;

        client.get(certURL, (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                if (res.statusCode !== 200) {
                    return cb(new Error(`Error fetching CA cert (${certURL.href}) ${data}`));
                }
                return cb(null, data);
            });

        }).on("error", (err) => {
            return cb(err);
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
