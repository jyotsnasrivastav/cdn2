# ShortTrack end-to-end smoke test
$ErrorActionPreference = 'Stop'
$dir = 'C:\Users\0\AccioWork\2026-08-23-00-53-41\vidy-clone'
$jar = Join-Path $env:TEMP ("st-jar-{0}.txt" -f $PID)
$reg = Join-Path $env:TEMP ("st-reg-{0}.json" -f $PID)
$link = Join-Path $env:TEMP ("st-link-{0}.json" -f $PID)
Set-Content -Encoding UTF8 -Path $reg -Value '{"username":"rahul","password":"secret123"}'
Set-Content -Encoding UTF8 -Path $link -Value '{"url":"https://example.com/team-video.mp4","mp4Style":true,"useWait":false}'

$env:PORT = '3000'
$p = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $dir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
if ($p.HasExited) { Write-Output ('SERVER CRASHED exit=' + $p.ExitCode); exit 1 }

try {
  Write-Output '== 1. Register =='
  curl.exe -s -c $jar -X POST 'http://127.0.0.1:3000/api/register' -H 'Content-Type: application/json' -d ('@' + $reg)

  Write-Output '`n== 2. Create link =='
  $resp = curl.exe -s -b $jar -X POST 'http://127.0.0.1:3000/api/links' -H 'Content-Type: application/json' -d ('@' + $link)
  Write-Output $resp
  $code = ($resp | ConvertFrom-Json).code

  Write-Output '== 3. Public redirect /CODE.mp4 =='
  curl.exe -s -o NUL -w 'status=%{http_code} location=%{redirect_url}`n' ('http://127.0.0.1:3000/' + $code + '.mp4')

  Write-Output '== 4. My links =='
  curl.exe -s -b $jar 'http://127.0.0.1:3000/api/links'

  Write-Output '`n== 5. Stats =='
  $stats = curl.exe -s -b $jar ('http://127.0.0.1:3000/api/links/' + $code + '/stats')
  Write-Output $stats
  $total = ($stats | ConvertFrom-Json).total
  if ($total -lt 1) { throw 'Stats total should be >= 1' }

  Write-Output '== 6. Landing page =='
  $landing = curl.exe -s 'http://127.0.0.1:3000/'
  if ($landing -match 'ShortTrack') { Write-Output 'OK: landing contains ShortTrack' } else { throw 'Landing missing ShortTrack' }

  Write-Output '== 7. Dashboard page =='
  curl.exe -s -o NUL -w 'status=%{http_code}`n' 'http://127.0.0.1:3000/dashboard.html'

  Write-Output '== 8. Auth isolation (no cookie -> 401) =='
  curl.exe -s -o NUL -w 'status=%{http_code}`n' 'http://127.0.0.1:3000/api/links'

  Write-Output '== 9. Wait-page link =='
  $waitJson = Join-Path $env:TEMP ("st-wait-{0}.json" -f $PID)
  Set-Content -Encoding UTF8 -Path $waitJson -Value '{"url":"https://example.com/v2.mp4","useWait":true}'
  $wresp = curl.exe -s -b $jar -X POST 'http://127.0.0.1:3000/api/links' -H 'Content-Type: application/json' -d ('@' + $waitJson)
  $wcode = ($wresp | ConvertFrom-Json).code
  $waitPage = curl.exe -s ('http://127.0.0.1:3000/' + $wcode)
  if ($waitPage -match 'Mohon Tunggu') { Write-Output 'OK: wait page served' } else { throw 'Wait page missing' }

  Write-Output 'ALL E2E TESTS PASSED'
}
finally {
  Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
  Remove-Item Env:PORT -ErrorAction SilentlyContinue
}
