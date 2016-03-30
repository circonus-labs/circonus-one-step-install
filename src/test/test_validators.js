/*eslint-env node, es6 */
/*eslint-disable no-magic-numbers */

"use strict";

// core modules
const path = require("path");

// local modules
const test = require("tape");

// test module
const validate = require(path.normalize(path.join(__dirname, "..", "lib", "validators")));

const id = Date.now().toString();
const res = null; // it isn't used in validators

function makeValidRequest() {

    return {
        id: () => { return id; },
        params: {
            "type": "Linux-gnu",
            "dist": "CentOS",
            "vers": "7.1.1503",
            "arch": "x86_64"
        }
    };
}

test("Validate requiredParameters (valid)", (t) => {
    const next = (err) => {
        t.ok(typeof err === "undefined", "should NOT have errors");
    };
    const req = makeValidRequest();

    t.plan(1);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (no params)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 5);
        t.ok(err_list[0].indexOf("type") > 0, "Error message has \"'type'\"");
        t.ok(err_list[1].indexOf("dist") > 0, "Error message has \"'dist'\"");
        t.ok(err_list[2].indexOf("vers") > 0, "Error message has \"'vers'\"");
        t.ok(err_list[3].indexOf("arch") > 0, "Error message has \"'arch'\"");
        t.ok(err_list[4].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    delete req.params.type;
    delete req.params.dist;
    delete req.params.vers;
    delete req.params.arch;

    t.plan(9);
    validate.requiredParameters(req, res, next);
});


//// type

test("Validate requiredParameters (missing type)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("type") > 0, "Error message has \"'type'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    delete req.params.type;

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (null type)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("type") > 0, "Error message has \"'type'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.type = null;

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (invalid type)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("type") > 0, "Error message has \"'type'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.type += "{bad} ^[a-z\_\-]+$";

    t.plan(6);
    validate.requiredParameters(req, res, next);
});


//// dist

test("Validate requiredParameters (missing dist)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("dist") > 0, "Error message has \"'dist'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    delete req.params.dist;

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (null dist)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("dist") > 0, "Error message has \"'dist'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.dist = null;

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (invalid dist)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("dist") > 0, "Error message has \"'dist'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.dist += "{bad} ^[a-z]+$";

    t.plan(6);
    validate.requiredParameters(req, res, next);
});


//// vers

test("Validate requiredParameters (missing vers)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("vers") > 0, "Error message has \"'vers'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    delete req.params.vers;

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (null vers)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("vers") > 0, "Error message has \"'vers'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.vers = null;

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (invalid vers)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("vers") > 0, "Error message has \"'vers'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.vers += "bad ^[0-9\.]+$";

    t.plan(6);
    validate.requiredParameters(req, res, next);
});


////  arch

test("Validate requiredParameters (missing arch)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("arch") > 0, "Error message has \"'arch'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    delete req.params.arch;

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (null arch)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("arch") > 0, "Error message has \"'arch'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.arch = null;

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (invalid arch)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("arch") > 0, "Error message has \"'arch'\"");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.arch += "bad ^(i386|i686|x86_64|amd64)$";

    t.plan(6);
    validate.requiredParameters(req, res, next);
});


//// Unsupported

test("Validate requiredParameters (unsupported dist)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 404);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("unsup") > 0, "Error message has 'unsup'");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.dist = "unsup";

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (unsupported vers)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 404);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("0.0") > 0, "Error message has '0.0'");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.vers = "0.0";

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

test("Validate requiredParameters (unsupported arch)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 404);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("i386") > 0, "Error message has 'i386'");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.arch = "i386";

    t.plan(6);
    validate.requiredParameters(req, res, next);
});

///////////////
///////////////
/////////////// agentMode
///////////////
///////////////

test("Validate agentMode (no mode)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("mode") > 0, "Error message has 'mode'");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    t.plan(6);
    validate.agentMode(req, res, next);
});

test("Validate agentMode (invalid mode)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("foobar") > 0, "Error message has 'foobar'");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.mode = "foobar";

    t.plan(6);
    validate.agentMode(req, res, next);
});

test("Validate agentMode (valid mode pull)", (t) => {
    const next = (err) => {
        t.equal(typeof err, "undefined");
    };
    const req = makeValidRequest();

    req.params.mode = "pull";

    t.plan(1);
    validate.agentMode(req, res, next);
});

test("Validate agentMode (valid mode push)", (t) => {
    const next = (err) => {
        t.equal(typeof err, "undefined");
    };
    const req = makeValidRequest();

    req.params.mode = "pull";

    t.plan(1);
    validate.agentMode(req, res, next);
});


///////////////
///////////////
/////////////// templateId
///////////////
///////////////

test("Validate templateId (no template id)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 3);
        t.ok(err_list[0].indexOf("template category") > 0, "Error message has 'template category'");
        t.ok(err_list[1].indexOf("template name") > 0, "Error message has 'template name'");
        t.ok(err_list[2].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    t.plan(7);
    validate.templateId(req, res, next);
});


test("Validate templateId (no template name)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("template name") > 0, "Error message has 'template name'");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.t_cat = "check";

    t.plan(6);
    validate.templateId(req, res, next);
});

