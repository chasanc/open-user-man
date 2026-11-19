variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "name" {
  description = "Prefix for every resource."
  type        = string
  default     = "oum"
}

variable "vpc_id" {
  description = "An existing VPC. This example does not create one."
  type        = string
}

variable "public_subnet_ids" {
  description = "At least two subnets in different zones, for the load balancer."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "At least two subnets in different zones, for the API tasks and the database. They need a route to ECR and Secrets Manager (a NAT gateway or VPC endpoints)."
  type        = list(string)
}

variable "certificate_arn" {
  description = "ACM certificate for the public host name, in the same region."
  type        = string
}

variable "api_image" {
  description = "The API image, built from deploy/compose/Dockerfile.api and pushed to your registry."
  type        = string
}

variable "cors_origin" {
  description = "Where the admin web app is served from."
  type        = string
}

variable "multi_company_mode" {
  type    = bool
  default = false
}

variable "oidc_issuer" {
  description = "Public HTTPS URL ending in /oidc, for example https://oum.example.com/oidc. Empty keeps single sign-on off."
  type        = string
  default     = ""
}

variable "oidc_signing_key_json" {
  description = "The JSON printed by scripts/generate-oidc-key.mjs. Required when oidc_issuer is set."
  type        = string
  default     = ""
  sensitive   = true
}

variable "desired_count" {
  description = "API tasks. The per-address rate limits are counted in each task, so they are not shared."
  type        = number
  default     = 1
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
