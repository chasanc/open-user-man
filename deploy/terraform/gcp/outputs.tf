output "service_url" {
  description = "The run.app address. Map your own domain to the service, then use it in oidc_issuer."
  value       = google_cloud_run_v2_service.api.uri
}

output "db_private_ip" {
  description = "Private database address, for applying the SQL packs from inside the VPC."
  value       = google_sql_database_instance.db.private_ip_address
}
