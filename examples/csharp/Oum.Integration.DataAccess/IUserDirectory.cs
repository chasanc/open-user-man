using Oum.V1;

namespace Oum.Integration.DataAccess;

/// <summary>What an integrating app needs from Open User Man.</summary>
public interface IUserDirectory
{
    /// <summary>Authenticate. Returns null when the password is wrong or the user is inactive.</summary>
    Task<User?> AuthenticateAsync(string username, string password, CancellationToken ct = default);

    /// <summary>May this user have this permission? Without a scope only company-wide grants count.</summary>
    Task<bool> CheckAsync(string userId, string permission, string? scopeId = null, CancellationToken ct = default);

    /// <summary>Every grant the user holds, directly and through groups.</summary>
    Task<IReadOnlyList<Grant>> GrantsOfUserAsync(string userId, CancellationToken ct = default);

    Task<IReadOnlyList<User>> ListUsersAsync(string companyId, CancellationToken ct = default);

    /// <summary>Creates any of the given permissions that do not exist yet; returns the names it created.</summary>
    Task<IReadOnlyList<string>> EnsurePermissionsAsync(string companyId, IEnumerable<string> names, CancellationToken ct = default);
}
