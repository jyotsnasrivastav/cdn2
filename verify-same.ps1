# Side-by-side verification: real cdn2.vidy.my/IuBTOT.mp4 vs ShortTrack
# Fully idempotent — unique username + code per run, safe to run repeatedly.
$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\0\AccioWork\2026-08-23-00-53-41\vidy-clone'
$suffix = Get-Random -Maximum 999999
$uname = 'v' + $suffix
$code = 'T' + (Get-Random -Maximum 99999).ToString().PadLeft(5, '0') # 6 chars like IuBTOT

Write-Output '========== [A] REAL LINK: cdn2.vidy.my/IuBTOT.mp4 (live) =========='
curl.exe -s -i --max-time 25 'https://cdn2.vidy.my/IuBTOT.mp4' | Select-Object -First 13
Write-Output ''

Write-Output '========== [B] ShortTrack: same request flow =========='
$env:PORT = '3000'
$p = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $dir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
if ($p.HasExited) { Write-Output ('SERVER CRASHED exit=' + $p.ExitCode); exit 1 }
try {
  $jar = Join-Path $env:TEMP ("st-vjar-{0}.txt" -f $PID)
  $reg = Join-Path $env:TEMP ("st-vreg-{0}.json" -f $PID)
  $create = Join-Path $env:TEMP ("st-vcreate-{0}.json" -f $PID)
  Set-Content -Encoding UTF8 -Path $reg -Value ('{"username":"' + $uname + '","password":"secret123"}')
  Set-Content -Encoding UTF8 -Path $create -Value ('{"url":"https://example.com/video.mp4","code":"' + $code + '"}')

  curl.exe -s -c $jar -X POST 'http://127.0.0.1:3000/api/register' -H 'Content-Type: application/json' -d ('@' + $reg) | Out-Null
  Write-Output ('-- create link with code ' + $code + ' --')
  curl.exe -s -b $jar -X POST 'http://127.0.0.1:3000/api/links' -H 'Content-Type: application/json' -d ('@' + $create)
  Write-Output ('`n-- GET /' + $code + '.mp4 full response --')
  curl.exe -s -i ('http://127.0.0.1:3000/' + $code + '.mp4')
  Write-Output ''
  Write-Output ('-- GET /' + $code + ' (no .mp4) --')
  curl.exe -s -o NUL -w 'status=%{http_code} location=%{redirect_url}`n' ('http://127.0.0.1:3000/' + $code)
  Write-Output '-- wait-page link (useWait=true) --'
  $wcode = 'W' + (Get-Random -Maximum 99999).ToString().PadLeft(5, '0')
  $waitJson = Join-Path $env:TEMP ("st-vwait-{0}.json" -f $PID)
  Set-Content -Encoding UTF8 -Path $waitJson -Value ('{"url":"https://example.com/real-video.mp4","code":"' + $wcode + '","useWait":true}')
  curl.exe -s -b $jar -X POST 'http://127.0.0.1:3000/api/links' -H 'Content-Type: application/json' -d ('@' + $waitJson) | Out-Null
  curl.exe -s ('http://127.0.0.1:3000/' + $wcode) | Select-Object -First 4
  Write-Output 'VERIFICATION COMPLETE'
}
finally {
  Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
  Remove-Item Env:PORT -ErrorAction SilentlyContinue
}
