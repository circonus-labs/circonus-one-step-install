// Copyright 2016 Circonus, Inc. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

module.exports = {
    root: true,
    extends: [
        '@maier/base',
        '@maier/node',
        '@maier/node-cmd'
    ],
    rules: {
        // ...additional project specific rules
        'max-len': [
            'error',
            {
                code                   : 100,
                tabWidth               : 4,
                ignoreComments         : true,
                ignoreTrailingComments : true,
                ignoreUrls             : true,
                ignoreStrings          : true,
                ignoreTemplateLiterals : true,
                ignoreRegExpLiterals   : true
            }
        ],
        // most api objects use an underscore prefix to
        // annotate attributes which may not be modified.
        'no-underscore-dangle': 'off',
        'no-restricted-properties' : [
            'error',
            {
                message  : 'DEPRECATED (v6.0.0): use third-party module for logging',
                object   : 'util',
                property : 'log'
            },
            {
                message  : 'DEPRECATED (v0.11.3): use third-party module for logging',
                object   : 'util',
                property : 'print'
            },
            {
                message  : 'DEPRECATED (v0.11.3): use third-party module for logging',
                object   : 'util',
                property : 'puts'
            },
            {
                message  : 'DEPRECATED (v0.11.3): use console.error()',
                object   : 'util',
                property : 'debug'
            },
            {
                message  : 'DEPRECATED (v0.11.3): use console.error()',
                object   : 'util',
                property : 'error'
            },
            {
                message  : 'DEPRECATED (v4.0.0): use Array.isArray()',
                object   : 'util',
                property : 'isArray'
            },
            {
                message  : 'DEPRECATED (v4.0.0): use typeof x === "boolean"',
                object   : 'util',
                property : 'isBoolean'
            },
            {
                message  : 'DEPRECATED (v4.0.0): use Buffer.isBuffer()',
                object   : 'util',
                property : 'isBuffer'
            },
            {
                message  : 'DEPRECATED (v4.0.0)',
                object   : 'util',
                property : 'isDate'
            },
            {
                message  : 'DEPRECATED (v4.0.0)',
                object   : 'util',
                property : 'isError'
            },
            {
                message  : 'DEPRECATED (v4.0.0): use typeof x === "function"',
                object   : 'util',
                property : 'isFunction'
            },
            {
                message  : 'DEPRECATED (v4.0.0): use x === null',
                object   : 'util',
                property : 'isNull'
            },
            {
                message  : 'DEPRECATED (v4.0.0)',
                object   : 'util',
                property : 'isNullOrUndefined'
            },
            {
                message  : 'DEPRECATED (v4.0.0): typeof x === "number"',
                object   : 'util',
                property : 'isNumber'
            },
            {
                message  : 'DEPRECATED (v4.0.0): use typeof x === "object"',
                object   : 'util',
                property : 'isObject'
            },
            {
                message  : 'DEPRECATED (v4.0.0)',
                object   : 'util',
                property : 'isPrimitive'
            },
            {
                message  : 'DEPRECATED (v4.0.0)',
                object   : 'util',
                property : 'isRegExp'
            },
            {
                message  : 'DEPRECATED (v4.0.0): use typeof x === "string"',
                object   : 'util',
                property : 'isString'
            },
            {
                message  : 'DEPRECATED (v4.0.0)',
                object   : 'util',
                property : 'isSymbol'
            },
            {
                message  : 'DEPRECATED (v4.0.0): use typeof x === "undefined"',
                object   : 'util',
                property : 'isUndefined'
            }
        ]
    }
};
