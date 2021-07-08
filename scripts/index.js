'use strict';

const fs = require('fs');

/**
 * This file is a loader for the folder. It allows a component to `require`
 *  the folder and get a list of all scripts in it.
 */

module.exports = fs.readdirSync(__dirname)
    .reduce((schemas, filename) => {
        if (filename !== 'index.js') {
            schemas = schemas.concat(require(`${__dirname}/${filename}`));
        }

        return schemas;
    }, []);
