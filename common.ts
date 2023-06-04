import { EC2Client, EC2ClientConfig } from '@aws-sdk/client-ec2';
import { createLogger, transports, format } from 'winston';
import * as moment from 'moment';
import { ECSClient, ECSClientConfig } from '@aws-sdk/client-ecs';

const dockerUserName = '<username>';

export const dockerImageName = `${dockerUserName}/almost:1gb`;

const logFormat = format.combine(
    format.timestamp({ format: () => moment().format('YYYY-MM-DD HH:mm:ss') }),
    format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

export const logger = createLogger({
    format: logFormat,
    level: 'info',
    transports: [new transports.Console()],
});

const ec2Config: EC2ClientConfig = {};

export const ec2Client = new EC2Client(ec2Config);

const ecsConfig: ECSClientConfig = {};

export const ecsClient = new ECSClient(ecsConfig);
