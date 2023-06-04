import { WaiterConfiguration } from '@aws-sdk/types';
import { logger, ecsClient, dockerImageName, ec2Client } from './common';
import {
    CreateClusterCommand,
    CreateClusterCommandInput,
    DeleteClusterCommand,
    DeleteClusterCommandInput,
    DeleteTaskDefinitionsCommand,
    DeleteTaskDefinitionsCommandInput,
    DescribeClustersCommand,
    DescribeClustersCommandInput,
    DescribeTaskDefinitionCommand,
    DescribeTaskDefinitionCommandInput,
    DescribeTasksCommandInput,
    ECSClient,
    RegisterTaskDefinitionCommand,
    RegisterTaskDefinitionCommandInput,
    RunTaskCommand,
    RunTaskCommandInput,
    StopTaskCommand,
    StopTaskCommandInput,
    waitUntilTasksRunning,
} from '@aws-sdk/client-ecs';
import {
    DescribeSubnetsCommand,
    DescribeSubnetsCommandInput,
    DescribeVpcsCommand,
    DescribeVpcsCommandInput,
} from '@aws-sdk/client-ec2';

const describeDefaultVpcSubnetId = async () => {
    const describeVpcsInput: DescribeVpcsCommandInput = {
        Filters: [
            {
                Name: 'is-default',
                Values: ['true'],
            },
        ],
    };

    const describeVpcsCommand = new DescribeVpcsCommand(describeVpcsInput);
    const describeVpcsResponse = await ec2Client.send(describeVpcsCommand);
    const vpcId = describeVpcsResponse.Vpcs!.at(0)!.VpcId!;

    const describeSubnetsInput: DescribeSubnetsCommandInput = {
        Filters: [
            {
                Name: 'vpc-id',
                Values: [vpcId],
            },
        ],
    };

    const describeSubnetsCommand = new DescribeSubnetsCommand(
        describeSubnetsInput
    );

    const describeSubnetsResponse = await ec2Client.send(
        describeSubnetsCommand
    );

    return describeSubnetsResponse.Subnets!.at(0)!.SubnetId!;
};

// const createSubnet = async () => {
//     const defaultVpcId = await describeVpcId();
//     try {
//         const describeSubnetInput: DescribeSubnetsCommandInput = {
//             Filters: [
//                 {
//                     Name: 'tag:Name',
//                     Values: ['BootTimeMeasure'],
//                 },
//             ],
//         };

//         const describeSubnetCommand = new DescribeSubnetsCommand(
//             describeSubnetInput
//         );

//         const describeSubnetResponse = await ec2Client.send(
//             describeSubnetCommand
//         );

//         const subnetId = describeSubnetResponse.Subnets!.at(0)!.SubnetId!;
//         logger.info('Subnet already exists');
//         return subnetId;
//     } catch (e) {
//         logger.debug(e);

//         const createSubnetInput: CreateSubnetCommandInput = {
//             VpcId: defaultVpcId,
//             CidrBlock: '255.255.255.254/32',
//             TagSpecifications: [
//                 {
//                     ResourceType: 'subnet',
//                     Tags: [
//                         {
//                             Key: 'Name',
//                             Value: 'BootTimeMeasure',
//                         },
//                     ],
//                 },
//             ],
//         };

//         const createSubnetCommand = new CreateSubnetCommand(createSubnetInput);
//         const createSubnetResponse = await ec2Client.send(createSubnetCommand);
//         return createSubnetResponse.Subnet!.SubnetId!;
//     }
// };

const describeOrCreateCluster = async () => {
    try {
        const describeClusterInput: DescribeClustersCommandInput = {
            clusters: ['BootTimeMeasure'],
        };

        const describeClusterCommand = new DescribeClustersCommand(
            describeClusterInput
        );
        const describeClusterResponse = await ecsClient.send(
            describeClusterCommand
        );
        logger.info('Cluster already exists');
        return describeClusterResponse.clusters!.at(0)!.clusterArn;
    } catch (e) {
        logger.debug(e);
        const createClusterInput: CreateClusterCommandInput = {
            clusterName: 'BootTimeMeasure',
            tags: [
                {
                    key: 'Name',
                    value: 'BootTimeMeasure',
                },
            ],
        };

        const createClusterCommand = new CreateClusterCommand(
            createClusterInput
        );

        const createClusterResponse = await ecsClient.send(
            createClusterCommand
        );
        logger.info('Cluster Created');
        return createClusterResponse.cluster!.clusterArn;
    }
};

const deleteCluster = async (clusterArn: string) => {
    const deleteClusterInput: DeleteClusterCommandInput = {
        cluster: clusterArn,
    };

    const deleteClusterCommand = new DeleteClusterCommand(deleteClusterInput);

    await ecsClient.send(deleteClusterCommand);
    logger.info('Cluster Deleted');
};