test("Validate templateId (invalid category)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("{foobar}") > 0, "Error message has '{foobar}'");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.t_cat = "{foobar}";
    req.params.t_name = "system";

    t.plan(6);
    validate.templateId(req, res, next);
});

test("Validate templateId (invalid name)", (t) => {
    const next = (err) => {
        const err_list = err.message.split(", ");

        console.log(err.statusCode, err.toString());

        t.equal(typeof err, "object");
        t.equal(err.statusCode, 409);
        t.equal(typeof err.message, "string");
        t.equal(err_list.length, 2);
        t.ok(err_list[0].indexOf("{foobar}") > 0, "Error message has '{foobar}'");
        t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
    };
    const req = makeValidRequest();

    req.params.t_cat = "check";
    req.params.t_name = "{foobar}";

    t.plan(6);
    validate.templateId(req, res, next);
});

test("Validate templateId (valid id)", (t) => {
    const next = (err) => {
        t.equal(typeof err, "undefined");
    };
    const req = makeValidRequest();

    req.params.t_cat = "check";
    req.params.t_name = "system";

    t.plan(1);
    validate.templateId(req, res, next);
});


// /////////////// configParameters
//
// test("Validate configParameters (no id)", (t) => {
//     const next = (err) => {
//         const err_list = err.message.split(", ");
//
//         console.log(err.statusCode, err.toString());
//
//         t.equal(typeof err, "object");
//         t.equal(err.statusCode, 409);
//         t.equal(typeof err.message, "string");
//         t.equal(err_list.length, 2);
//         t.ok(err_list[0].indexOf("config ID") > 0, "Error message has 'config ID'");
//         t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
//     };
//     const req = makeValidRequest();
//
//     t.plan(6);
//     validate.configParameters(req, res, next);
// });
//
// test("Validate configParameters (no mode)", (t) => {
//     const next = (err) => {
//         const err_list = err.message.split(", ");
//
//         console.log(err.statusCode, err.toString());
//
//         t.equal(typeof err, "object");
//         t.equal(err.statusCode, 409);
//         t.equal(typeof err.message, "string");
//         t.equal(err_list.length, 2);
//         t.ok(err_list[0].indexOf("mode") > 0, "Error message has 'mode'");
//         t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
//     };
//     const req = makeValidRequest();
//
//     req.params.id = "system";
//
//     t.plan(6);
//     validate.configParameters(req, res, next);
// });
//
// test("Validate configParameters (id=system, mode=invalid)", (t) => {
//     const next = (err) => {
//         const err_list = err.message.split(", ");
//
//         console.log(err.statusCode, err.toString());
//
//         t.equal(typeof err, "object");
//         t.equal(err.statusCode, 409);
//         t.equal(typeof err.message, "string");
//         t.equal(err_list.length, 2);
//         t.ok(err_list[0].indexOf("foobar") > 0, "Error message has 'foobar'");
//         t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
//     };
//     const req = makeValidRequest();
//
//     req.params.id = "system";
//     req.params.mode = "foobar";
//
//     t.plan(6);
//     validate.configParameters(req, res, next);
// });
//
// test("Validate configParameters (id=statsd, mode=invalid)", (t) => {
//     const next = (err) => {
//         const err_list = err.message.split(", ");
//
//         console.log(err.statusCode, err.toString());
//
//         t.equal(typeof err, "object");
//         t.equal(err.statusCode, 409);
//         t.equal(typeof err.message, "string");
//         t.equal(err_list.length, 2);
//         t.ok(err_list[0].indexOf("foobar") > 0, "Error message has 'foobar'");
//         t.ok(err_list[1].indexOf(id) > 0, "Error message has id");
//     };
//     const req = makeValidRequest();
//
//     req.params.id = "statsd";
//     req.params.mode = "foobar";
//
//     t.plan(6);
//     validate.configParameters(req, res, next);
// });
//
// test("Validate configParameters (id=system, mode=pull)", (t) => {
//     const next = (err) => {
//         t.equal(typeof err, "undefined");
//     };
//     const req = makeValidRequest();
//
//     req.params.id = "system";
//     req.params.mode = "pull";
//
//     t.plan(1);
//     validate.configParameters(req, res, next);
// });
//
// test("Validate configParameters (id=system, mode=push)", (t) => {
//     const next = (err) => {
//         t.equal(typeof err, "undefined");
//     };
//     const req = makeValidRequest();
//
//     req.params.id = "system";
//     req.params.mode = "push";
//
//     t.plan(1);
//     validate.configParameters(req, res, next);
// });
//
// test("Validate configParameters (id=statsd, mode=remote)", (t) => {
//     const next = (err) => {
//         t.equal(typeof err, "undefined");
//     };
//     const req = makeValidRequest();
//
//     req.params.id = "statsd";
//     req.params.mode = "remote";
//
//     t.plan(1);
//     validate.configParameters(req, res, next);
// });
//
// test("Validate configParameters (id=statsd, mode=local)", (t) => {
//     const next = (err) => {
//         t.equal(typeof err, "undefined");
//     };
//     const req = makeValidRequest();
//
//     req.params.id = "statsd";
//     req.params.mode = "local";
//
//     t.plan(1);
//     validate.configParameters(req, res, next);
// });
