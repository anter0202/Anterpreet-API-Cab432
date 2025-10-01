This folder contains a minimal Terraform scaffold to deploy the API to AWS with the following components:

- EC2 Auto Scaling Group (runs the Node API via a simple cloud-init user-data script)
- IAM role / Instance profile for EC2 to access S3, DynamoDB, ElastiCache and CloudWatch
- S3 bucket for image storage
- Cognito User Pool and App Client for authentication
- Route53 record (requires an existing hosted zone)
- ElastiCache (Redis) replication group for caching
- CloudWatch Log Group and basic Alarms

Notes
- This is a starting point and uses variables for many values. Review and adapt to your security posture (VPC/subnets, security groups, IAM permissions).
- You must provide the following required Terraform variables: `domain_name`, `hosted_zone_id`, `github_repo`, and `github_branch` (or adjust the user-data script to pull from another source).
- The EC2 user-data will clone the repository, install Node, and start the app with `npm start`. Ensure your `package.json` has a production `start` script.

Quick start (high-level):

1. Install Terraform and AWS CLI and configure AWS credentials.
2. Edit `infra/variables.tf` or pass variables on the CLI.
3. Initialize and apply:
   terraform init
   terraform apply

After apply, the output will show the public DNS for the app.

Security and production notes
- Consider using SSM Parameter Store or Secrets Manager instead of embedding secrets in user-data.
- Lock down Security Groups (only allow ports you need), configure HTTPS (ALB with ACM) and enable auto-scaling policies based on CPU.
- Create proper IAM policies with least privilege for your EC2 instance role.
