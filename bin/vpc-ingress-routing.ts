import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import assets = require('@aws-cdk/aws-s3-assets');

import { Role, ServicePrincipal, CfnInstanceProfile, ManagedPolicy } from '@aws-cdk/aws-iam'
import { Fn, Tag, Resource, CfnOutput } from '@aws-cdk/core';
import { AmazonLinuxImage, UserData } from '@aws-cdk/aws-ec2';

//
// CHANGE THIS to deploy in the Region you want
//
const REGION='us-west-2';


/*

To retrieve the application Public DNS Name of the application instance, 
run this command after deployment :

# filter version
aws --region us-west-2 ec2 describe-instances \
    --filters "Name=tag-key,Values=Name" "Name=tag-value,Values=application" \
    --query "Reservations[].Instances[].NetworkInterfaces[].Association.PublicDnsName" \
    --output text

# jmespath version
aws --region us-west-2 ec2 describe-instances \
    --query "Reservations[].Instances[] | [?Tags[?Key=='Name' && Value=='application']].NetworkInterfaces[].Association.PublicDnsName" \
    --output text

To retrieve the VPC ID, run this command after deployment:

aws --region us-west-2 cloudformation describe-stacks \
    --stack-name VpcIngressRoutingStack \
    --query "Stacks[].Outputs[?OutputKey=='VPCID'].OutputValue" \
    --output text    

To retrieve the ENI ID, runt his command after deployment:

aws --region us-west-2 ec2 describe-instances     \
    --query "Reservations[].Instances[] | [?Tags[?Key=='Name' && Value=='application']].NetworkInterfaces[].NetworkInterfaceId" \
    --output text

To retrieve the Internet Gateway ID :

aws --region us-west-2 ec2 describe-internet-gateways  \
    --query "InternetGateways[] | [?Attachments[?VpcId=='${VPC_ID}']].InternetGatewayId" \
    --output text

To retrieve the application subnet :

SUBNET_ID=$(aws --region us-west-2 ec2 describe-instances         \
                --query "Reservations[].Instances[] | [?Tags[?Key=='Name' && Value=='application']].NetworkInterfaces[].SubnetId" \
                --output text)

To retrieve the application's subnet routing table :

aws --region us-west-2 ec2 describe-route-tables       \
    --query "RouteTables[?VpcId=='${VPC_ID}'] | [?Associations[?SubnetId=='${SUBNET_ID}']].RouteTableId" \
    --output text

To SSH connect to the appliance :

APPLIANCE_ID=$(aws --region $AWS_REGION ec2 describe-instances \
                   --query "Reservations[].Instances[] | [?Tags[?Key=='Name' && Value=='appliance']].InstanceId \
                   --output text)
aws -- region $AWS_REGION ssm start-session --target $APPLIANCE_ID 

*/

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

//
// The stack for this demo
//
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
        // create a security group authorizing inbound traffic on port 80
        //
        const webSecurityGroup = new ec2.SecurityGroup(this, 'WebSecurityGroup', {
            vpc,
            description: 'Allow HTTP access to ec2 instances',
            allowAllOutbound: true   // Can be set to false
        });
        webSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow HTTP access from the world');

        //
        // create a security group authorizing inbound traffic on port 80
        //
        const sshSecurityGroup = new ec2.SecurityGroup(this, 'SSHSecurityGroup', {
            vpc,
            description: 'Allow SSH access to ec2 instances',
            allowAllOutbound: true   // Can be set to false
        });
        sshSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow SSH access from the world');

        //
        // define the IAM role that will allow the EC2 instance to communicate with SSM 
        //
        const ssmRole = new Role(this, 'NewsBlogSSMRole', {
            assumedBy: new ServicePrincipal('ec2.amazonaws.com')
        });
        ssmRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

        // launch an 'appliance' EC2 instance in the first public subnet
        const appliance = new Ec2(this, 'NewsBlogAppliance', {
            image: new AmazonLinuxImage(),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
            subnet: vpc.publicSubnets[0],
            name: 'appliance',
            role: ssmRole,
            securityGroup: sshSecurityGroup
        });

        //
        // define the IAM role that will allow the EC2 instance to download web site from S3 
        //
        const s3Role = new Role(this, 'NewsBlogS3Role', {
            assumedBy: new ServicePrincipal('ec2.amazonaws.com')
        });
        // allow instance to communicate with s3
        asset.grantRead(s3Role);

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
            name: 'application',
            securityGroup: webSecurityGroup,
            role: s3Role,
            userData: userData
        });

        new CfnOutput(this, 'VPC-ID', { value: vpc.vpcId });
    }
}


const app = new cdk.App();
new VpcIngressRoutingStack(app, 'VpcIngressRoutingStack', {
    env: { region: REGION }
});
