#!/usr/bin/env node
'use strict'

/* eslint-disable no-multi-spaces */
const BaseError                   = require('essentials/BaseError');
const { spawn, prompt }           = require('../lib/subprocess');
/* eslint-enable no-multi-spaces */

module.exports = {
    name: 'deploy',
    /**
     * deploys a dependency in the current repo.
     *
     * @param {string} component - The component to deploy
     */
    run: async(component) => {

        const allowedComponents = ['rhubarb', 'public-api'];

        if(!component || !allowedComponents.includes(component)) {
            throw new BaseError({
                name: 'ScriptInvalidParametersError',
                message: 'Parameters are invalid',
                info: { component },
            });
        }

        const ecsTasksPage = `https://s3.amazonaws.com/production-ops-task-report/${component}/ecs-tasks.html`;

        console.log(`Check the version diff by visiting ${ecsTasksPage} and clicking the "compare with master" link.`);
        const diffVerified = await prompt({ prompt: 'Does the version diff look as expected? (Y/n): ' });
        
        if (!['y', 'Y'].includes(diffVerified[0])) {
            console.log('Aborting...');

            return;
        }
        
        const environments = ['qa', 'demo', 'sandbox', 'prod'];
        
        for (const env of environments) {
            const shouldDeploy = await prompt({ prompt: `Do you want to deploy to ${env}? (Y/n): ` });

            if (['y', 'Y'].includes(shouldDeploy[0])) {
                await spawn({ command: `updateEcsComponent ${component} ${env}`, options: { shell: true } });
                // await spawn({ command: `deployEcsComponent ${component} ${env}`, options: { shell: true } });
            } else {
                console.log(`Skipping ${env} deploy`);
            }
        }
    }
};
