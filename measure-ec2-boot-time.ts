import {
    DescribeInstancesCommandInput,
    EC2Client,
    RunInstancesCommand,
    RunInstancesCommandInput,
    StartInstancesCommand,
    StartInstancesCommandInput,
    StopInstancesCommand,
    StopInstancesCommandInput,
    TerminateInstancesCommand,
    TerminateInstancesCommandInput,
    waitUntilInstanceRunning,
    waitUntilInstanceStopped,
} from '@aws-sdk/client-ec2';
import { logger, ec2Client } from './common';
import { WaiterConfiguration } from '@aws-sdk/types';
import { setTimeout } from 'timers/promises';

interface MeasureBootTimeResult {
    bootTime: number;
    fromStoppedToRunningTime: number;
    fromHibernatedToRunningTime: number;
}

const measureBootTime = async (
    instanceType:
        | 't2.micro'
        | 't2.medium'
        | 't2.large'
        | 't2.xlarge'
        | 't2.2xlarge'
): Promise<MeasureBootTimeResult> => {
    const runInstancesInput: RunInstancesCommandInput = {
        ImageId: 'ami-0e05f79e46019bfac', // Amazon Linux 2023 AMI
        InstanceType: instanceType,
        MinCount: 1,
        MaxCount: 1,
        TagSpecifications: [
            {
                ResourceType: 'instance',
                Tags: [
                    {
                        Key: 'Name',
                        Value: 'BootTimeMeasure',
                    },
                ],
            },
        ],
        HibernationOptions: { Configured: true },
        BlockDeviceMappings: [
            {
                DeviceName: '/dev/xvda',
                Ebs: {
                    DeleteOnTermination: true,
                    VolumeSize: 35,
                    VolumeType: 'gp3',
                    Encrypted: true,
                },
            },
        ],
    };

    const runInstancesCommand = new RunInstancesCommand(runInstancesInput);
    const createTime = new Date().getTime();
    const runInstancesResponse = await ec2Client.send(runInstancesCommand);
    logger.info('Instance Created');

    const instanceId = runInstancesResponse.Instances!.at(0)!.InstanceId;

    const waitConfig: WaiterConfiguration<EC2Client> = {
        client: ec2Client,
        maxWaitTime: 600,
        maxDelay: 1,
        minDelay: 1,
    };
    const waitInput: DescribeInstancesCommandInput = {
        InstanceIds: [instanceId],
    };

    await waitUntilInstanceRunning(waitConfig, waitInput);
    const runningTime = new Date().getTime();
    logger.info('Instance running, waiting 10 seconds before stopping');
    await setTimeout(1000 * 10);

    const stopCommandInput: StopInstancesCommandInput = {
        InstanceIds: [instanceId],
    };

    const stopInstancesCommand = new StopInstancesCommand(stopCommandInput);
    await ec2Client.send(stopInstancesCommand);

    await waitUntilInstanceStopped(waitConfig, waitInput);
    const stoppedTime = new Date().getTime();
    logger.info('Instance Stopped');

    const startCommandInput: StartInstancesCommandInput = {
        InstanceIds: [instanceId],
    };

    const startInstancesCommand = new StartInstancesCommand(startCommandInput);
    await ec2Client.send(startInstancesCommand);

    await waitUntilInstanceRunning(waitConfig, waitInput);
    const runningFromStoppedTime = new Date().getTime();
    logger.info(
        'Instance running from stopped, waiting 10 seconds before hibernating'
    );
    await setTimeout(1000 * 10);

    const hibernateCommandInput: StopInstancesCommandInput = {
        InstanceIds: [instanceId],
        Hibernate: true,
    };

    const hibernateInstancesCommand = new StopInstancesCommand(
        hibernateCommandInput
    );
    await ec2Client.send(hibernateInstancesCommand);
    await waitUntilInstanceStopped(waitConfig, waitInput);
    const hibernatedTime = new Date().getTime();
    logger.info('Instance Hibernated');

    await ec2Client.send(startInstancesCommand);

    await waitUntilInstanceRunning(waitConfig, waitInput);
    const runningFromHibernatedTime = new Date().getTime();
    logger.info(
        'Instance Running from Hibernated, waiting 10 seconds before terminating'
    );
    await setTimeout(1000 * 10);
    const terminateCommandInput: TerminateInstancesCommandInput = {
        InstanceIds: [instanceId],
    };

    const terminateInstancesCommand = new TerminateInstancesCommand(
        terminateCommandInput
    );
    await ec2Client.send(terminateInstancesCommand);
    logger.info('Instance Terminated');

    return {
        bootTime: runningTime - createTime,
        fromStoppedToRunningTime: runningFromStoppedTime - stoppedTime,
        fromHibernatedToRunningTime: runningFromHibernatedTime - hibernatedTime,
    };
};

if (require.main == module) {
    logger.info('Measuring ec2 boot time');
    const n = 3;
    const instanceType = 't2.2xlarge';
    Promise.all(
        Array.from({ length: n }, () => measureBootTime(instanceType))
    ).then((values: MeasureBootTimeResult[]) => {
        const bootTimes = [];
        const fromStoppedToRunningTimes = [];
        const fromHibernatedToRunningTimes = [];

        values.forEach((value) => {
            bootTimes.push(value.bootTime);
            fromStoppedToRunningTimes.push(value.fromStoppedToRunningTime);
            fromHibernatedToRunningTimes.push(
                value.fromHibernatedToRunningTime
            );
        });

        logger.info(`Measured ${n} times for ${instanceType}`);
        logger.info(
            `boot time\n${bootTimes}\naverage: ${
                bootTimes.reduce((a, b) => a + b, 0) / n
            }`
        );
        logger.info(
            `fromStoppedToRunningTime time\n${fromStoppedToRunningTimes}\naverage: ${
                fromStoppedToRunningTimes.reduce((a, b) => a + b, 0) / n
            }`
        );
        logger.info(
            `fromHibernatedToRunningTime time\n${fromHibernatedToRunningTimes}\naverage: ${
                fromHibernatedToRunningTimes.reduce((a, b) => a + b, 0) / n
            }`
        );
    });
}
