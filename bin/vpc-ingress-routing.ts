import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import assets = require('@aws-cdk/aws-s3-assets');

import { Role, ServicePrincipal, CfnInstanceProfile } from '@aws-cdk/aws-iam'
import { Fn, Tag, Resource } from '@aws-cdk/core';
import { AmazonLinuxImage, UserData } from '@aws-cdk/aws-ec2';

/**
 * Create my own Ec2 resource and Ec2 props as these are not yet defined in CDK
 * These classes abstract low level details from CloudFormation
 */
class Ec2InstanceProps {
    readonly image: ec2.IMachineImage;
    readonly instanceType: ec2.InstanceType;
    readonly subnet: ec2.ISubnet;
    readonly role?: Role;
    readonly name: String;
    readonly securityGroup: ec2.SecurityGroup
    readonly userData?: UserData;
}

class Ec2 extends Resource {
    constructor(scope: cdk.Construct, id: string, props?: Ec2InstanceProps) {
        super(scope, id);

        if (props) {

            // create the instance
            const instance = new ec2.CfnInstance(this, id, {
                imageId: props.image.getImage(this).imageId,
                instanceType: props.instanceType.toString(),
                networkInterfaces: [
                    {
                        deviceIndex: "0",
                        subnetId: props.subnet.subnetId,
                        groupSet: [props.securityGroup.securityGroupName]
                    }
                ]
            });
            if (props.role) {
                //create a profile to attch the role to the instance
                const profile = new CfnInstanceProfile(this, `${id}Profile`, {
                    roles: [props.role.roleName]
                });
                instance.iamInstanceProfile = profile.ref
            }
            if (props.userData) {
                instance.userData = Fn.base64(props.userData.render())
            }
            if (props.name) {
                // tag the instance
                Tag.add(instance, 'Name', `${props.name}`);
            }
        }
    }
}

export class VpcIngressRoutingStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        //
        // create HTML web site as S3 assets 
        //
        var path = require('path');
        const asset = new assets.Asset(this, 'SampleAsset', {
            path: path.join(__dirname, '../html')
        });

        // Create a VPC with two public subnets
        const vpc = new ec2.Vpc(this, 'NewsBlogVPC', {
            cidr: '10.0.0.0/16',
            maxAzs: 1,
            subnetConfiguration: [{
                subnetType: ec2.SubnetType.PUBLIC,
                name: 'appliance',
                cidrMask: 24
            },
            {
                subnetType: ec2.SubnetType.PUBLIC,
                name: 'application',
                cidrMask: 24
            }]
        });

        //
        // create a security group authorizing inbound traffic on pourt 80
        //
        const webSecurityGroup = new ec2.SecurityGroup(this, 'WebSecurityGroup', {
            vpc,
            description: 'Allow HTTP access to ec2 instances',
            allowAllOutbound: true   // Can be set to false
        });
        webSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow HTTP access from the world');

        // launch an 'appliance' EC2 instance in the first public subnet
        const appliance = new Ec2(this, 'NewsBlogAppliance', {
            image: new AmazonLinuxImage(),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
            subnet: vpc.publicSubnets[0],
            name: "appliance",
            securityGroup: webSecurityGroup
        });

        //
        // define the IAM role that will allow the EC2 instance to download web site from S3 
        //
        const role = new Role(this, 'NewsBlogRole', {
            assumedBy: new ServicePrincipal('ec2.amazonaws.com')
        });
        // allow instance to communicate with s3
        asset.grantRead(role);

        //
        // define a user data script to install & launch a web server
        //
        const userData = UserData.forLinux();
        userData.addCommands('yum install -y nginx', 'chkconfig nginx on', 'service nginx start');
        userData.addCommands(`aws s3 cp s3://${asset.s3BucketName}/${asset.s3ObjectKey} .`, 
                                `unzip *.zip`, 
                                `/bin/mv /usr/share/nginx/html/index.html /usr/share/nginx/html/index.html.orig`,
                                `/bin/cp -r -n index.html carousel.css /usr/share/nginx/html/`);
        
        //
        // launch an 'application' EC2 instance in the first public subnet
        // The instance will have ngninx and a static web site
        //
        const application = new Ec2(this, 'NewsBlogApplication', {
            image: new AmazonLinuxImage(),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
            subnet: vpc.publicSubnets[1],
            name: "application",
            securityGroup: webSecurityGroup,
            role: role,
            userData: userData
        });

    }
}


const app = new cdk.App();
new VpcIngressRoutingStack(app, 'VpcIngressRoutingStack', {
    env: { region: "us-west-2" }
});
