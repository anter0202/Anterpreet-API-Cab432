output "s3_bucket" { value = aws_s3_bucket.images.bucket }
output "cognito_user_pool_id" { value = aws_cognito_user_pool.userpool.id }
output "cognito_app_client_id" { value = aws_cognito_user_pool_client.app_client.id }
output "cloudwatch_log_group" { value = aws_cloudwatch_log_group.api_logs.name }
output "alb_dns_name" { value = aws_lb.api.dns_name }
output "acm_certificate_arn" { value = aws_acm_certificate.cert.arn }
