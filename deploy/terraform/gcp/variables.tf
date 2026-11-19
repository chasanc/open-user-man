variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" {
  description = "Prefix for every resource."
  type        = string
  default     = "oum"
}

variable "network" {
  description = "Name of an existing VPC network. This example does not create one."
  type        = string
  default     = "default"
}

variable "subnetwork" {
  description = "Name of an existing subnet in the region, for the API's outbound traffic to the database."
  type        = string
  default     = "default"
}

variable "api_image" {
  description = "The API image, built from deploy/compose/Dockerfile.api and pushed to Artifact Registry."
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

variable "min_instances" {
  description = "0 lets the service scale to zero. The per-address rate limits are counted in each instance, so they are not shared."
  type        = number
  default     = 0
}

variable "max_instances" {
  type    = number
  default = 3
}

variable "db_tier" {
  type    = string
  default = "db-f1-micro"
}
