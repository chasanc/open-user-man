output "alb_dns_name" {
  description = "Point your DNS record at this, then use that host name in oidc_issuer."
  value       = aws_lb.api.dns_name
}

output "db_address" {
  description = "Private database host, for applying the SQL packs."
  value       = aws_db_instance.db.address
}

output "secret_arn" {
  description = "Holds DATABASE_URL and the other secrets."
  value       = aws_secretsmanager_secret.api.arn
}
