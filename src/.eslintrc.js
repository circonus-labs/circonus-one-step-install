module.exports = {
    root: true,
    extends: [
        '@maier/eslint-config-base',
        '@maier/eslint-config-node'
    ],
    rules: {
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
        'no-plusplus': 'off',
        'no-underscore-dangle': 'off',  // api objects use _ prefix
        // destructuring not supported on all omnios nodejs builds yet
        'prefer-destructuring': 'off',
        // spread not supported on all omnios nodejs builds yet
        'prefer-spread': 'off'
    }
};
