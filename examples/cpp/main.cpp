// oum gRPC client in C++. Runs the shared integration flow and exits non-zero on failure.
//   OUM_TARGET (127.0.0.1:5581), OUM_API_KEY, OUM_COMPANY_KEY,
//   OUM_USER (admin), OUM_PASSWORD (changeme)
#include <grpcpp/grpcpp.h>

#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

#include "open-user-management.grpc.pb.h"

using namespace oum::v1;

static std::string env(const char* name, const std::string& fallback) {
  const char* value = std::getenv(name);
  return value && *value ? value : fallback;
}

static int fail(const std::string& step, const grpc::Status& status) {
  std::cerr << "FAIL " << step << ": " << status.error_message() << "\n";
  return 1;
}

int main() {
  const std::vector<std::string> names = {"oum.admin", "data.create", "data.update", "data.delete"};

  auto channel = grpc::CreateChannel(env("OUM_TARGET", "127.0.0.1:5581"), grpc::InsecureChannelCredentials());
  auto auth = AuthService::NewStub(channel);
  auto access = AccessService::NewStub(channel);
  auto users = UserService::NewStub(channel);
  auto permissions = PermissionService::NewStub(channel);

  // Every call carries the same metadata; build a fresh context per call.
  auto context = [] {
    auto ctx = std::make_unique<grpc::ClientContext>();
    if (!env("OUM_API_KEY", "").empty()) ctx->AddMetadata("x-api-key", env("OUM_API_KEY", ""));
    if (!env("OUM_COMPANY_KEY", "").empty()) ctx->AddMetadata("company-key", env("OUM_COMPANY_KEY", ""));
    return ctx;
  };

  // 1. Authenticate: wrong credentials come back as UNAUTHENTICATED.
  AuthenticateRequest login;
  login.set_username(env("OUM_USER", "admin"));
  login.set_password(env("OUM_PASSWORD", "changeme"));
  User user;
  auto status = auth->Authenticate(context().get(), login, &user);
  if (!status.ok()) return fail("authenticate", status);
  std::cout << "ok authenticate: " << user.username() << " (id " << user.id() << ")\n";

  // 2. May this user do something? Authentication alone grants nothing.
  CheckRequest check;
  check.set_user_id(user.id());
  check.set_permission(names[0]);
  CheckResponse checked;
  status = access->Check(context().get(), check, &checked);
  if (!status.ok()) return fail("check", status);
  std::cout << "ok check: " << names[0] << " = " << (checked.allowed() ? "true" : "false") << "\n";

  // 3. Everything the user holds, directly and through groups.
  ListGrantsForUserRequest held;
  held.set_user_id(user.id());
  ListGrantsResponse grants;
  status = access->ListGrantsForUser(context().get(), held, &grants);
  if (!status.ok()) return fail("grants", status);
  std::cout << "ok grants: " << grants.grants_size() << "\n";

  // 4. List users.
  ListUsersRequest all;
  all.set_company_id(user.company_id());
  all.set_page_size(100);
  ListUsersResponse listed;
  status = users->ListUsers(context().get(), all, &listed);
  if (!status.ok()) return fail("users", status);
  std::cout << "ok users: " << listed.users_size() << "\n";

  // 5. Make sure the permissions exist.
  std::vector<std::string> created;
  for (const auto& name : names) {
    ListPermissionsRequest find;
    find.set_company_id(user.company_id());
    find.set_query(name);
    find.set_page_size(100);
    ListPermissionsResponse found;
    status = permissions->ListPermissions(context().get(), find, &found);
    if (!status.ok()) return fail("bootstrap " + name, status);
    bool exists = false;
    for (const auto& p : found.permissions()) exists = exists || p.name() == name;
    if (exists) continue;

    CreatePermissionRequest add;
    add.set_company_id(user.company_id());
    add.set_name(name);
    Permission added;
    status = permissions->CreatePermission(context().get(), add, &added);
    if (!status.ok()) return fail("bootstrap " + name, status);
    created.push_back(name);
  }
  std::cout << "ok bootstrap: created " << created.size() << " (";
  for (size_t i = 0; i < created.size(); ++i) std::cout << (i ? ", " : "") << created[i];
  std::cout << ")\n";
  return 0;
}
