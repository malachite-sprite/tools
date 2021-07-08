#!/usr/bin/env node
'use strict'

/* eslint-disable no-multi-spaces */
const BaseError                   = require('essentials/BaseError');
const scripts                     = require('./scripts');
/* eslint-enable no-multi-spaces */

const [,, scriptName, ...args] = process.argv;

const script = scripts.filter(s => s.name === scriptName);

if (script.length) {
    script[0].run(...args).catch(error => {
        let baseError;
        if (error instanceof BaseError) {
            baseError = error;
        } else {
            baseError = new BaseError({
                name: 'ScriptUnknownError',
                message: 'Unkown error occured',
                cause: error,
            });
        }

        console.dir(BaseError.toObject(baseError, { includeCause: true, includeStackTrace: true }), { depth: 20 });
    });
} else {
    console.log('Unknown script');
    // print help message
}
