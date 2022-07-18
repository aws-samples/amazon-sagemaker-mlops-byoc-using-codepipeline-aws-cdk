import cdk = require("aws-cdk-lib");
import codecommit = require("aws-cdk-lib/aws-codecommit");
import codebuild = require("aws-cdk-lib/aws-codebuild");
import codepipeline = require("aws-cdk-lib/aws-codepipeline");
import codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
import iam = require("aws-cdk-lib/aws-iam");
import ecr = require("aws-cdk-lib/aws-ecr");
import sns = require("aws-cdk-lib/aws-sns");
import sns_subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
import targets = require("aws-cdk-lib/aws-events-targets");

export interface BuildPipelineStackProps extends cdk.StackProps {
  readonly build_codecommit_repo: string;
  readonly build_codecommit_branch: string;
  readonly build_codebuild_project: string;
  readonly build_codepipeline_name: string;
  readonly build_notifications_email: string;
}

export class BuildPipelineStack extends cdk.Stack {
  readonly ecr: ecr.Repository

  constructor(scope: cdk.App, id: string, props: BuildPipelineStackProps) {
    super(scope, id, props);

    /** 
     * CodeCommit: create repository
    **/ 
    const codecommitRepository = new codecommit.Repository(this, "MlopsBuildSourceRepo", {
      repositoryName: props.build_codecommit_repo
    });


    /**
     * CodeBuild: 
     * 1. create codebuild project
     * 2. create policy of ECR and Codecommit
    **/ 
    const codebuildProject = new codebuild.PipelineProject(this, "MlopsBuildBuild", {
      projectName: props.build_codebuild_project,
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
    // codebuild policy of ecr build
    const codeBuildPolicyEcr = new iam.PolicyStatement();
    codeBuildPolicyEcr.addAllResources()
    codeBuildPolicyEcr.addActions(
      "ecr:GetAuthorizationToken",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:BatchCheckLayerAvailability",
      "ecr:PutImage",
      "ecr:CreateRepository",
      "ecr:DescribeRepositories",
      "ecr-public:*",
      "sts:GetServiceBearerToken"
    )
    codebuildProject.addToRolePolicy(codeBuildPolicyEcr);


    /**
     * CodePipeline: 
     * 1. create codebuild project
     * 2. create policy of ECR and Codecommit
    **/

    // trigger of `CodeCommitTrigger.POLL`
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: "MlopsBuildCodeCommit",
      branch: props.build_codecommit_branch,
      trigger: codepipeline_actions.CodeCommitTrigger.POLL,
      repository: codecommitRepository,
      output: sourceOutput
    });

    // when codecommit input then action of codebuild
    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "MlopsBuildBuild",
      input: sourceOutput,
      outputs: [
        buildOutput
      ],
      project: codebuildProject
    });

    // create pipeline, and then add both codecommit and codebuild  
    const pipeline = new codepipeline.Pipeline(this, "MlopsBuildPipeline", {
      pipelineName: props.build_codepipeline_name
    });
    pipeline.addStage({
      stageName: "GitSource",
      actions: [sourceAction]
    });
    pipeline.addStage({
      stageName: "Build",
      actions: [buildAction]
    });

    /**
     * SNS: Monitor pipeline state change then notifiy
    **/
    if ( props.build_notifications_email ) {
      const pipelineSnsTopic = new sns.Topic(this, 'MlopsBuildPipelineStageChange');
      pipelineSnsTopic.addSubscription(new sns_subscriptions.EmailSubscription(props.build_notifications_email))
      pipeline.onStateChange("MlopsBuildPipelineStateChange", {
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
    new cdk.CfnOutput(this, 'MlopsBuildCodeCommitCloneUrlHttp', {
      description: 'MLOps: Build CodeCommit Repo CloneUrl HTTP',
      value: codecommitRepository.repositoryCloneUrlHttp
    });

    new cdk.CfnOutput(this, 'MlopsBuildCodeCommitCloneUrlSsh', {
      description: 'MLOps: Build CodeCommit Repo CloneUrl SSH',
      value: codecommitRepository.repositoryCloneUrlSsh
    });

  }
}
