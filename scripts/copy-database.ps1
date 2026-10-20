# Copy MiliPay's data from one Supabase database into another.
# See scripts/copy-database.mjs for what is copied and why it is safe.
#
#   .\scripts\copy-database.ps1           rehearsal: copies, reports, undoes
#   .\scripts\copy-database.ps1 -Commit   keeps the copy
#
# It asks for both connection strings without showing them on screen. Get
# each from the Supabase dashboard: the project > Connect (top bar) >
# "Session pooler" URI, with the database password in place of [YOUR-PASSWORD].
# They are only held in this window for the run, never saved.
param([switch]$Commit)

function Read-Secret([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host "FROM (the original project, the source):" -ForegroundColor Cyan
$env:SOURCE_DB_URL = Read-Secret "Paste the source connection string"
Write-Host "TO (the database receiving the copy):" -ForegroundColor Cyan
$env:TARGET_DB_URL = Read-Secret "Paste the target connection string"

try {
  if ($Commit) { node "$PSScriptRoot\copy-database.mjs" --commit } else { node "$PSScriptRoot\copy-database.mjs" }
} finally {
  Remove-Item Env:SOURCE_DB_URL, Env:TARGET_DB_URL -ErrorAction SilentlyContinue
}
