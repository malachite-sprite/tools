#!/usr/bin/env node
'use strict'

/* eslint-disable no-multi-spaces */
const BaseError                   = require('essentials/BaseError');
const { spawn, prompt }           = require('../lib/subprocess');
/* eslint-enable no-multi-spaces */

module.exports = {
    name: 'update',
    /**
     * Updates a dependency in the current repo.
     *
     * @param {string} dependency - The name of the dependency to update
     * @param {string} ticket  - The name of the ticket to use for commits (e.g. "RHUB-000")
     */
    run: async(dependency, ticket) => {

        if (!dependency || ! ticket) {
            throw new BaseError({
                name: 'ScriptInvalidParametersError',
                message: 'Parameters are invalid',
                info: { dependency, ticket },
            });
        }

        const versionUpdated = await prompt({ prompt: 'Has the dependency version been updated in package.json? (Y/n): ' });

        if (!['y', 'Y'].includes(versionUpdated[0])) {
            console.log('Aborting...');

            return;
        }

        await spawn({ command: 'npm', args: ['install', '--ignore-scripts', dependency] });
        await spawn({ command: 'npm ls | tail -n +2 > dependencies.txt', options: { shell: true } });
        await spawn({ command: 'git', args: ['diff', 'dependencies.txt'] });

        const changesReasonable = await prompt({ prompt: 'Do the above changes look reasonable? (Y/n): '});

        if (!['y', 'Y'].includes(changesReasonable[0])) {
            console.log('Aborting...');

            return;
        }

        await spawn({
            command: 'git',
            args: ['commit', 'package.json', 'package-lock.json', 'dependencies.txt', '-m', `[${ticket}] Update ${dependency}`]
        });
        await spawn({ command: 'git', args: ['add', 'node_modules'] });
        await spawn({
            command: 'git',
            args: ['commit', 'node_modules', '-m', `[${ticket}] Update ${dependency} in node_modules`]
        });

        await spawn({ command: 'npm', args: ['rebuild'] });
        await spawn({ command: 'git', args: ['status', 'node_modules'] });

        console.log('\nIf any changes have been displayed in the `git status` command run above this, add them to the .gitignore and commit it');
        console.log('\nYou should probably run some tests before pushing these changes');
    }
};
