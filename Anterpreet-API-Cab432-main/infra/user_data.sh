#!/bin/bash
set -e
exec > /var/log/user-data.log 2>&1

apt-get update
apt-get install -y git curl build-essential

# Install Node (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Clone the repo and start the app (assumes package.json start script)
cd /opt
if [ -d app ]; then rm -rf app; fi
git clone --depth 1 ${github_repo:-"https://github.com/anter0202/Anterpreet-API-Cab432.git"} app
cd app
npm install --production || true

# Fetch configuration from SSM Parameter Store (assumes IAM role allows ssm:GetParameter)
AWS_REGION=${AWS_REGION:-us-east-1}
export AWS_REGION
if command -v aws >/dev/null 2>&1; then
	echo "Fetching config from SSM..."
	DYNAMODB_TABLE_IMAGES=$(aws ssm get-parameter --name /api/dynamodb/images_table --region $AWS_REGION --query Parameter.Value --output text 2>/dev/null || true)
	DYNAMODB_TABLE_JOBS=$(aws ssm get-parameter --name /api/dynamodb/jobs_table --region $AWS_REGION --query Parameter.Value --output text 2>/dev/null || true)
	S3_BUCKET=$(aws ssm get-parameter --name /api/s3/bucket --region $AWS_REGION --query Parameter.Value --output text 2>/dev/null || true)
fi
export DYNAMODB_TABLE_IMAGES DYNAMODB_TABLE_JOBS S3_BUCKET

# Start the app via simple forever loop
nohup node src/server.js >> /var/log/pixel_api.log 2>&1 &
