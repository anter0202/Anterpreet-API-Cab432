variable "aws_region" { type = string default = "us-east-1" }
variable "s3_bucket_name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "cache_subnet_group" { type = string }
variable "hosted_zone_id" { type = string }
variable "domain_name" { type = string }
variable "ami_id" { type = string }
variable "instance_type" { type = string default = "t3.small" }
variable "asg_min" { type = number default = 1 }
variable "asg_max" { type = number default = 2 }
variable "admin_cidr" { type = string default = "0.0.0.0/0" }
variable "cache_node_type" { type = string default = "cache.t3.micro" }
variable "dynamodb_images_table" { type = string default = "images" }
variable "dynamodb_jobs_table" { type = string default = "jobs" }
