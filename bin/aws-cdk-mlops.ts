#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BuildPipelineStack } from '../lib/build-pipeline-stack';
import { TrainPipelineStack } from '../lib/train-pipeline-stack';
import { DeployPipelineStack } from '../lib/deploy-pipeline-stack';

const app = new cdk.App();

const env = { region: app.node.tryGetContext('region') || process.env.CDK_INTEG_REGION || process.env.CDK_DEFAULT_REGION };

const buildPipelineStack = new BuildPipelineStack(app, 'BuildPipelineStack', {
    env: env,
    build_codecommit_repo: app.node.tryGetContext('build_codecommit_repo'),
    build_codecommit_branch: app.node.tryGetContext('build_codecommit_branch'),
    build_codebuild_project: app.node.tryGetContext('build_codebuild_project'),
    build_codepipeline_name: app.node.tryGetContext('build_codepipeline_name'),
    build_notifications_email: app.node.tryGetContext('build_notifications_email')
});

const trainPipelineStack = new TrainPipelineStack(app, 'TrainPipelineStack', {
    env: env,
    ecr_repo: app.node.tryGetContext('ecr_repo'),
    train_codecommit_repo: app.node.tryGetContext('train_codecommit_repo'),
    train_codecommit_branch: app.node.tryGetContext('train_codecommit_branch'),
    train_codebuild_project: app.node.tryGetContext('train_codebuild_project'),
    train_codepipeline_name: app.node.tryGetContext('train_codepipeline_name'),
    train_notifications_email: app.node.tryGetContext('train_notifications_email'),
});

const deployPipelineStack = new DeployPipelineStack(app, 'DeployPipelineStack', {
    env: env,
    deploy_codecommit_repo: app.node.tryGetContext('deploy_codecommit_repo'),
    deploy_codecommit_branch: app.node.tryGetContext('deploy_codecommit_branch'),
    deploy_codebuild_project: app.node.tryGetContext('deploy_codebuild_project'),
    deploy_codepipeline_name: app.node.tryGetContext('deploy_codepipeline_name'),
    deploy_notifications_email: app.node.tryGetContext('deploy_notifications_email'),
    deploy_approval_email: app.node.tryGetContext('deploy_approval_email')
});

app.synth();
