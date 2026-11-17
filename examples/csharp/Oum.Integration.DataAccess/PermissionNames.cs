namespace Oum.Integration.DataAccess;

/// <summary>
/// Permission names. They are plain strings on the wire, so every client
/// language defines its own constants.
/// </summary>
public static class PermissionNames
{
    public const string Admin = "oum.admin";
    public const string DataCreate = "data.create";
    public const string DataUpdate = "data.update";
    public const string DataDelete = "data.delete";

    public static readonly string[] Bootstrap = [Admin, DataCreate, DataUpdate, DataDelete];
}
