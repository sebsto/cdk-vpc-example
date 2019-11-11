#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { VpcIngressRoutingStack } from '../lib/vpc-ingress-routing-stack';

const app = new cdk.App();
new VpcIngressRoutingStack(app, 'VpcIngressRoutingStack');
