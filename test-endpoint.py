import boto3, io, itertools, sys
import pandas as pd

endpointName = sys.argv[1]
# Make a dataframe
shape = pd.read_csv('./data//iris.csv', header=None)

# Take a random sample
a = [50*i for i in range(3)]
b = [40+i for i in range(10)]
indices = [i+j for i,j in itertools.product(a,b)]
test_data=shape.iloc[indices[:-1]]
test_X=test_data.iloc[:,1:]
test_y=test_data.iloc[:,0]

# Convert the dataframe to csv data
test_file = io.StringIO()
test_X.to_csv(test_file, header=None, index=None)

# Talk to SageMaker
client = boto3.Session().client('sagemaker-runtime')
response = client.invoke_endpoint(
    EndpointName=endpointName,
    Body=test_file.getvalue(),
    ContentType='text/csv',
    Accept='Accept'
)

print(response['Body'].read().decode('ascii'))