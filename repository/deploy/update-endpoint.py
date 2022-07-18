import boto3, sys, os

live_model_name = sys.argv[1]
new_model_name = sys.argv[2]

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
            'VariantName': 'live-scikit-bring-your-own',
            'ModelName': live_model_name,
            'InitialInstanceCount': 1,
            'InstanceType': 'ml.t2.medium'
        },
        {
            'VariantName': 'new-scikit-bring-your-own',
            'ModelName': new_model_name,
            'InitialInstanceCount': 1,
            'InstanceType': 'ml.t2.medium'         
        }
    ])
    
print(resp['EndpointConfigArn'])

resp = sagemaker.update_endpoint(
    EndpointName=endpoint_name,
    EndpointConfigName=endpoint_config_name
)

print(resp['EndpointArn'])