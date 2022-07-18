import cdk = require("aws-cdk-lib");
import codecommit = require("aws-cdk-lib/aws-codecommit");
import codebuild = require("aws-cdk-lib/aws-codebuild");
import codepipeline = require("aws-cdk-lib/aws-codepipeline");
import codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
import iam = require("aws-cdk-lib/aws-iam");
import s3 = require('aws-cdk-lib/aws-s3');
import ecr = require("aws-cdk-lib/aws-ecr");
import sns = require("aws-cdk-lib/aws-sns");
import sns_subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
import targets = require("aws-cdk-lib/aws-events-targets");

export interface TrainPipelineStackProps extends cdk.StackProps {
  // readonly ecr: ecr.Repository;
  readonly ecr_repo: string;
  readonly train_codecommit_repo: string;
  readonly train_codecommit_branch: string;
  readonly train_codebuild_project: string;
  readonly train_codepipeline_name: string;
  readonly train_notifications_email: string;
}

export class TrainPipelineStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: TrainPipelineStackProps) {
    super(scope, id, props);

    /** 
     * ECR: create repository
    **/
    const ecrRepository = new ecr.Repository(this, "MlopsDevOpsImageRepo", {
      repositoryName: props.ecr_repo
    });

    // create execution role for model
    const sagemakerExecutionRole = new iam.Role(this, 'SagemakerExecutionRole', {
      roleName: 'SageMakerExecutionRole',
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com')
    });
    sagemakerExecutionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryFullAccess'));
    sagemakerExecutionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
    sagemakerExecutionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'));


    const dataLakeBucket = new s3.Bucket(this, 'DataLakeStarter', {
      bucketName: 'sagemaker-datalake-' + this.region + '-' + this.account,
      versioned: true
    });

    /** 
     * CodeCommit: create repository
    **/ 
    const codecommitRepository = new codecommit.Repository(this, "MlopsTrainSourceRepo", {
      repositoryName: props.train_codecommit_repo
    });


    /**
     * CodeBuild: 
     * 1. create codebuild project
    **/ 
    const codebuildProject = new codebuild.PipelineProject(this, "MlopsTrainBuild", {
      projectName: props.train_codebuild_project,
      environment: {
        computeType: codebuild.ComputeType.SMALL,
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
        privileged: true,
        environmentVariables: {
          AWS_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Aws.ACCOUNT_ID
          },
          AWS_DEFAULT_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Aws.REGION
          }
        }
      }
    });
    // codebuild policy of codecommit ,sagemaker and s3.
    const codeBuildPolicyOfcodeCommit = new iam.PolicyStatement();
    codeBuildPolicyOfcodeCommit.addResources(codecommitRepository.repositoryArn)
    codeBuildPolicyOfcodeCommit.addActions(
      "codecommit:ListBranches",
      "codecommit:ListRepositories",
      "codecommit:BatchGetRepositories",
      "codecommit:GitPull"
    );
    codebuildProject.addToRolePolicy(
      codeBuildPolicyOfcodeCommit,
    );

    const codeBuildPolicyOfBucket = new iam.PolicyStatement();
    codeBuildPolicyOfBucket.addResources(dataLakeBucket.bucketArn)
    codeBuildPolicyOfBucket.addActions(
      "s3:*"
    );
    codebuildProject.addToRolePolicy(
      codeBuildPolicyOfBucket,
    );

    // codebuild policy of SageMaker training jobs.
    const codeBuildPolicyOfSageMakerTrain = new iam.PolicyStatement();
    codeBuildPolicyOfSageMakerTrain.addResources('*')
    codeBuildPolicyOfSageMakerTrain.addActions(
      "sagemaker:CreateTrainingJob",
      "sagemaker:CreateModel",
      "sagemaker:DescribeTrainingJob",
      "iam:PassRole"
    );
    codebuildProject.addToRolePolicy(
      codeBuildPolicyOfSageMakerTrain,
    );

    /**
     * CodePipeline: 
     * 1. create codebuild project
    **/

    // trigger of `CodeCommitTrigger.POLL`
    const gitSourceOutput = new codepipeline.Artifact();
    const gitSourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: "TrainOfCodeCommit",
      branch: props.train_codecommit_branch,
      trigger: codepipeline_actions.CodeCommitTrigger.POLL,
      repository: codecommitRepository,
      output: gitSourceOutput
    });

    // trigger of S3 data change
    const bucketSourceOutput = new codepipeline.Artifact();
    const bucketSourceAction = new codepipeline_actions.S3SourceAction({
      actionName: "TrainOfData",
      bucket: dataLakeBucket,
      bucketKey: 'iris/input/iris.csv',
      output: bucketSourceOutput
    });

    // trigger of ecr
    const ecrSourceOutput = new codepipeline.Artifact();
    const ecrSourceAction = new codepipeline_actions.EcrSourceAction({
      actionName: "TrainOfImage",
      repository: ecrRepository,
      imageTag: 'latest',
      output: ecrSourceOutput,
    });

    // when codecommit and s3 data input then action of codebuild
    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "TrainBuild",
      input: gitSourceOutput,
      outputs: [
        buildOutput
      ],
      project: codebuildProject
    });

    // create pipeline, and then add both codecommit and codebuild  
    const pipeline = new codepipeline.Pipeline(this, "MlopsTrainPipeline", {
      pipelineName: props.train_codepipeline_name
    });
    pipeline.addStage({
      stageName: "Source",
      actions: [gitSourceAction, bucketSourceAction, ecrSourceAction]
    });
    pipeline.addStage({
      stageName: "Build",
      actions: [buildAction]
    });

    /**
     * SNS: Monitor pipeline state change then notifiy
    **/
    if ( props.train_notifications_email ) {
      const pipelineSnsTopic = new sns.Topic(this, 'MlopsTrainPipelineStageChange');
      pipelineSnsTopic.addSubscription(new sns_subscriptions.EmailSubscription(props.train_notifications_email))
      pipeline.onStateChange("MlopsTrainPipelineStateChange", {
        target: new targets.SnsTopic(pipelineSnsTopic), 
        description: 'Listen for codepipeline change events',
        eventPattern: {
          detail: {
            state: [ 'FAILED', 'SUCCEEDED', 'STOPPED' ]
          }
        }
      });
    }

    /**
     * Output: 
     * - CodeCommit clone path of HTTP and SSH
     * - ECR Repository URI
    **/
    new cdk.CfnOutput(this, 'MlopsTrainCodeCommitCloneUrlHttp', {
      description: 'MLOps: Train CodeCommit Repo CloneUrl HTTP',
      value: codecommitRepository.repositoryCloneUrlHttp
    });

    new cdk.CfnOutput(this, 'MlopsTrainCodeCommitCloneUrlSsh', {
      description: 'MLOps: Train CodeCommit Repo CloneUrl SSH',
      value: codecommitRepository.repositoryCloneUrlSsh
    });

  }
}
