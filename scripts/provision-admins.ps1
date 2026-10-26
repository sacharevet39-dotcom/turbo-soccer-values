$ErrorActionPreference = 'Stop'

function Read-TemporarySecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$url = Read-Host 'Supabase project URL'
if ($url -notmatch '^https://[a-z0-9-]+\.supabase\.co/?$') { throw 'Enter the URL of the existing Supabase project.' }

try {
  [Environment]::SetEnvironmentVariable('SUPABASE_URL', $url, 'Process')
  [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', (Read-TemporarySecret 'Supabase service_role key (input is hidden)'), 'Process')
  [Environment]::SetEnvironmentVariable('TURBO_OWNER_USER_ID', '99aa849a-29ee-44b5-8951-a2bfb4d590fa', 'Process')
  for ($number = 1; $number -le 10; $number++) {
    $envName = "TURBO_ADMIN${number}_INITIAL_PASSWORD"
    [Environment]::SetEnvironmentVariable($envName, (Read-TemporarySecret "Initial password for admin$number (input is hidden)"), 'Process')
  }
  node (Join-Path $PSScriptRoot 'provision-admins.mjs')
  if ($LASTEXITCODE -ne 0) { throw "Provisioning script failed with exit code $LASTEXITCODE." }
}
finally {
  [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', $null, 'Process')
  [Environment]::SetEnvironmentVariable('SUPABASE_URL', $null, 'Process')
  [Environment]::SetEnvironmentVariable('TURBO_OWNER_USER_ID', $null, 'Process')
  for ($number = 1; $number -le 10; $number++) {
    [Environment]::SetEnvironmentVariable("TURBO_ADMIN${number}_INITIAL_PASSWORD", $null, 'Process')
  }
}
