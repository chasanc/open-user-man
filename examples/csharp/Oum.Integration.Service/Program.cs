using Grpc.Net.Client;
using Microsoft.Extensions.Options;
using Oum.Integration.DataAccess;

var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<OumOptions>(builder.Configuration.GetSection("Oum"));
builder.Services.AddSingleton(sp =>
    GrpcChannel.ForAddress(sp.GetRequiredService<IOptions<OumOptions>>().Value.Target));
builder.Services.AddSingleton<IUserDirectory, GrpcUserDirectory>();

var app = builder.Build();

// `dotnet run -- --check` runs the same flow as the other samples, then exits.
if (args.Contains("--check"))
{
    return await Check(app.Services.GetRequiredService<IUserDirectory>());
}

// Sign in with an OUM user. Authenticating only proves the password; the permission check
// decides what the user may do.
app.MapPost("/login", async (LoginRequest body, IUserDirectory directory, CancellationToken ct) =>
{
    var user = await directory.AuthenticateAsync(body.Username, body.Password, ct);
    if (user is null) return Results.Unauthorized();
    var grants = await directory.GrantsOfUserAsync(user.Id, ct);
    return Results.Ok(new { user.Id, user.Username, Permissions = grants.Select(g => g.PermissionName).Distinct() });
});

app.Run();
return 0;

static async Task<int> Check(IUserDirectory directory)
{
    var username = Environment.GetEnvironmentVariable("OUM_USER") ?? "admin";
    var password = Environment.GetEnvironmentVariable("OUM_PASSWORD") ?? "changeme";
    try
    {
        var user = await directory.AuthenticateAsync(username, password);
        if (user is null) { Console.Error.WriteLine("FAIL authenticate: bad credentials"); return 1; }
        Console.WriteLine($"ok authenticate: {user.Username} (id {user.Id})");

        var allowed = await directory.CheckAsync(user.Id, PermissionNames.Admin);
        Console.WriteLine($"ok check: {PermissionNames.Admin} = {allowed.ToString().ToLowerInvariant()}");

        var grants = await directory.GrantsOfUserAsync(user.Id);
        Console.WriteLine($"ok grants: {grants.Count}");

        var users = await directory.ListUsersAsync(user.CompanyId);
        Console.WriteLine($"ok users: {users.Count}");

        var created = await directory.EnsurePermissionsAsync(user.CompanyId, PermissionNames.Bootstrap);
        Console.WriteLine($"ok bootstrap: created {created.Count} ({string.Join(", ", created)})");
        return 0;
    }
    catch (Grpc.Core.RpcException e)
    {
        Console.Error.WriteLine($"FAIL {e.StatusCode}: {e.Status.Detail}");
        return 1;
    }
}

public sealed record LoginRequest(string Username, string Password);
