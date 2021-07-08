#!/usr/bin/env node
'use strict'

/* eslint-disable no-multi-spaces */
const BaseError                   = require('essentials/BaseError');
const { spawn, prompt, acknowledge } = require('../lib/subprocess');
/* eslint-enable no-multi-spaces */

module.exports = {
    name: 'RunCoreMigration',
    /**
     * Walks through the process of running a core migration in all environments.
     *
     * @param {string} migration - The name of the Core migration to run
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
        await spawn({ command: 'startEcsTask', args: ['data', 'fusion', 'CoreMigratorPending'], options });
        
        await acknowledge({
            prompt: `Check the splunk logs for CoreMigratorPending. Does ${migration} exist in the pending migrations? (Y/n): `
        });
        
        // check if the migration modifies Yoshimi
        console.log(
            'Check whether the migration modifies any fields from the Yoshimi schema. ' +
            'If it does, Yoshimi will need to be restarted (in fusion, qa, and prod) after running the migration, ' +
            'unless it is being run after business hours (i.e. 9:00pm Eastern).'
        );
        const shouldRestartYoshimi = await prompt({ prompt: 'Will Yoshimi need to be restarted after running this migration? (Y/n):' });

        // run migration in fusion
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'fusion', 'CoreMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for CoreMigratorUp in fusion. Did the migration complete successfully? (Y/n): '
        });

        console.log('If tracking this migration with a ticket in the RdsMigrations board, advance the ticket to "Applied in Fusion"');

        // restart Yoshimi, if necessary
        if (shouldRestartYoshimi) {
            await spawn({ command: 'restartEcsService', args: ['yoshimi', 'fusion', 'Yoshimi'] });

            await acknowledge({ prompt: 'Did Yoshimi restart successfully? (Y/n): ' });
        }

        // # running in qa
        // run migration in qa
        console.log(
            'While running migrations in QA, keep an eye on the IOPS and freeably memory of the database. ' +
            'If either looks like they could be a problem, talk to David, Tim or John about making a plan to run the migration. ' +
            'This is only a concern for migrations that take more than 5 minutes to run in fusion or QA.'
        );

        await prompt({ prompt: 'Press enter to continue' });

        await spawn({
            command: 'startEcsTask',
            args: ['data', 'qa', 'CoreMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for CoreMigratorUp in QA. Did the migration complete successfully? (Y/n): '
        });

        // restart Yoshimi, if necessary
        if (shouldRestartYoshimi) {
            await spawn({ command: 'restartEcsService', args: ['yoshimi', 'qa', 'Yoshimi'], options });

            await acknowledge({ prompt: 'Did Yoshimi restart successfully? (Y/n): ' });
        }

        // update release candidate branch
        const commitHash = await prompt({ prompt: 'Enter the hash of the commit with the updated schema (or skip by typing "skip"): ' });

        if (commitHash !== 'skip') {
            await spawn({ command: 'git', args: ['fetch', 'upstream'], options });
            await spawn({ command: 'git', args: ['push', 'upstream', `${commitHash}:cronut_release_candidate`], options });

            await acknowledge({ prompt: 'Did the cronut_release_candidate branch build successfully? (Y/n): ' });

            console.log(`Message #core-dev with "Data’s cronut_release_candidate branch has been updated to https://github.com/signpost/data/tree/${commitHash}"`);
            await prompt({ prompt: 'Press enter after sending this message' });
        } else {
            console.log('Skipping updating the cronut_release_candidate branch');
        }

        // # running in demo, sandbox, and prod
        // deploy build to production
        const buildId = await prompt({ prompt: 'Enter the buildId of the master build for this migration, (or skip by typing "skip"): ' });

        if (buildId !== 'skip') {
            await spawn({ command: 'deployEcsComponent', args: ['data', 'production', `signpost_data_build_${buildId.replace('-', '')}`], options});
        }

        // ensure migration is pending in production
        await spawn({ command: 'startEcsTask', args: ['data', 'production', 'CoreMigratorPending'], options });
        
        await acknowledge({
            prompt: `Check the splunk logs for CoreMigratorPending. Does ${migration} exist in the pending migrations? (Y/n): `
        });

        // confirm migration is safe to run in production
        console.log(
            'Core migrations are only sometimes safe to run during the day in production. ' +
            'If any of the following are true, the migration should probably be run after business hours (i.e. 9:00pm Eastern). ' +
            '\n1. If running the migration requires restarting Yoshimi. ' +
            '\n2. If the migration took more than 5 minutes. ' +
            '\n3. If there were any spikes in pending RDS requests when running the migration in fusion or QA. '
        )
        await acknowledge({ prompt: 'Are you sure this migration is safe to run in production right now? (Y/n): ' });

        // run migration in demo
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'demo', 'CoreMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for CoreMigratorUp in demo. Did the migration complete successfully? (Y/n): '
        });

        // run migration in sandbox
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'sandbox', 'CoreMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for CoreMigratorUp in sandbox. Did the migration complete successfully? (Y/n): '
        });

        // run migration in production
        await spawn({
            command: 'startEcsTask',
            args: ['data', 'production', 'CoreMigratorUp', `[{"name":"MIGRATION","value":"${migration}"}]`],
            options,
        });

        await acknowledge({
            prompt: 'Check the splunk logs for CoreMigratorUp in production. Did the migration complete successfully? (Y/n): '
        });

        // update release branch
        if (commitHash !== 'skip') {
            await spawn({ command: 'git', args: ['fetch', 'upstream'], options, });
            await spawn({ command: 'git', args: ['git', 'push', 'upstream', `${commitHash}:cronut_release`], options, });

            await acknowledge({ prompt: 'Did the cronut_release branch build successfully? (Y/n): ' });

            console.log(`Message #core-dev with "Data’s cronut_release branch has been updated to https://github.com/signpost/data/tree/${commitHash}"`);
            await prompt({ prompt: 'Press enter after sending this message' });
        } else {
            console.log('Skipping updating the cronut_release branch');
        }

        // open PR to core with data update
        console.log('As a follow up step, you should probably open a PR to core updating the version of data to the latest version');
    }
};
