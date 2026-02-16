param(
    [string]$Profile = "default",
    [string]$Rpc = "127.0.0.1:4243",
    [string]$InterfaceName = "rmap_world",
    [string]$InterfaceHost = "rmap.world",
    [int]$Port = 4242
)

$ErrorActionPreference = "Stop"

function Invoke-Lxmf {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    $localBinary = Join-Path $PSScriptRoot "..\..\LXMF-rs\target\debug\lxmf.exe"
    if (Test-Path $localBinary) {
        & $localBinary @Args
        if ($LASTEXITCODE -ne 0) {
            throw "lxmf command failed with exit code $LASTEXITCODE"
        }
        return
    }

    $lxmfInPath = Get-Command lxmf -ErrorAction SilentlyContinue
    if ($null -ne $lxmfInPath) {
        & $lxmfInPath.Source @Args
        if ($LASTEXITCODE -ne 0) {
            throw "lxmf command failed with exit code $LASTEXITCODE"
        }
        return
    }

    $manifest = Join-Path $PSScriptRoot "..\..\LXMF-rs\Cargo.toml"
    if (Test-Path $manifest) {
        & cargo run -p lxmf --manifest-path $manifest --features cli --bin lxmf -- @Args
        if ($LASTEXITCODE -ne 0) {
            throw "cargo lxmf command failed with exit code $LASTEXITCODE"
        }
        return
    }

    throw "Could not find lxmf binary or LXMF-rs manifest. Expected sibling repo at ..\LXMF-rs."
}

Write-Host "Initializing profile '$Profile' with RPC '$Rpc'..."
Invoke-Lxmf -Args @("profile", "init", $Profile, "--managed", "--rpc", $Rpc)

Write-Host "Selecting profile '$Profile'..."
Invoke-Lxmf -Args @("profile", "select", $Profile)

Write-Host "Adding/updating TCP client interface '$InterfaceName' -> ${InterfaceHost}:$Port ..."
Invoke-Lxmf -Args @(
    "--profile", $Profile,
    "iface", "add", $InterfaceName,
    "--type", "tcp_client",
    "--host", $InterfaceHost,
    "--port", $Port.ToString(),
    "--enabled"
)

Write-Host "Current interface configuration:"
Invoke-Lxmf -Args @("--profile", $Profile, "iface", "list")

$configPath = Join-Path $env:APPDATA "lxmf\profiles\$Profile\reticulum.toml"
Write-Host "Done. Config file: $configPath"
