import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import { BuildPipelineStack } from '../lib/build-pipeline-stack';
import { TrainPipelineStack } from '../lib/train-pipeline-stack';
import { DeployPipelineStack } from '../lib/deploy-pipeline-stack';

test('Build stack created', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new BuildPipelineStack(app, 'BuildPipelineStack', {
      build_codecommit_repo: 'foo',
      build_codecommit_branch: 'master',
      build_codebuild_project: 'foo',
      build_codepipeline_name: 'foo',
      build_notifications_email: ''
    });
    // THEN
    expectCDK(stack).to(haveResource("AWS::CodeCommit::Repository"));
    expectCDK(stack).to(haveResource("AWS::CodeBuild::Project"));
    expectCDK(stack).to(haveResource("AWS::CodePipeline::Pipeline"));
});

test('Build stack created with SNS topic', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new BuildPipelineStack(app, 'BuildPipelineStack', {
    build_codecommit_repo: 'foo',
    build_codecommit_branch: 'master',
    build_codebuild_project: 'foo',
    build_codepipeline_name: 'foo',
    build_notifications_email: 'user@example.com'
  });
  // THEN
  expectCDK(stack).to(haveResource("AWS::CodeCommit::Repository"));
  expectCDK(stack).to(haveResource("AWS::CodeBuild::Project"));
  expectCDK(stack).to(haveResource("AWS::CodePipeline::Pipeline"));
  expectCDK(stack).to(haveResource("AWS::SNS::Topic"));
});
