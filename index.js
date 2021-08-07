
/**
 * Copyright (c) Dorian Latchague.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const axios = require('axios');
const { SES } = require('aws-sdk');

const SimpleEmailService = new SES({apiVersion: '2010-12-01'});

SimpleEmailService.config.update({ region: process.env.REGION, 
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
});

exports.handler = async (event) => {
    try {
        // Captcha Verification
        const { recaptchaToken } = event;
        const {data: {success}} = await axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`)
        if (!success) {
            throw new Error('Captcha Verification Failed!');
        }
    } catch (e) {
        return {
            statusCode: 200,
            body: e
        };
    }
    // Send thank you email to sender
    SimpleEmailService.sendTemplatedEmail({
        Destination: {
            ToAddresses: [
                event.email
            ],
            BccAddresses: process.env.PERSONAL_EMAIL
        },
        Source: process.env.PORTFOLIO_EMAIL,
        Template: 'PortfolioThankYou',
        TemplateData: JSON.stringify(event),
        ReplyToAddresses: [
            process.env.PERSONAL_EMAIL
        ],
    });
    try {
        // Send notification email
        let body = await SimpleEmailService.sendTemplatedEmail({
            Destination: {
                ToAddresses: [
                    process.env.PERSONAL_EMAIL
                ]
            },
            Source: process.env.PORTFOLIO_EMAIL,
            Template: 'PortfolioNotification',
            TemplateData: JSON.stringify(event),
            ReplyToAddresses: [
                event.email
            ],
        }).promise();
        return {
            statusCode: 200,
            body
        };
    } catch (e) {
        return {
            statusCode: 400,
            body: e
        };
    }
};
