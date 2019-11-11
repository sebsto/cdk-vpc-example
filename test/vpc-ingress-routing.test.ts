import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import cdk = require('@aws-cdk/core');
import VpcIngressRouting = require('../lib/vpc-ingress-routing-stack');

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new VpcIngressRouting.VpcIngressRoutingStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});