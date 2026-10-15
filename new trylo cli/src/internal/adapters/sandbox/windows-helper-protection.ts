import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { windowsHelperEnvironment } from "./windows-helper-environment.js";

export type CacheTarget = {
  readonly kind: "directory" | "executable";
  readonly path: string;
  readonly state: "new" | "existing";
};

// The directory is private and protected. Files inherit its temporary SRT read
// grants, but no untrusted principal may write, delete or change their DACL.
const PROTECT_CACHE = String.raw`
$ErrorActionPreference = 'Stop'
$path = $env:TRYLO_NATIVE_TARGET
$kind = $env:TRYLO_NATIVE_KIND
$state = $env:TRYLO_NATIVE_STATE
if ((Get-Item -LiteralPath $path -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
  throw 'native cache target is redirected'
}
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$writers = @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')
if ($state -eq 'new') {
  $acl = if ($kind -eq 'directory') {
    New-Object System.Security.AccessControl.DirectorySecurity
  } else {
    New-Object System.Security.AccessControl.FileSecurity
  }
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($identity in $writers) {
    $principal = [System.Security.Principal.SecurityIdentifier]::new($identity)
    $rule = if ($kind -eq 'directory') {
      New-Object System.Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    } else {
      New-Object System.Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'Allow')
    }
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $path -AclObject $acl
}
$acl = Get-Acl -LiteralPath $path
$owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
if ($owner -notin $writers) { throw 'native cache has an untrusted owner' }
# Write data, append, write EA/attributes, delete child/object, WRITE_DAC/OWNER.
$writeMask = 0x000d0156
foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $writers -and (([int]$rule.FileSystemRights -band $writeMask) -ne 0)) {
    throw 'native cache is writable by another identity'
  }
}
if ($kind -eq 'executable') {
  if ($acl.AreAccessRulesProtected) {
    $acl.SetAccessRuleProtection($false, $true)
    Set-Acl -LiteralPath $path -AclObject $acl
  }
  & ($env:SystemRoot + '\System32\icacls.exe') $path /setintegritylevel M | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'private helper integrity label could not be set' }
}
`;

export function protectWindowsCacheTarget(target: CacheTarget, env: Readonly<Record<string, string | undefined>>): void {
  const systemRoot = env["SystemRoot"] ?? env["SYSTEMROOT"];
  if (systemRoot === undefined) throw new Error("isolation_helper_invalid: SystemRoot is missing");
  execFileSync(join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", PROTECT_CACHE], {
    env: { ...windowsHelperEnvironment(env), TRYLO_NATIVE_TARGET: target.path, TRYLO_NATIVE_KIND: target.kind, TRYLO_NATIVE_STATE: target.state },
    windowsHide: true, encoding: "utf8", timeout: 30000,
  });
}
