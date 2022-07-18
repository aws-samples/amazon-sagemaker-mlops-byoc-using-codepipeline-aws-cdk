import boto3, sys, os

model_name = sys.argv[1]

build_number = os.environ['CODEBUILD_BUILD_NUMBER']
endpoint_config_name_prefix = 'scikit-bring-your-own-v'
endpoint_config_name = endpoint_config_name_prefix + build_number
endpoint_name = 'scikit-bring-your-own'

sagemaker = boto3.client('sagemaker')
account_id = boto3.client('sts').get_caller_identity()['Account']

resp = sagemaker.create_endpoint_config(
    EndpointConfigName=endpoint_config_name,
    ProductionVariants=[
        {
            'VariantName': 'default-scikit-bring-your-own',
            'ModelName': model_name,
            'InitialInstanceCount': 1,
            'InstanceType': 'ml.t2.medium'
        }
    ])
    
print(resp['EndpointConfigArn'])

resp = sagemaker.create_endpoint(
    EndpointName=endpoint_name,
    EndpointConfigName=endpoint_config_name
)

print(resp['EndpointArn'])