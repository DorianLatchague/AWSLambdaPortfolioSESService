/**
 * Copyright (c) Dorian Latchague.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const axios = require('axios');
const { SES } = require('aws-sdk');

const SimpleEmailService = new SES({
    apiVersion: '2010-12-01',
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
});

/**
 * @api {post} This API uses AWS Simple Email Service to send a notification email with a message to the recipient as well as a thank you email to the author of the message. It is written for usage on AWS Lambda in combination with AWS API Gateway to define the route.
 * 
 * @apiParam {string} recaptcha - Recaptcha verification code
 * @apiParam {string} name - Name of the author of the message
 * @apiParam {string} email - Email of the author of the message
 * @apiParam {string} subject - Subject of the Email
 * @apiParam {string} message - Message
 * 
 * @apiError 400 Bad Request - The body of the request was missing required properties
 * @apiErrorExample {string} Error-Response:
 *     HTTP/2 400 Bad Request
 *     "Bad Request"
 * 
 * @apiError 401 Unauthorized - The provided Recaptcha Code didn't make it past verification
 * @apiErrorExample {string} Error-Response:
 *     HTTP/2 401 Unauthorized
 *     "Your form has been flagged as fraudulous. Please email me directly at example@domain.com."
 * 
 * @apiError 422 Unprocessable Entity - The body of the request was missing required properties
 * @apiErrorExample {json} Error-Response:
 *     HTTP/2 422 Unprocessable Entity
 *     {
 *          "name": "string",
 *          "email": "string",
 *          "subject": "string",
 *          "message": "string"
 *     }
 * 
 * @apiError 500 Internal Server Error - Something went wrong
 * @apiErrorExample {string} Error-Response:
 *     HTTP/2 500 Internal Server Error
 *     "Something went wrong. If this error persists, please notify me by email at example@domain.com."
 * 
 * @apiError 503 Service Unavailable - SES failed to send the notification email
 * @apiErrorExample {string} Error-Response:
 *     HTTP/2 503 Service Unavailable
 *     "Service is currently unavailable. Please try again later."
 * 
 * @apiSuccess {string} statusText - Standard response will be "OK"
 *
 */

exports.handler = async event => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: 'Bad Request'
        };
    }
    let body = JSON.parse(event.body);
    if ('recaptcha' in body && 'name' in body && 'email' in body && 'subject' in body && 'message' in body) {
        // Validations
        // body.name
        let validations = {};
        if (body.name.length < 2) {
            validations.name = 'Your name was too short. It should be at least 2 characters long.';
        } else if (body.name.length > 50) {
            validations.name = 'Your name was too large. Please limit your answer to 50 characters.';
        }
        // body.email
        if (body.email.length < 3) {
            validations.email = 'Please enter a valid email.';
        } else if (body.email.length > 254) {
            validations.email = 'Please enter a valid email.';
        } else if (body.email.indexOf('@') === -1) {
            validations.email = 'Please enter a valid email.';
        }
        // body.subject
        if (body.subject.length < 2) {
            validations.subject = 'Please enter a subject. It should be at least 2 characters long.';
        } else if (body.subject.length > 255) {
            validations.subject = 'Please limit your subject to 255 characters.';
        }
        // body.message
        if (body.message.length < 10) {
            validations.message = 'Please enter a message. It should be at least 10 characters long.';
        } else if (body.message.length > 2000) {
            validations.message = 'Please limit your subject to 2000 characters.';
        }
        if (Object.keys(validations).length) {
            return {
                statusCode: 422,
                body: JSON.stringify(validations)
            };
        }
    } else {
        return {
            statusCode: 400,
            body: {
                message: 'Bad Request'
            }
        };
    }
    try {
        // Captcha Verification on body.recaptcha
        let response = await axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${body.recaptcha}`);
        if (!response || !response.data) {
            return {
                statusCode: 500,
                body: `Something went wrong. If this error persists, please notify me by email at ${process.env.PERSONAL_EMAIL}.`
            };
        }
        if (!response.data.success) {
            throw new Error(`Your form has been flagged as fraudulous. Please email me directly at ${process.env.PERSONAL_EMAIL}.`);
        }
    } catch (e) {
        return {
            statusCode: 401,
            body: e.message
        };
    }
    let promises = [];
    // Send thank you email to sender
    promises.push(SimpleEmailService.sendTemplatedEmail({
        Destination: {
            ToAddresses: [
                body.email
            ]
        },
        Source: process.env.PORTFOLIO_EMAIL,
        Template: process.env.THANK_YOU_TEMPLATE,
        TemplateData: JSON.stringify(body),
        ReplyToAddresses: [
            process.env.PORTFOLIO_EMAIL
        ]
    }).promise());
    // Send notification email
    promises.push(SimpleEmailService.sendTemplatedEmail({
        Destination: {
            ToAddresses: [
                process.env.PERSONAL_EMAIL
            ]
        },
        Source: process.env.PORTFOLIO_EMAIL,
        Template: process.env.NOTIFICATION_TEMPLATE,
        TemplateData: JSON.stringify(body),
        ReplyToAddresses: [
            body.email
        ],
    }).promise());
    let values = await Promise.allSettled(promises);
    return values[1].status === 'rejected' ?
        console.error(values[1].reason) || {
            statusCode: 503,
            body: JSON.stringify(values[1].reason.message)
        } : {
            statusCode: 200,
            body: JSON.stringify({statusText: "OK"})
        };
};
