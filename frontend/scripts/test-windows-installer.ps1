$ErrorActionPreference = 'Stop'
$setup = @(Get-ChildItem "$PSScriptRoot/../src-tauri/target/release/bundle/nsis/*-setup.exe")
if ($setup.Count -ne 1) { throw 'Expected exactly one Windows setup executable.' }
$installDir = Join-Path $env:RUNNER_TEMP 'aasopharma-install-smoke'
$report = [ordered]@{ installer = $setup[0].Name; install = $false; launch = $false; protocol = $false; reinstall = $false; uninstall = $false }

function Install-App {
    # NSIS requires /D to be last and unquoted, including paths containing spaces.
    $process = Start-Process -FilePath $setup[0].FullName -ArgumentList "/S /D=$installDir" -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer exited with $($process.ExitCode)" }
    $script:appExe = Join-Path $installDir 'aasopharma-erp.exe'
    if (!(Test-Path $script:appExe)) { throw 'Installer did not create the application executable.' }
}

function Test-AppWindow {
    $process = Start-Process -FilePath $script:appExe -PassThru
    try {
        $deadline = (Get-Date).AddSeconds(45)
        do {
            Start-Sleep -Milliseconds 500
            $process.Refresh()
            if ($process.HasExited) { throw "Application exited during startup: $($process.ExitCode)" }
            if ($process.MainWindowHandle -ne 0 -and $process.Responding) { return }
        } while ((Get-Date) -lt $deadline)
        throw 'Application did not open a responsive desktop window.'
    } finally {
        if (!$process.HasExited) {
            $null = $process.CloseMainWindow()
            if (!$process.WaitForExit(10000)) { $process.Kill(); $process.WaitForExit() }
        }
    }
}

try {
    Install-App
    $report.install = $true
    Test-AppWindow
    $report.launch = $true
    $protocol = (Get-Item 'Registry::HKEY_CURRENT_USER\Software\Classes\aasopharma\shell\open\command').GetValue('')
    if (!$protocol.Contains($appExe)) { throw 'OAuth protocol does not point to the installed app.' }
    $report.protocol = $true
    Install-App
    Test-AppWindow
    $report.reinstall = $true
    $uninstaller = Join-Path $installDir 'uninstall.exe'
    if (!(Test-Path $uninstaller)) { throw 'Uninstaller is missing.' }
    $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Uninstaller exited with $($process.ExitCode)" }
    $deadline = (Get-Date).AddSeconds(30)
    while ((Test-Path $appExe) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (Test-Path $appExe) { throw 'Application remained installed after uninstall.' }
    $report.uninstall = $true
} finally {
    $report | ConvertTo-Json | Set-Content "$PSScriptRoot/../src-tauri/target/release/bundle/nsis/install-smoke.json"
    $report | ConvertTo-Json | Write-Output
}
