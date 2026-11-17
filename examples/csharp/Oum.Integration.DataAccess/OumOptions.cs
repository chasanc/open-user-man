namespace Oum.Integration.DataAccess;

/// <summary>Connection settings, bound from the "Oum" section of appsettings.json.</summary>
public sealed class OumOptions
{
    /// <summary>gRPC address. Use https:// when the server runs with GRPC_TLS=true.</summary>
    public string Target { get; set; } = "http://127.0.0.1:5581";

    /// <summary>Sent as x-api-key. Leave empty when the server has no GRPC_API_KEY.</summary>
    public string ApiKey { get; set; } = "";

    /// <summary>Sent as company-key; needed when the server runs in multi-company mode.</summary>
    public string CompanyKey { get; set; } = "";
}
