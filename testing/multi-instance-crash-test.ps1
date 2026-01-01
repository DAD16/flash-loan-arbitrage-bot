# Multi-Instance Crash Reproduction Test
# Tests concurrent Claude Code instances for file conflicts and race conditions
#
# This test simulates what happens when multiple Claude Code instances
# try to work simultaneously on shared resources.
#
# Usage: .\multi-instance-crash-test.ps1 [-Verbose] [-TestFileContention] [-TestStateJson]

param(
    [switch]$Verbose,
    [switch]$TestFileContention,
    [switch]$TestStateJson,
    [switch]$All
)

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\Claude Projects\Flash Loan Arbitrage Bot"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Multi-Instance Crash Reproduction Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$TestsPassed = 0
$TestsFailed = 0
$Warnings = @()

function Test-Condition {
    param(
        [string]$Name,
        [bool]$Condition,
        [string]$SuccessMsg = "PASS",
        [string]$FailMsg = "FAIL"
    )

    if ($Condition) {
        Write-Host "[PASS] $Name" -ForegroundColor Green
        $script:TestsPassed++
        return $true
    } else {
        Write-Host "[FAIL] $Name - $FailMsg" -ForegroundColor Red
        $script:TestsFailed++
        return $false
    }
}

function Add-Warning {
    param([string]$Message)
    $script:Warnings += $Message
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

# ============================================
# Test 1: Check for file lock mechanisms
# ============================================
Write-Host "`n--- Test 1: File Lock Mechanism Analysis ---" -ForegroundColor Yellow

$stateJsonPath = "$ProjectRoot\state.json"
$memoryPath = "$ProjectRoot\memory.md"

# Check if state.json has locked_files field
if (Test-Path $stateJsonPath) {
    $stateJson = Get-Content $stateJsonPath -Raw | ConvertFrom-Json

    $hasLockMechanism = $null -ne $stateJson.locked_files
    Test-Condition -Name "state.json has 'locked_files' field" -Condition $hasLockMechanism

    if ($hasLockMechanism) {
        $lockCount = ($stateJson.locked_files | Get-Member -MemberType NoteProperty).Count
        if ($lockCount -eq 0) {
            Write-Host "  INFO: No files currently locked (expected when idle)" -ForegroundColor Gray
        } else {
            Add-Warning "Found $lockCount locked files - may indicate crash during operation"
            foreach ($prop in ($stateJson.locked_files | Get-Member -MemberType NoteProperty)) {
                $file = $prop.Name
                $locker = $stateJson.locked_files.$file
                Write-Host "  LOCKED: $file by $locker" -ForegroundColor Yellow
            }
        }
    }
} else {
    Test-Condition -Name "state.json exists" -Condition $false -FailMsg "File not found"
}

# ============================================
# Test 2: Concurrent File Write Simulation
# ============================================
if ($TestFileContention -or $All) {
    Write-Host "`n--- Test 2: Concurrent File Write Simulation ---" -ForegroundColor Yellow

    $testFile = "$ProjectRoot\testing\.contention-test.tmp"
    $results = @()

    # Create test file first
    if (Test-Path $testFile) { Remove-Item $testFile -Force }
    New-Item $testFile -ItemType File -Force | Out-Null

    # Sequential simulation (parallel jobs unreliable in some PowerShell versions)
    Write-Host "  Simulating 5 concurrent writers..."
    $totalSuccess = 0
    $totalFailures = 0

    # Use runspaces for true concurrency
    $runspacePool = [runspacefactory]::CreateRunspacePool(1, 5)
    $runspacePool.Open()

    $runspaces = @()
    1..5 | ForEach-Object {
        $powershell = [powershell]::Create()
        $powershell.RunspacePool = $runspacePool
        [void]$powershell.AddScript({
            param($file, $id)
            $success = 0
            $failures = 0
            for ($j = 0; $j -lt 10; $j++) {
                try {
                    $timestamp = Get-Date -Format "HH:mm:ss.fff"
                    [System.IO.File]::AppendAllText($file, "[$timestamp] Writer $id attempt $j`n")
                    $success++
                } catch {
                    $failures++
                }
                Start-Sleep -Milliseconds (Get-Random -Minimum 1 -Maximum 10)
            }
            return "$success,$failures"
        }).AddArgument($testFile).AddArgument($_)

        $runspaces += @{
            Pipe = $powershell
            Handle = $powershell.BeginInvoke()
        }
    }

    # Collect results
    foreach ($rs in $runspaces) {
        $result = $rs.Pipe.EndInvoke($rs.Handle)
        $parts = $result -split ","
        $totalSuccess += [int]$parts[0]
        $totalFailures += [int]$parts[1]
        $rs.Pipe.Dispose()
    }
    $runspacePool.Close()

    Write-Host "  Writers: 5 parallel, 10 attempts each (50 total)"
    Write-Host "  Successful writes: $totalSuccess"
    Write-Host "  Failed writes: $totalFailures"

    if ($totalFailures -gt 0) {
        Add-Warning "File contention detected - $totalFailures writes failed"
        Write-Host "  This indicates potential crash risk when multiple instances edit files" -ForegroundColor Yellow
    } else {
        Test-Condition -Name "No file contention errors" -Condition $true
    }

    # Verify file integrity
    $lines = Get-Content $testFile | Measure-Object -Line
    Write-Host "  Lines written: $($lines.Lines)"

    # Cleanup
    if (Test-Path $testFile) { Remove-Item $testFile -Force }
}

# ============================================
# Test 3: state.json Concurrent Modification
# ============================================
if ($TestStateJson -or $All) {
    Write-Host "`n--- Test 3: state.json Concurrent Modification ---" -ForegroundColor Yellow

    # Create backup
    $backupPath = "$ProjectRoot\state.json.bak"
    Copy-Item $stateJsonPath $backupPath -Force

    try {
        # Simulate 3 instances trying to update state.json simultaneously using runspaces
        Write-Host "  Simulating 3 concurrent instance updates..."

        $runspacePool = [runspacefactory]::CreateRunspacePool(1, 3)
        $runspacePool.Open()

        $instances = @("core", "agents", "dashboard")
        $runspaces = @()

        foreach ($inst in $instances) {
            $powershell = [powershell]::Create()
            $powershell.RunspacePool = $runspacePool
            [void]$powershell.AddScript({
                param($file, $instName)
                $errors = 0
                for ($i = 0; $i -lt 5; $i++) {
                    try {
                        # Read
                        $content = [System.IO.File]::ReadAllText($file)
                        $json = $content | ConvertFrom-Json

                        # Modify
                        $json.instances.$instName.status = "working"
                        $json.instances.$instName.last_active = (Get-Date).ToString("o")

                        # Small delay to increase race condition likelihood
                        Start-Sleep -Milliseconds (Get-Random -Minimum 1 -Maximum 5)

                        # Write back
                        $output = $json | ConvertTo-Json -Depth 10
                        [System.IO.File]::WriteAllText($file, $output)
                    } catch {
                        $errors++
                    }
                }
                return "$instName,$errors"
            }).AddArgument($stateJsonPath).AddArgument($inst)

            $runspaces += @{
                Pipe = $powershell
                Handle = $powershell.BeginInvoke()
            }
        }

        # Collect results
        $totalErrors = 0
        foreach ($rs in $runspaces) {
            $result = $rs.Pipe.EndInvoke($rs.Handle)
            $parts = $result -split ","
            $instName = $parts[0]
            $errCount = [int]$parts[1]
            if ($errCount -gt 0) {
                $totalErrors += $errCount
                Write-Host "  Instance $instName`: $errCount errors" -ForegroundColor Yellow
            }
            $rs.Pipe.Dispose()
        }
        $runspacePool.Close()

        if ($totalErrors -gt 0) {
            Add-Warning "state.json race condition detected - $totalErrors errors during concurrent updates"
            Write-Host "  RECOMMENDATION: Implement file locking or use atomic operations" -ForegroundColor Cyan
        } else {
            # Verify state.json is still valid JSON
            try {
                $verifyJson = Get-Content $stateJsonPath -Raw | ConvertFrom-Json
                Test-Condition -Name "state.json survived concurrent modification" -Condition $true
            } catch {
                Test-Condition -Name "state.json valid after test" -Condition $false -FailMsg "JSON corrupted"
            }
        }

    } finally {
        # Restore backup
        Copy-Item $backupPath $stateJsonPath -Force
        Remove-Item $backupPath -Force
    }
}

# ============================================
# Test 4: STATUS.md Concurrent Updates
# ============================================
Write-Host "`n--- Test 4: STATUS.md File Analysis ---" -ForegroundColor Yellow

$statusFiles = @(
    "$ProjectRoot\core\STATUS.md",
    "$ProjectRoot\agents\STATUS.md",
    "$ProjectRoot\analysis\STATUS.md",
    "$ProjectRoot\contracts\STATUS.md",
    "$ProjectRoot\dashboard\STATUS.md",
    "$ProjectRoot\hotpath\STATUS.md"
)

foreach ($file in $statusFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $relativePath = $file.Replace($ProjectRoot, "").TrimStart("\")

        # Check if status shows "working" (might indicate crash during work)
        if ($content -match "Status:\s*working") {
            Add-Warning "$relativePath shows 'working' status - may indicate crash during operation"
        }

        # Check for "in_progress" items
        $inProgressCount = ([regex]::Matches($content, "- \[x\]|in_progress|In Progress")).Count
        if ($inProgressCount -gt 0) {
            Write-Host "  $relativePath`: $inProgressCount items in progress" -ForegroundColor Gray
        }
    }
}

# ============================================
# Test 5: Memory/Resource Check
# ============================================
Write-Host "`n--- Test 5: System Resource Analysis ---" -ForegroundColor Yellow

$memInfo = Get-CimInstance Win32_OperatingSystem
$totalMemGB = [math]::Round($memInfo.TotalVisibleMemorySize / 1MB, 2)
$freeMemGB = [math]::Round($memInfo.FreePhysicalMemory / 1MB, 2)
$usedPercent = [math]::Round((1 - ($memInfo.FreePhysicalMemory / $memInfo.TotalVisibleMemorySize)) * 100, 1)

Write-Host "  Total Memory: $totalMemGB GB"
Write-Host "  Free Memory: $freeMemGB GB"
Write-Host "  Used: $usedPercent%"

if ($usedPercent -gt 90) {
    Add-Warning "High memory usage ($usedPercent%) - may cause crashes with multiple instances"
} elseif ($usedPercent -gt 75) {
    Write-Host "  Memory usage is elevated but acceptable" -ForegroundColor Yellow
} else {
    Test-Condition -Name "Memory availability adequate" -Condition $true
}

# Check for Claude Code processes
$claudeProcesses = Get-Process -Name "claude*" -ErrorAction SilentlyContinue
if ($claudeProcesses) {
    Write-Host "  Active Claude processes: $($claudeProcesses.Count)" -ForegroundColor Gray
    if ($claudeProcesses.Count -gt 1) {
        Add-Warning "Multiple Claude processes detected - monitor for resource contention"
    }
}

# ============================================
# Test 6: Recommendations
# ============================================
Write-Host "`n--- Crash Prevention Recommendations ---" -ForegroundColor Yellow

$recommendations = @(
    "1. Use file locking before modifying shared files (memory.md, state.json)",
    "2. Implement atomic writes for state.json (write to .tmp then rename)",
    "3. Add instance heartbeats to detect stale locks",
    "4. Stagger instance startup by a few seconds",
    "5. Each instance should only modify its own STATUS.md",
    "6. Consider using a shared database instead of JSON for state"
)

foreach ($rec in $recommendations) {
    Write-Host "  $rec" -ForegroundColor Cyan
}

# ============================================
# Summary
# ============================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor $(if ($TestsFailed -gt 0) { "Red" } else { "Green" })
Write-Host "Warnings: $($Warnings.Count)" -ForegroundColor $(if ($Warnings.Count -gt 0) { "Yellow" } else { "Green" })

if ($Warnings.Count -gt 0) {
    Write-Host "`nWarnings:" -ForegroundColor Yellow
    $Warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

Write-Host ""
if ($TestsFailed -eq 0 -and $Warnings.Count -eq 0) {
    Write-Host "No issues detected. Multi-instance setup appears stable." -ForegroundColor Green
} else {
    Write-Host "Issues found. Review warnings and recommendations above." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To run full test suite:" -ForegroundColor Cyan
    Write-Host "  .\multi-instance-crash-test.ps1 -All" -ForegroundColor White
}

exit $(if ($TestsFailed -gt 0) { 1 } else { 0 })
