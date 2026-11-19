terraform {
  required_version = ">= 1.5"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  sso = var.oidc_issuer != ""

  secrets = merge(
    {
      DATABASE_URL        = "postgresql://oum:${random_password.db.result}@${google_sql_database_instance.db.private_ip_address}:5432/open_user_db"
      JWT_SECRET          = random_password.jwt.result
      TOTP_ENCRYPTION_KEY = random_password.totp.result
    },
    local.sso ? {
      OIDC_COOKIE_KEYS      = random_password.cookie.result
      OIDC_SIGNING_KEY_JSON = var.oidc_signing_key_json
    } : {}
  )

  env = merge(
    {
      HTTP_HOST                    = "0.0.0.0"
      HTTP_PORT                    = "3001"
      GRPC_PORT                    = "5581"
      GRPC_TLS                     = "false"
      GRPC_TLS_REQUIRE_CLIENT_CERT = "false"
      DATABASE_KIND                = "postgres"
      JWT_EXPIRES_IN               = "1d"
      COOKIE_SECURE                = "true"
      RATE_LIMIT_ENABLED           = "true"
      RATE_LIMIT_MAX               = "100"
      RATE_LIMIT_WINDOW_SECONDS    = "60"
      LOG_LEVEL                    = "info"
      CORS_ORIGIN                  = var.cors_origin
      MULTI_COMPANY_MODE           = tostring(var.multi_company_mode)
      TRUST_PROXY                  = "1" # one hop: Google's front end
    },
    local.sso ? { OIDC_ISSUER = var.oidc_issuer } : {}
  )
}

check "signing_key_present" {
  assert {
    condition     = !local.sso || var.oidc_signing_key_json != ""
    error_message = "oidc_signing_key_json is required when oidc_issuer is set."
  }
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# ---- Secrets -------------------------------------------------------------
# Generated here so they never sit in a file. They do end up in the Terraform
# state, so keep the state in an encrypted bucket you control.

resource "random_password" "db" {
  length  = 32
  special = false # keeps the value safe inside DATABASE_URL
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "totp" {
  length  = 48 # TOTP_ENCRYPTION_KEY needs 32 or more
  special = false
}

resource "random_password" "cookie" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "api" {
  for_each  = nonsensitive(toset(keys(local.secrets)))
  secret_id = "${var.name}-${lower(replace(each.key, "_", "-"))}"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "api" {
  for_each    = google_secret_manager_secret.api
  secret      = each.value.id
  secret_data = local.secrets[each.key]
}

resource "google_service_account" "api" {
  account_id   = "${var.name}-api"
  display_name = "oum API"
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each  = google_secret_manager_secret.api
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

# ---- Database ------------------------------------------------------------

data "google_compute_network" "this" {
  name = var.network
}

resource "google_compute_global_address" "db_range" {
  name          = "${var.name}-db-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = data.google_compute_network.this.id
}

resource "google_service_networking_connection" "db" {
  network                 = data.google_compute_network.this.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.db_range.name]

  depends_on = [google_project_service.apis]
}

resource "google_sql_database_instance" "db" {
  name                = "${var.name}-db"
  database_version    = "POSTGRES_16"
  deletion_protection = true

  settings {
    tier = var.db_tier

    backup_configuration {
      enabled = true
    }

    ip_configuration {
      ipv4_enabled    = false # private address only
      private_network = data.google_compute_network.this.id
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }
  }

  depends_on = [google_service_networking_connection.db]
}

resource "google_sql_database" "db" {
  name     = "open_user_db"
  instance = google_sql_database_instance.db.name
}

resource "google_sql_user" "oum" {
  name     = "oum"
  instance = google_sql_database_instance.db.name
  password = random_password.db.result
}

# ---- API -----------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name                = "${var.name}-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = var.network
        subnetwork = var.subnetwork
      }
    }

    containers {
      image = var.api_image

      ports {
        container_port = 3001
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi" # Argon2 uses about 64 MiB per hash
        }
      }

      dynamic "env" {
        for_each = local.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = google_secret_manager_secret.api
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/health"
          port = 3001
        }
        period_seconds    = 5
        failure_threshold = 12
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_version.api,
    google_secret_manager_secret_iam_member.api,
    google_sql_database.db,
    google_sql_user.oum,
  ]
}

# The sign-in and token endpoints must be reachable by browsers and apps;
# oum does its own authentication.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
