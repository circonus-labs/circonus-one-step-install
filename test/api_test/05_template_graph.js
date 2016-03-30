/*eslint-env node, es6 */
/*eslint-disable no-process-exit */

"use strict";

// core modules
const http = require("http");
const url = require("url");

// local modules
const test = require("tape");

const url_path = "/template/graph/cpu";

const id = Date.now().toString();

function makeValidRequest() {
    return {
        "type": "Linux-gnu",
        "dist": "CentOS",
        "vers": "7.1.1503",
        "arch": "x86_64"
    };
}

test(`API ${url_path} (no param)`, function(t) {
    const req_obj = url.parse(`http://127.0.0.1${url_path}`);

    http.get(url.format(req_obj), (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {
            console.log(res_data);

            t.equal(res.statusCode, 409);

            const parsed_data = JSON.parse(res_data);

            t.ok(parsed_data.hasOwnProperty("message"), "has message property");

            const msg = parsed_data.message.split(", ");

            t.equal(msg.length, 5);
            t.notEqual(msg[0].indexOf("type"), -1);
            t.notEqual(msg[1].indexOf("dist"), -1);
            t.notEqual(msg[2].indexOf("vers"), -1);
            t.notEqual(msg[3].indexOf("arch"), -1);
            t.notEqual(msg[4].indexOf("ref id"), -1);

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(8);

});


test(`API ${url_path.replace("cpu","foobar")} (invalid)`, function(t) {
    const req_obj = url.parse(`http://127.0.0.1${url_path.replace("cpu", "foobar")}`);
    let req_args = makeValidRequest();

    req_obj.query = req_args;

    console.log(url.format(req_obj));

    http.get(url.format(req_obj), (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {
            console.log(res_data);

            t.equal(res.statusCode, 404);

            const parsed_data = JSON.parse(res_data);

            t.ok(parsed_data.hasOwnProperty("message"), "has message property");

            const msg = parsed_data.message.split(", ");

            t.equal(msg.length, 2);
            t.notEqual(msg[0].indexOf("foobar"), -1);
            t.notEqual(msg[1].indexOf("ref id"), -1);

        });

    }).on("error", (err) => {
        throw err;
    });

    t.plan(5);

});

// not testing every possible graph template
// this is testing to ensure that the template is:
// a) returned
// b) not fucked up during load/parse/send
// c) has the fundamentals required to correctly create
//    another set of tests can verify each template if need be
test(`API ${url_path} (valid)`, function(t) {
    const requiredGraphProperties = [
        "access_keys",
        "composites",
        "datapoints",
        "description",
        "guides",
        "line_style",
        "logarithmic_left_y",
        "logarithmic_right_y",
        "max_left_y",
        "max_right_y",
        "metric_clusters",
        "min_left_y",
        "min_right_y",
        "notes",
        "style",
        "tags",
        "title"
    ];
    const requiredDatapointProperties = [
        "alpha",
        "axis",
        "check_id",
        "color",
        "data_formula",
        "derive",
        "hidden",
        "legend_formula",
        "metric_name",
        "metric_type",
        "name",
        "stack"
    ];
    const requiredTemplateProperties = [
        "description",
        "variable_metrics",
        "graphs"
    ];
    const req_obj = url.parse(`http://127.0.0.1${url_path}`);
    let req_args = makeValidRequest();

    req_obj.query = req_args;

    console.log(url.format(req_obj));

    http.get(url.format(req_obj), (res) => {
        let res_data = "";

        res.on("data", (chunk) => {
            res_data += chunk;
        });

        res.on("end", () => {
            console.log(res_data);
            const parsed_data = JSON.parse(res_data);
            let total_datapoints = 0;

            // test template
            t.test("template", (st) => {
                st.plan(3 + requiredTemplateProperties.length);
                st.equal(res.statusCode, 200);
                for (let i = 0; i < requiredTemplateProperties.length; i++) {
                    st.ok(parsed_data.hasOwnProperty(requiredTemplateProperties[i]), `has ${requiredTemplateProperties[i]} property`);
                }
                st.ok(Array.isArray(parsed_data.graphs), "graphs is array");
                st.ok(parsed_data.graphs.length > 0, "graphs.length > 0");
            });

            // test template.graphs
            t.test("graphs", (st) => {
                st.plan(parsed_data.graphs.length * requiredGraphProperties.length + parsed_data.graphs.length * 2);
                for (let i = 0; i < parsed_data.graphs.length; i++) {
                    for (let j = 0; j < requiredGraphProperties.length; j++) {
                        st.ok(parsed_data.graphs[i].hasOwnProperty(requiredGraphProperties[j]), `graphs[${i}] has ${requiredGraphProperties[j]} property`);
                    }
                    st.ok(Array.isArray(parsed_data.graphs[i].datapoints), `graphs[${i}].datapoints is array`);
                    st.ok(parsed_data.graphs[i].datapoints.length > 0, `graphs[${i}].datapoints.length > 0`);
                    total_datapoints += parsed_data.graphs[i].datapoints.length;
                }
            });

            // test template.graphs[*].datapoints
            t.test("datapoints", (st) => {
                st.plan(total_datapoints * requiredDatapointProperties.length);
                for (let i = 0; i < parsed_data.graphs.length; i++) {
                    for (let j = 0; j < parsed_data.graphs[i].datapoints.length; j++) {
                        for (let k = 0; k < requiredDatapointProperties.length; k++) {
                            st.ok(
                                parsed_data.graphs[i].datapoints[j].hasOwnProperty(requiredDatapointProperties[k]),
                                `graphs[${i}].datapoints[${j}] has ${requiredDatapointProperties[k]} property`);
                        }
                    }
                }
            });

        });

    }).on("error", (err) => {
        throw err;
    });

});
