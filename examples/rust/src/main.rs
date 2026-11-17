//! oum gRPC client in Rust. Runs the shared integration flow and exits non-zero on failure.
//! Settings: OUM_TARGET (http://127.0.0.1:5581), OUM_API_KEY, OUM_COMPANY_KEY,
//! OUM_USER (admin), OUM_PASSWORD (changeme).
use std::env;

use tonic::metadata::MetadataValue;
use tonic::transport::Channel;
use tonic::Request;

pub mod oum {
    tonic::include_proto!("oum.v1");
}
use oum::access_service_client::AccessServiceClient;
use oum::auth_service_client::AuthServiceClient;
use oum::permission_service_client::PermissionServiceClient;
use oum::user_service_client::UserServiceClient;
use oum::{
    AuthenticateRequest, CheckRequest, CreatePermissionRequest, ListGrantsForUserRequest,
    ListPermissionsRequest, ListUsersRequest,
};

const NAMES: [&str; 4] = ["oum.admin", "data.create", "data.update", "data.delete"];

fn setting(name: &str, fallback: &str) -> String {
    env::var(name).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| fallback.to_string())
}

/// Every call carries the same metadata.
fn call<T>(message: T) -> Request<T> {
    let mut request = Request::new(message);
    let meta = request.metadata_mut();
    for (header, value) in [
        ("x-api-key", setting("OUM_API_KEY", "")),
        ("company-key", setting("OUM_COMPANY_KEY", "")),
    ] {
        if !value.is_empty() {
            meta.insert(header, MetadataValue::try_from(value.as_str()).expect("ascii header"));
        }
    }
    request
}

fn step(name: &'static str) -> impl Fn(tonic::Status) -> String {
    move |e| format!("{name}: {}", e.message())
}

async fn run() -> Result<(), String> {
    let channel = Channel::from_shared(setting("OUM_TARGET", "http://127.0.0.1:5581"))
        .map_err(|e| e.to_string())?
        .connect()
        .await
        .map_err(|e| format!("connect: {e}"))?;
    let mut auth = AuthServiceClient::new(channel.clone());
    let mut access = AccessServiceClient::new(channel.clone());
    let mut users = UserServiceClient::new(channel.clone());
    let mut permissions = PermissionServiceClient::new(channel);

    // 1. Authenticate: wrong credentials come back as UNAUTHENTICATED.
    let user = auth
        .authenticate(call(AuthenticateRequest {
            username: Some(setting("OUM_USER", "admin")),
            password: setting("OUM_PASSWORD", "changeme"),
            ..Default::default()
        }))
        .await
        .map_err(step("authenticate"))?
        .into_inner();
    println!("ok authenticate: {} (id {})", user.username, user.id);

    // 2. May this user do something? Authentication alone grants nothing.
    let check = access
        .check(call(CheckRequest {
            user_id: Some(user.id.clone()),
            permission: NAMES[0].to_string(),
            ..Default::default()
        }))
        .await
        .map_err(step("check"))?
        .into_inner();
    println!("ok check: {} = {}", NAMES[0], check.allowed);

    // 3. Everything the user holds, directly and through groups.
    let grants = access
        .list_grants_for_user(call(ListGrantsForUserRequest { user_id: Some(user.id.clone()), ..Default::default() }))
        .await
        .map_err(step("grants"))?
        .into_inner();
    println!("ok grants: {}", grants.grants.len());

    // 4. List users.
    let list = users
        .list_users(call(ListUsersRequest { company_id: Some(user.company_id.clone()), page_size: 100, ..Default::default() }))
        .await
        .map_err(step("users"))?
        .into_inner();
    println!("ok users: {}", list.users.len());

    // 5. Make sure the permissions exist.
    let mut created: Vec<&str> = Vec::new();
    for name in NAMES {
        let found = permissions
            .list_permissions(call(ListPermissionsRequest {
                company_id: Some(user.company_id.clone()),
                query: Some(name.to_string()),
                page_size: 100,
                ..Default::default()
            }))
            .await
            .map_err(step("bootstrap"))?
            .into_inner();
        if found.permissions.iter().any(|p| p.name == name) {
            continue;
        }
        permissions
            .create_permission(call(CreatePermissionRequest {
                company_id: user.company_id.clone(),
                name: name.to_string(),
                ..Default::default()
            }))
            .await
            .map_err(step("bootstrap"))?;
        created.push(name);
    }
    println!("ok bootstrap: created {} ({})", created.len(), created.join(", "));
    Ok(())
}

#[tokio::main]
async fn main() {
    if let Err(message) = run().await {
        eprintln!("FAIL {message}");
        std::process::exit(1);
    }
}
