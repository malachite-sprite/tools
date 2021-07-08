#!/usr/bin/env node
'use strict'

/* eslint-disable no-multi-spaces */
// const BaseError                   = require('essentials/BaseError');
const { spawn }                   = require('../lib/subprocess');
const fs                          = require('fs');
/* eslint-enable no-multi-spaces */

/**
 * Note to future Max:
 * 
 * To get this working, you'll need to create these temporary DNM commits on master and comms_refactor:
 * - double the sql statement timeout ms (see config/default.json)
 * - force echo:false in Logger.js so that output goes to splunk
 * - add ORDER BY clauses to document SQL for document comparison
 * 
 * General usage is something like:
 * $ mia compare UserComm USER 888182855
 * 
 * For long running scripts, you can append a "; say beep" to alert you when the script is done
 * 
 * Note the "disabled" section of all of the EXCEPTIONS. This can be used to narrow down what the error
 * is for documents. Also note the refreshDocumentFiles toggle in the main portion of the script.
 * This can be used to skip refreshing the document files, in the cases where you need to rerun the
 * comparison for a long running refresh.
 * 
 * Might be worth sharing this at some point?
 * 
 * If the comms refactor is complete when you see this next, you can delete this script.
 */

// An array of objects with an "applies" function which take two comms and determins whether the exception applies.
// Object can have an "disabled" flag to stop the exception from being counted, if desired. Useful for common
// differences that aren't actually exceptions.
const EXCEPTIONS = [
    {
        message: 'If the new comm is missing the offer title',
        disabled: true,
        strip: ({ newComm, oldComm }) => {
            if (newComm.offer_title === null && oldComm.offer_title) {
                delete newComm.offerTitle;
                delete oldComm.offerTitle;
            }
        },
    },
    {
        message: 'If the new comm is missing the message Id',
        disabled: true,
        strip: ({ newComm, oldComm }) => {
            if (newComm.messageId === null && oldComm.messageId) {
                delete newComm.messageId;
                delete oldComm.messageId;
            }
        },
    },
    {
        message: 'If the new comm has isReminder true when the comm is a reminder',
        disabled: true,
        strip: ({ newComm, oldComm }) => {
            if (newComm.isReminder && !oldComm.isReminder && newComm.emailType.includes('Reminder')) {
                delete newComm.isReminder;
                delete oldComm.isReminder;
            }
        },
    },
    {
        message: 'If the new comm has trigger info where the old comm did not',
        disabled: true,
        strip: ({ newComm, oldComm }) => {
            if (
                (oldComm.emailTrigger === null && oldComm.manuallyTriggered === null) &&
                (newComm.emailTrigger !== null && newComm.manuallyTriggered !== null)
            ) {
                delete newComm.emailTrigger;
                delete newComm.manuallyTriggered;
                delete oldComm.emailTrigger;
                delete oldComm.manuallyTriggered;
            }
        },
    },
    {
        message: 'If the new comm is missing an empty media array',
        disabled: true,
        strip: ({ newComm, oldComm }) => {
            if (Array.isArray(oldComm.media) && oldComm.media.length === 0 && newComm.media === undefined) {
                delete newComm.media;
                delete oldComm.media;
            }
        }
    },
    {
        message: 'If review site ID is populated in new comm and not in old',
        disabled: true,
        strip: ({ newComm, oldComm }) => {
            if(oldComm.reviewSiteId === undefined || !!newComm.reviewSiteId) {
                delete newComm.reviewSiteId;
                delete oldComm.reviewSiteId;
            }
        }
    },
];

