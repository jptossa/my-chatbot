# Copies the secrets from your local .env into your Vercel project (Production).
# Run it yourself in a terminal AFTER `npx vercel login` and `npx vercel link`:
#     powershell -File scripts/push-env-to-vercel.ps1
# The values are read from .env and sent to Vercel; they are never printed.
# Pass -BaseUrl https://your-project.vercel.app to also set APP_BASE_URL.
param([string]$BaseUrl = "")

$names = @("ANTHROPIC_API_KEY", "VOYAGE_API_KEY", "DATABASE_URL", "RESEND_API_KEY")
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
$values = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
}
if ($BaseUrl) { $values["APP_BASE_URL"] = $BaseUrl; $names += "APP_BASE_URL" }
foreach ($name in $names) {
  if (-not $values.ContainsKey($name) -or -not $values[$name]) { Write-Host "SKIPPED $name (not set in .env)"; continue }
  $values[$name] | npx vercel env add $name production --force
  Write-Host "Set $name"
}
