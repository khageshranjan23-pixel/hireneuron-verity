# Keeps Windows awake continuously so the Cloudflare tunnel and local servers never sleep
$wscript = New-Object -ComObject Wscript.Shell
Write-Output "Keep-Awake Active: Preventing system sleep..."
while ($true) {
    Start-Sleep -Seconds 120
    $wscript.SendKeys("{F15}")
}
