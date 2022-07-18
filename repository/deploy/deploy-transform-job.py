import boto3, sys, os

model_name = sys.argv[1]

account = os.environ["AWS_ACCOUNT_ID"]
region = os.environ["AWS_DEFAULT_REGION"]

# e.g. s3://sagemaker/input-data-prediction/
input_data = sys.argv[2]
output_data = 's3://' + 'sagemaker-datalake-' + region + '-' + account + '/transform-prediction/output'

build_number = os.environ['CODEBUILD_BUILD_NUMBER']
transform_job_name = 'scikit-bring-your-own-v' + build_number
transform_instance_type = 'ml.c4.xlarge'
transform_instance_count = 1

sagemaker = boto3.client('sagemaker')
account_id = boto3.client('sts').get_caller_identity()['Account']

resp = sagemaker.create_transform_job(
    TransformJobName=transform_job_name,
    ModelName=model_name,
    MaxConcurrentTransforms=2,
    MaxPayloadInMB=50,
    BatchStrategy="MultiRecord",
    TransformOutput={
        "S3OutputPath": output_data
    },
    TransformInput={
        "DataSource": {
            "S3DataSource": {
                "S3DataType": "S3Prefix",
                "S3Uri": input_data
            }
        },
        "ContentType": "text/csv",
        "SplitType": "Line"
    },
    TransformResources={
        "InstanceType": transform_instance_type,
        "InstanceCount": transform_instance_count
    },
    DataProcessing={
        'InputFilter': '$[1:]'
    }
)
    
print(resp)