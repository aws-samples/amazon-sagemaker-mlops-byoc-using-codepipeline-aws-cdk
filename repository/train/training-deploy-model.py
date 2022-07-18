import boto3, os, time

account = os.environ["AWS_ACCOUNT_ID"]
region = os.environ["AWS_DEFAULT_REGION"]

# unique job name
job_name_prefix = 'scikit-bring-your-own-20211026'
build_version = '-v' + os.environ['CODEBUILD_BUILD_NUMBER']
job_name = job_name_prefix + build_version

# train info
container = '{}.dkr.ecr.{}.amazonaws.com/sagemaker-scikit_bring_your_own:latest'.format(account, region) 
role = 'arn:aws:iam::{}:role/SageMakerExecutionRole'.format(account)

bucket = 's3://' + 'sagemaker-datalake-' + region + '-' + account
input_data = bucket + '/iris/input/iris.csv'
# input_data = bucket + '/iris/input/'
output_location = bucket + '/iris/output'

train_instance_type = 'ml.c4.xlarge'
train_instance_count = 1
use_spot_instances = True


sagemaker = boto3.client('sagemaker')

def create_training_job(job_name, input_data, container, output_location):
    try:
        sagemaker.create_training_job(
            TrainingJobName=job_name,
            AlgorithmSpecification={
                'TrainingImage': container,
                'TrainingInputMode': 'File',
            },
            RoleArn=role,
            InputDataConfig=[
                {
                    'ChannelName': 'training',
                    'DataSource': {
                        'S3DataSource': {
                            'S3DataType': 'S3Prefix',
                            'S3Uri': input_data,
                            'S3DataDistributionType': 'FullyReplicated'
                        }
                    },
                    'ContentType': 'text/csv',
                    'CompressionType': 'None'
                }
            ],
            OutputDataConfig={
                'S3OutputPath': output_location
            },
            ResourceConfig={
                'InstanceType': train_instance_type,
                'InstanceCount': train_instance_count,
                'VolumeSizeInGB': 20
            },
            StoppingCondition={
                'MaxRuntimeInSeconds': 3600,
                'MaxWaitTimeInSeconds': 3600
            },
            EnableManagedSpotTraining=True
        )

        # max waiting
        RETRIES = 60
        for i in range (0, RETRIES):
            response = sagemaker.describe_training_job(TrainingJobName=job_name)
            status = response['TrainingJobStatus']
            if status == 'Completed':
                break

            if status == 'Failed' or status == 'Stopping' or status == 'Stopping':
                print('Training job status is Failed.')
                exit()
            time.sleep(10)
            print("Waiting for the training job status " + status + ", and checking the status after 10 seconds (max 600s)")

        return response['ModelArtifacts']['S3ModelArtifacts']
    except Exception as e:
        print(e)
        print('Unable to create training job.')
        raise(e)

def create_model(model_name, container, model_url):
    try:
        response = sagemaker.create_model(
            ModelName=model_name,
            ExecutionRoleArn=role,
            PrimaryContainer={
                'Image': container,
                'ModelDataUrl': model_url
            }
        )
        print(response)

    except Exception as e:
        print(e)
        print('Unable to create model.')
        raise(e)

model_url = create_training_job(job_name, input_data, container, output_location)
create_model(job_name, container, model_url)