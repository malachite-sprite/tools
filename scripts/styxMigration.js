#!/usr/bin/env node
'use strict'

/* eslint-disable no-multi-spaces */
const BaseError                   = require('essentials/BaseError');
const { spawn, prompt, acknowledge } = require('../lib/subprocess');
/* eslint-enable no-multi-spaces */

module.exports = {
    name: 'RunStyxMigration',
    /**
     * Walks through the process of running a styx migration in all environments.
     *
     * @param {string} migration - The name of the Styx migration to run
     */
    run: async(migration) => {

        const options = { test: true };

        if (!migration) {
            throw new BaseError({
                name: 'ScriptInvalidParametersError',
                message: 'Parameters are invalid',
                info: { migration },
            });
        }

        // # log script requirements
        console.log('This script assumes you are running it in this data repository, and have configured `upstream` as a remote repo pointing to the signpost/data repo');
        await acknowledge({ prompt: 'Is that the case? (Y/n): ' });

        // # running in fusion
        // ensure migration is pending
        await spawn({ command: 'startEcsTask', args: ['data', 'fusion', 'StyxMigratorPending'], options });
        
        await acknowledge({
            prompt: `Check the splunk logs for StyxMigratorPending. Does ${migration} exist in the pending migrations? (Y/n): `
        });

        // run migration in fusion
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'fusion', 'StyxMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for StyxMigratorUp in fusion. Did the migration complete successfully? (Y/n): '
        });

        console.log('If tracking this migration with a ticket in the RdsMigrations board, advance the ticket to "Applied in Fusion"\n');

        // # running in qa
        // run migration in qa
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'qa', 'StyxMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for StyxMigratorUp in QA. Did the migration complete successfully? (Y/n): '
        });

        // update release candidate branch
        const commitHash = await prompt({ prompt: 'Enter the hash of the commit with the updated schema (or skip by typing "skip"): ' });

        if (commitHash !== 'skip') {
            await spawn({ command: 'git', args: ['fetch', 'upstream'], options, });
            await spawn({ command: 'git', args: ['push', 'upstream', `${commitHash}:styx_release_candidate`], options, });

            await acknowledge({ prompt: 'Did the styx_release_candidate branch build successfully? (Y/n): ' });

            console.log(`Message #rhubarb-dev with "Data’s styx_release_candidate branch has been updated to https://github.com/signpost/data/tree/${commitHash}"`);
            await prompt({ prompt: 'Press enter after sending this message' });
        } else {
            console.log('Skipping updating the styx_release_candidate branch');
        }

        // # running in demo, sandbox, and prod
        // deploy build to production
        const buildId = await prompt({ prompt: 'Enter the buildId of the master build for this migration, (or skip by typing "skip"): ' });

        if (buildId !== 'skip') {
            await spawn({
                command: 'deployEcsComponent',
                args: ['data', 'production', `signpost_data_build_${buildId.replace('-', '')}`],
                options
            });
        }

        // ensure migration is pending in production
        await spawn({ command: 'startEcsTask', args: ['data', 'production', 'StyxMigratorPending'], options });
        
        await acknowledge({
            prompt: `Check the splunk logs for StyxMigratorPending. Does ${migration} exist in the pending migrations? (Y/n): `
        });

        // confirm migration is safe to run in production
        console.log(
            'Styx migrations are generally safe to run in production. There is no replica lag to account for. ' +
            'If it took over half an hour to run in QA, it might be a good idea to wait to run it out of business hours ' +
            '(i.e. after 9pm eastern).'
        )
        await acknowledge({ prompt: 'Are you sure this migration is safe to run in production right now? (Y/n): ' });

        // run migration in demo
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'demo', 'StyxMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for StyxMigratorUp in demo. Did the migration complete successfully? (Y/n): '
        });

        // run migration in sandbox
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'sandbox', 'StyxMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for StyxMigratorUp in sandbox. Did the migration complete successfully? (Y/n): '
        });

        // run migration in production
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'production', 'StyxMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for StyxMigratorUp in production. Did the migration complete successfully? (Y/n): '
        });

        // update release branch
        if (commitHash !== 'skip') {
            await spawn({ command: 'git', args: ['fetch', 'upstream'], options, });
            await spawn({ command: 'git', args: ['git', 'push', 'upstream', `${commitHash}:styx_release`], options, });

            await acknowledge({ prompt: 'Did the styx_release branch build successfully? (Y/n): ' });

            console.log(`Message #rhubarb-dev with "Data’s styx_release branch has been updated to https://github.com/signpost/data/tree/${commitHash}"`);
            await prompt({ prompt: 'Press enter after sending this message' });
        } else {
            console.log('Skipping updating the styx_release branch');
        }
    }
};