const describeOrRegisterTaskDefinition = async () => {
    try {
        // choose between BootTimeMeasure and BootTimeMeasureLargeCPU
        // BootTimeMeasureLargeCPU is a task definition that uses a lot of CPU and Memory (1cpu, 3gb memory)
        // triggering capacity provider to scale up
        const describeTaskDefinitionInput: DescribeTaskDefinitionCommandInput =
            {
                // taskDefinition: 'BootTimeMeasure',
                taskDefinition: 'BootTimeMeasureLargeCPU',
            };

        const describeTaskDefinitionCommand = new DescribeTaskDefinitionCommand(
            describeTaskDefinitionInput
        );
        const describeTaskDefinitionResponse = await ecsClient.send(
            describeTaskDefinitionCommand
        );
        logger.info('Task Definition already exists');
        return describeTaskDefinitionResponse.taskDefinition!.taskDefinitionArn;
    } catch (e) {
        logger.debug(e);
        const registerTaskDefinitionInput: RegisterTaskDefinitionCommandInput =
            {
                family: 'BootTimeMeasure',
                requiresCompatibilities: ['FARGATE', 'EC2'],
                containerDefinitions: [
                    {
                        name: 'BootTimeMeasure',
                        image: dockerImageName,
                    },
                ],
                networkMode: 'awsvpc',
                cpu: '256',
                memory: '512',
            };

        const registerTaskDefinitionCommand = new RegisterTaskDefinitionCommand(
            registerTaskDefinitionInput
        );

        const registerTaskDefinitionResponse = await ecsClient.send(
            registerTaskDefinitionCommand
        );
        const taskDefinitionArn =
            registerTaskDefinitionResponse.taskDefinition!.taskDefinitionArn;
        logger.info('Task Definition Registered');

        return taskDefinitionArn;
    }
};

const deleteTaskDefinition = async (taskDefinitionArn: string) => {
    const deleteTaskDefinitionInput: DeleteTaskDefinitionsCommandInput = {
        taskDefinitions: [taskDefinitionArn],
    };

    const deregisterTaskDefinitionCommand = new DeleteTaskDefinitionsCommand(
        deleteTaskDefinitionInput
    );
    await ecsClient.send(deregisterTaskDefinitionCommand);
    logger.info('Task Definition Deleted');
};

const measureTaskRunningTime = async (
    launchType: 'FARGATE' | 'EC2',
    useCapacityProvider: boolean
): Promise<number> => {
    // create subnet id or put existing subnet id into container definition
    // const subnetId = await describeDefaultVpcSubnetId();
    const clusterArn = await describeOrCreateCluster();
    const taskDefinitionArn = await describeOrRegisterTaskDefinition();

    const runTaskInput: RunTaskCommandInput = {
        launchType: useCapacityProvider ? undefined : launchType,
        taskDefinition: taskDefinitionArn,
        cluster: clusterArn,
        networkConfiguration: {
            awsvpcConfiguration: {
                // subnets: [subnetId],
                subnets: ['<put existing subnet id>'],
                assignPublicIp:
                    launchType === 'FARGATE' ? 'ENABLED' : 'DISABLED',
            },
        },
        tags: [
            {
                key: 'Name',
                value: 'BootTimeMeasure',
            },
        ],
        capacityProviderStrategy: useCapacityProvider
            ? [
                  {
                      capacityProvider: 'BootTimeMeasure',
                  },
              ]
            : undefined,
    };

    const runTaskCommand = new RunTaskCommand(runTaskInput);

    const runTaskResponse = await ecsClient.send(runTaskCommand);

    const taskArn = runTaskResponse.tasks!.at(0)!.taskArn!;
    logger.info(`${launchType} Task Created`);
    const createdTime = new Date().getTime();

    const waitConfig: WaiterConfiguration<ECSClient> = {
        client: ecsClient,
        maxWaitTime: 600,
        minDelay: 1,
        maxDelay: 1,
    };

    const waitInput: DescribeTasksCommandInput = {
        cluster: clusterArn,
        tasks: [taskArn],
    };

    await waitUntilTasksRunning(waitConfig, waitInput);
    logger.info(`${launchType} Task Running`);
    const runningTime = new Date().getTime();

    const stopTaskInput: StopTaskCommandInput = {
        cluster: clusterArn,
        task: taskArn,
    };

    const stopTaskCommand = new StopTaskCommand(stopTaskInput);

    await ecsClient.send(stopTaskCommand);
    logger.info(`${launchType} Task Stopped`);

    // await deleteTaskDefinition(taskDefinitionArn);
    // await deleteCluster(clusterArn);

    return runningTime - createdTime;
};

const sequentialExecute = async (
    n: number,
    launchType: 'EC2' | 'FARGATE',
    useCapacityProvider: boolean
) => {
    const runningTimes = [];

    for (let i = 0; i < n; i++) {
        const runningTime = await measureTaskRunningTime(
            launchType,
            useCapacityProvider
        );
        logger.info(`${launchType} running time: ${runningTime} ms`);
        runningTimes.push(runningTime);

        if (useCapacityProvider) {
            logger.info(`Waiting 15 minutes for scale in`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * 60 * 15));
        }
    }

    return runningTimes;
};

if (require.main == module) {
    const launchType = 'EC2';
    const n = 1;
    // capacity provider used when intended to scale out
    const useCapacityProvider = true;

    logger.info(`Measuring ${launchType} running time`);

    sequentialExecute(n, launchType, useCapacityProvider).then(
        (runningTimes) => {
            logger.info(`Running ${n} times\n${runningTimes}`);
            logger.info(
                `Average ${launchType} running time: ${
                    runningTimes.reduce((a, b) => a + b) / n
                } ms`
            );
        }
    );
}
