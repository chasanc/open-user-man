using Grpc.Core;
using Grpc.Net.Client;
using Microsoft.Extensions.Options;
using Oum.V1;

namespace Oum.Integration.DataAccess;

public sealed class GrpcUserDirectory : IUserDirectory
{
    private readonly AuthService.AuthServiceClient _auth;
    private readonly AccessService.AccessServiceClient _access;
    private readonly UserService.UserServiceClient _users;
    private readonly PermissionService.PermissionServiceClient _permissions;
    private readonly Metadata _headers = new();

    public GrpcUserDirectory(GrpcChannel channel, IOptions<OumOptions> options)
    {
        _auth = new AuthService.AuthServiceClient(channel);
        _access = new AccessService.AccessServiceClient(channel);
        _users = new UserService.UserServiceClient(channel);
        _permissions = new PermissionService.PermissionServiceClient(channel);
        var o = options.Value;
        if (o.ApiKey != "") _headers.Add("x-api-key", o.ApiKey);
        if (o.CompanyKey != "") _headers.Add("company-key", o.CompanyKey);
    }

    private CallOptions Call(CancellationToken ct) => new(_headers, cancellationToken: ct);

    public async Task<User?> AuthenticateAsync(string username, string password, CancellationToken ct = default)
    {
        try
        {
            return await _auth.AuthenticateAsync(new AuthenticateRequest { Username = username, Password = password }, Call(ct));
        }
        catch (RpcException e) when (e.StatusCode == StatusCode.Unauthenticated)
        {
            return null;
        }
    }

    public async Task<bool> CheckAsync(string userId, string permission, string? scopeId = null, CancellationToken ct = default)
    {
        var request = new CheckRequest { UserId = userId, Permission = permission };
        if (scopeId != null) request.ScopeId = scopeId;
        return (await _access.CheckAsync(request, Call(ct))).Allowed;
    }

    public async Task<IReadOnlyList<Grant>> GrantsOfUserAsync(string userId, CancellationToken ct = default) =>
        (await _access.ListGrantsForUserAsync(new ListGrantsForUserRequest { UserId = userId }, Call(ct))).Grants;

    public async Task<IReadOnlyList<User>> ListUsersAsync(string companyId, CancellationToken ct = default) =>
        (await _users.ListUsersAsync(new ListUsersRequest { CompanyId = companyId, PageSize = 100 }, Call(ct))).Users;

    public async Task<IReadOnlyList<string>> EnsurePermissionsAsync(string companyId, IEnumerable<string> names, CancellationToken ct = default)
    {
        var created = new List<string>();
        foreach (var name in names)
        {
            var found = await _permissions.ListPermissionsAsync(
                new ListPermissionsRequest { CompanyId = companyId, Query = name, PageSize = 100 }, Call(ct));
            if (found.Permissions.Any(p => p.Name == name)) continue;

            await _permissions.CreatePermissionAsync(
                new CreatePermissionRequest { CompanyId = companyId, Name = name }, Call(ct));
            created.Add(name);
        }
        return created;
    }
}
