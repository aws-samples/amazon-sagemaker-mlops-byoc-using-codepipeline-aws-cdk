import cdk = require("aws-cdk-lib");
import codecommit = require("aws-cdk-lib/aws-codecommit");
import codebuild = require("aws-cdk-lib/aws-codebuild");
import codepipeline = require("aws-cdk-lib/aws-codepipeline");
import codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
import iam = require("aws-cdk-lib/aws-iam");
import sns = require("aws-cdk-lib/aws-sns");
import sns_subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
import targets = require("aws-cdk-lib/aws-events-targets");

export interface DeployPipelineStackProps extends cdk.StackProps {
  readonly deploy_codecommit_repo: string;
  readonly deploy_codecommit_branch: string;
  readonly deploy_codebuild_project: string;
  readonly deploy_codepipeline_name: string;
  readonly deploy_notifications_email: string;
  readonly deploy_approval_email: string;
}

export class DeployPipelineStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: DeployPipelineStackProps) {
    super(scope, id, props);

    /** 
     * CodeCommit: create repository
    **/ 
    const codecommitRepository = new codecommit.Repository(this, "MlopsDeploySourceRepo", {
      repositoryName: props.deploy_codecommit_repo
    });


    /**
     * CodeBuild: 
     * 1. create codebuild project
    **/ 
    const codebuildProject = new codebuild.PipelineProject(this, "MlopsDeployBuild", {
      projectName: props.deploy_codebuild_project,
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
    // codebuild policy of codecommit pull source code.
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

    // codebuild policy of SageMaker deploy.
    const codeBuildPolicyOfSageMakerTrain = new iam.PolicyStatement();
    codeBuildPolicyOfSageMakerTrain.addResources('*')
    codeBuildPolicyOfSageMakerTrain.addActions(
      "sagemaker:CreateTransformJob",
      "sagemaker:CreateEndpointConfig",
      "sagemaker:CreateEndpoint",
      "sagemaker:UpdateEndpoint",
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
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: "DeployOfCodeCommit",
      branch: props.deploy_codecommit_branch,
      trigger: codepipeline_actions.CodeCommitTrigger.POLL,
      repository: codecommitRepository,
      output: sourceOutput
    });

    // Manual approval action
    const manualApprovalAction = new codepipeline_actions.ManualApprovalAction({
      actionName: 'DeployApproval',
      notifyEmails: [
        props.deploy_approval_email
      ],
    });

    // when codecommit input then action of codebuild
    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "DeployBuild",
      input: sourceOutput,
      outputs: [
        buildOutput
      ],
      project: codebuildProject
    });

    // create pipeline, and then add both codecommit and codebuild  
    const pipeline = new codepipeline.Pipeline(this, "MlopsDeployPipeline", {
      pipelineName: props.deploy_codepipeline_name
    });
    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction]
    });
    pipeline.addStage({
      stageName: "Approve",
      actions: [manualApprovalAction]
    });
    pipeline.addStage({
      stageName: "Build",
      actions: [buildAction]
    });

    /**
     * SNS: Monitor pipeline state change then notifiy
    **/
    if ( props.deploy_notifications_email ) {
      const pipelineSnsTopic = new sns.Topic(this, 'MlopsDeployPipelineStageChange');
      pipelineSnsTopic.addSubscription(new sns_subscriptions.EmailSubscription(props.deploy_notifications_email))
      pipeline.onStateChange("MlopsDeployPipelineStateChange", {
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
    new cdk.CfnOutput(this, 'MlopsDeployCodeCommitCloneUrlHttp', {
      description: 'MLOps: Deploy CodeCommit Repo CloneUrl HTTP',
      value: codecommitRepository.repositoryCloneUrlHttp
    });

    new cdk.CfnOutput(this, 'MlopsDeployCodeCommitCloneUrlSsh', {
      description: 'MLOps: Deploy CodeCommit Repo CloneUrl SSH',
      value: codecommitRepository.repositoryCloneUrlSsh
    });

  }
}
