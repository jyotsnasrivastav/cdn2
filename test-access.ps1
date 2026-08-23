# Access control tests: SIGNUP_MODE=closed and SIGNUP_MODE=invite
$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\0\AccioWork\2026-08-23-00-53-41\vidy-clone'
$dataDir = "$dir\data"
$env:PORT = '3000'

function Clear-Data { if (Test-Path $dataDir) { Get-ChildItem $dataDir -Force | Remove-Item -Force -Recurse } }
function Post-Json($url, $jsonPath, $jar) {
  curl.exe -s -b $jar -c $jar -X POST $url -H 'Content-Type: application/json' -d ('@' + $jsonPath)
}
function New-Json($name, $content) {
  $p = Join-Path $env:TEMP ($name + '-' + $PID + '.json')
  Set-Content -Encoding UTF8 -Path $p -Value $content
  return $p
}

# ============ SCENARIO 1: CLOSED ============
Clear-Data
$env:SIGNUP_MODE = 'closed'
$env:SIGNUP_CODE = ''
$p = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $dir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
if ($p.HasExited) { Write-Output ('SERVER CRASHED exit=' + $p.ExitCode); exit 1 }
try {
  Write-Output '===== SCENARIO 1: SIGNUP_MODE=closed ====='
  $jar1 = Join-Path $env:TEMP ("ac-jar1-{0}.txt" -f $PID)
  $r1 = Post-Json 'http://127.0.0.1:3000/api/register' (New-Json 'ac1' '{"username":"boss","password":"secret123"}') $jar1
  Write-Output ('1. first register (should be OK): ' + $r1)
  $r2 = Post-Json 'http://127.0.0.1:3000/api/register' (New-Json 'ac2' '{"username":"intruder","password":"secret123"}') (Join-Path $env:TEMP ("ac-jar2-{0}.txt" -f $PID))
  Write-Output ('2. second register (should be 403): ' + $r2)
  $me = curl.exe -s -b $jar1 'http://127.0.0.1:3000/api/me'
  Write-Output ('3. admin /api/me: ' + $me)
  $mk = Post-Json 'http://127.0.0.1:3000/api/admin/users' (New-Json 'ac3' '{"username":"team1","password":"secret123"}') $jar1
  Write-Output ('4. admin creates member (should be OK): ' + $mk)
  $jar3 = Join-Path $env:TEMP ("ac-jar3-{0}.txt" -f $PID)
  curl.exe -s -c $jar3 -X POST 'http://127.0.0.1:3000/api/login' -H 'Content-Type: application/json' -d ('@' + (New-Json 'ac4' '{"username":"team1","password":"secret123"}')) | Out-Null
  $me3 = curl.exe -s -b $jar3 'http://127.0.0.1:3000/api/me'
  Write-Output ('5. member /api/me: ' + $me3)
  $mk2 = Post-Json 'http://127.0.0.1:3000/api/admin/users' (New-Json 'ac5' '{"username":"hacker","password":"secret123"}') $jar3
  Write-Output ('6. member tries admin API (should be 403): ' + $mk2)
  $cfg = curl.exe -s 'http://127.0.0.1:3000/api/config'
  Write-Output ('7. /api/config: ' + $cfg)
}
finally { Stop-Process -Id $p.Id -ErrorAction SilentlyContinue }

# ============ SCENARIO 2: INVITE ============
Clear-Data
Remove-Item Env:SIGNUP_MODE -ErrorAction SilentlyContinue
$env:SIGNUP_MODE = 'invite'
$env:SIGNUP_CODE = 'TEAM123'
$p2 = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $dir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
if ($p2.HasExited) { Write-Output ('SERVER CRASHED exit=' + $p2.ExitCode); exit 1 }
try {
  Write-Output ''
  Write-Output '===== SCENARIO 2: SIGNUP_MODE=invite (code TEAM123) ====='
  $jA = Join-Path $env:TEMP ("ac-jarA-{0}.txt" -f $PID)
  $ra = Post-Json 'http://127.0.0.1:3000/api/register' (New-Json 'ac6' '{"username":"boss2","password":"secret123"}') $jA
  Write-Output ('1. first register (admin, OK): ' + $ra)
  $rb = Post-Json 'http://127.0.0.1:3000/api/register' (New-Json 'ac7' '{"username":"noint","password":"secret123"}') (Join-Path $env:TEMP ("ac-jarB-{0}.txt" -f $PID))
  Write-Output ('2. register without code (should be 403): ' + $rb)
  $rc = Post-Json 'http://127.0.0.1:3000/api/register' (New-Json 'ac8' '{"username":"wrongc","password":"secret123","invite":"WRONG"}') (Join-Path $env:TEMP ("ac-jarC-{0}.txt" -f $PID))
  Write-Output ('3. register wrong code (should be 403): ' + $rc)
  $rd = Post-Json 'http://127.0.0.1:3000/api/register' (New-Json 'ac9' '{"username":"vip","password":"secret123","invite":"TEAM123"}') (Join-Path $env:TEMP ("ac-jarD-{0}.txt" -f $PID))
  Write-Output ('4. register with TEAM123 (should be OK): ' + $rd)
}
finally { Stop-Process -Id $p2.Id -ErrorAction SilentlyContinue }

Remove-Item Env:SIGNUP_MODE, Env:SIGNUP_CODE, Env:PORT -ErrorAction SilentlyContinue
Clear-Data
Write-Output ''
Write-Output 'ACCESS CONTROL TESTS DONE'