module.exports = {
    name: 'compare',
    /**
     * One off script to compare batches of documents for the comms refactor.
     *
     * @param {string} documentType - The document type to compare, e.g. RemarketingEmail
     * @param {string} selectorType - The selector to use, e.g. LOCATION or USER
     * @param {string} selectorIds - The selector IDs to use in a comma-delimited array, e.g. 1234,0978,4579
     */
    run: async(documentType, selectorType, selectorIds) => {
        // toggle to skip refreshing document files. Useful to rerun the diff'ing logic against the local document files.
        const refreshDocumentFiles = true;

        // checkout master branch
        await spawn({ command: 'git', args: ['checkout', 'master'], options: { test: !refreshDocumentFiles } });

        // add ORDER BY clause to document SQL (done)

        // run refresh documents script locally with OUT_TO_STDERR option
        await spawn({
            command: 'OUT_TO_STDERR=y SCRIPT_TYPE=recurring SCRIPT_NAME=RefreshDocuments ' +
                'TEST_LOCAL=y SIGNPOST_APP=marcher NODE_ENV=fusion TZ=utc node ./scripts/ScriptRunner.js ' +
                `NonAggregates -s ${selectorType} -i ${selectorIds} -d ${documentType} 2> master.txt`,
            options: { shell: true, test: !refreshDocumentFiles },
        });

        // checkout comms refactor branch
        await spawn({ command: 'git', args: ['checkout', 'comms_refactor'], options: { test: !refreshDocumentFiles } });

        // add ORDER BY clause to document SQL (done)
        // ensure refresh documents script has OUT_TO_STDERR option (done)

        // run refresh documents script locally with OUT_TO_STDERR option
        await spawn({
            command: 'OUT_TO_STDERR=y SCRIPT_TYPE=recurring SCRIPT_NAME=RefreshDocuments ' +
                'TEST_LOCAL=y SIGNPOST_APP=marcher NODE_ENV=fusion TZ=utc node ./scripts/ScriptRunner.js ' +
                `NonAggregates -s ${selectorType} -i ${selectorIds} -d ${documentType} 2> comms_refactor.txt`,
            options: { shell: true, test: !refreshDocumentFiles },
        });

        const filename1 = 'comms_refactor.txt'
        const filename2 = 'master.txt';

        const outputFilename = 'difference.diff';
        let numDifferences = 0;

        const file1 = fs.readFileSync(filename1, 'utf8').split('\n');
        const file2 = fs.readFileSync(filename2, 'utf8').split('\n');

        // iterate through files, looking for diffs, filtering exceptions
        let iter1 = 0;
        let iter2 = 0;

        const diffs = [
            `--- ${filename1}`,
            `+++ ${filename2}`,
        ];

        while (iter1 < file1.length -1 && iter2 < file2.length -1) {
            let comm1;
            let comm2;

            try {
                comm1 = JSON.parse(file1[iter1]);
                comm2 = JSON.parse(file2[iter2]);
            } catch(error) {
                console.log('Error parsing JSON', { iter1, iter2 });
                console.log(file1[iter1]);
                console.log(file2[iter2]);

                throw error;
            }

            if (comm1.id === comm2.id) {
                const strippedComm1 = JSON.parse(JSON.stringify(comm1));
                const strippedComm2 = JSON.parse(JSON.stringify(comm2));

                // Check for exceptions, stripping them out as necessary
                EXCEPTIONS.forEach(
                    exception => (
                        !exception.disabled &&
                        exception.strip({ newComm: strippedComm1, oldComm: strippedComm2 })
                    )
                );

                if (JSON.stringify(strippedComm1) !== JSON.stringify(strippedComm2)) {
                    diffs.push(
                        `- ${JSON.stringify(comm1)}`,
                        `+ ${JSON.stringify(comm2)}`
                    );
                    numDifferences += 1;
                }

                iter1 += 1;
                iter2 += 1;
            } else if (comm1.id < comm2.id) {
                diffs.push(`- ${JSON.stringify(comm1)}`);

                iter1 += 1;
                numDifferences += 1;
            } else if (comm1.id > comm2.id) {
                diffs.push(`+ ${JSON.stringify(comm2)}`);

                iter2 += 1;
                numDifferences += 1;
            } else {
                throw new Error('Something unexpected happened')
            }
        }

        console.log(`number of documents different between the two: ${numDifferences}`);
        console.log(`total documents in ${filename1}: ${file1.length-1}`);
        console.log(`total documents in ${filename2}: ${file2.length-1}`);

        fs.writeFileSync(outputFilename, diffs.join('\n'));
    }
};
