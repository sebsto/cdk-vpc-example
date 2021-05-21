This is the code supporting the AWS News Blog Post : "**VPC Ingress Routing – Simplifying Integration of Third-Party Appliances**"

The blog post is available at [https://aws.amazon.com/blogs/aws/new-vpc-ingress-routing-simplifying-integration-of-third-party-appliances/](https://aws.amazon.com/blogs/aws/new-vpc-ingress-routing-simplifying-integration-of-third-party-appliances/) 

This sample CDK script demonstrates :

- how to create a VPC 
- how to start EC2 instances with Role and UserData script
- how to attach a Ec2 instance to a VPC and a Security Groups

**This code uses CDK v1, to see an example with CDK v2, check this repo**



# Useful commands

 * `npm install`      to install the depencies
 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
