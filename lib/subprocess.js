#!/usr/bin/env node
'use strict'

/* eslint-disable no-multi-spaces */
const BaseError                   = require('essentials/BaseError');
const P                           = require('essentials/P');
const readline                    = require('readline');
const { spawn }                   = require('child_process');
/* eslint-enable no-multi-spaces */

/**
 * Wrapper to promisify child_process.spawn. Inherets stdio from the main process.
 *
 * @param {string} command   - The command to spawn
 * @param {string[]} [args]  - An array of arguments to pass to the command
 * @param {Object} [options] - Options to pass to child_process.spawn
 * @returns {Promise.<Object>} - Object like { args } with all arguments returned
 */
module.exports.spawn = async({ command, args, options: _options }) => {
    const test = _options && _options.test || false;

    console.log([
        command,
        args ? args.join(' ') : null,
    ].filter(a => !!a).join(' '));

    if (test) {
        return P.resolve();
    }

    // inherit stdio by default
    const options = Object.assign({ stdio: 'inherit' }, _options || {});

    const deferred = P.defer();

    const child = spawn(command, args, options);

    child.on('exit', (code, ...args) => {
        if (parseInt(code) !== 0) {
            deferred.reject({ code, args });
        }
        deferred.resolve({ code, args });
    });

    child.on('error', (...args) => {
        deferred.reject({ args });
    });

    return deferred.promise;
}

/**
 * Helper to prompt the user for input.
 *
 * @param {string} prompt - The prompt to show to the user
 * @returns {Promise.<string>} - The response from the user
 */
module.exports.prompt = async({ prompt }) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const deferred = P.defer();

    rl.question(prompt, response => {
        deferred.resolve(response);
        rl.close();
    });

    return deferred.promise;
}

/**
 * Helper for asking the user to acknowledge something.
 *
 * @param {string} prompt - The prompt to show the user, exepecting a y/n response
 * @throws {BaseError} - Throws if the user does not respond affermative (y or Y)
 */
module.exports.acknowledge = async({ prompt }) => {
    const response = await module.exports.prompt({ prompt });

    if (!['y', 'Y'].includes(response[0])) {
        console.log('Aborting...');

        throw new BaseError({
            name: 'ScriptAbortedError',
            message: 'Aborted due to negative acknowledgement',
            info: { prompt, response },
        });
    }
}
