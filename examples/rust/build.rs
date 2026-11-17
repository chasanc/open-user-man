// Generates the client from the shared proto. The vendored protoc means no system install is needed.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path()?);
    let proto = "../../packages/proto/open-user-management.proto";
    tonic_build::configure()
        .build_server(false)
        .compile_protos(&[proto], &["../../packages/proto"])?;
    println!("cargo:rerun-if-changed={proto}");
    Ok(())
}
