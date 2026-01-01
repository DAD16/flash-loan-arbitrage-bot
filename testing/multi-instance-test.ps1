# Multi-Instance Setup Test Harness
# Tests the parallel Claude Code configuration

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\Claude Projects\Flash Loan Arbitrage Bot"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Multi-Instance Setup Test Harness" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$TestsPassed = 0
$TestsFailed = 0

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

# ============================================
# Test 1: Check all CLAUDE.md files exist
# ============================================
Write-Host "`n--- Test 1: CLAUDE.md Files ---" -ForegroundColor Yellow

$claudeFiles = @(
    "$ProjectRoot\CLAUDE.md",
    "$ProjectRoot\core\CLAUDE.md",
    "$ProjectRoot\agents\CLAUDE.md",
    "$ProjectRoot\analysis\CLAUDE.md",
    "$ProjectRoot\contracts\CLAUDE.md",
    "$ProjectRoot\dashboard\CLAUDE.md",
    "$ProjectRoot\hotpath\CLAUDE.md"
)

foreach ($file in $claudeFiles) {
    $exists = Test-Path $file
    $relativePath = $file.Replace($ProjectRoot, "").TrimStart("\")
    Test-Condition -Name "CLAUDE.md exists: $relativePath" -Condition $exists
}

# ============================================
# Test 2: Check all STATUS.md files exist
# ============================================
Write-Host "`n--- Test 2: STATUS.md Files ---" -ForegroundColor Yellow

$statusFiles = @(
    "$ProjectRoot\core\STATUS.md",
    "$ProjectRoot\agents\STATUS.md",
    "$ProjectRoot\analysis\STATUS.md",
    "$ProjectRoot\contracts\STATUS.md",
    "$ProjectRoot\dashboard\STATUS.md",
    "$ProjectRoot\hotpath\STATUS.md"
)

foreach ($file in $statusFiles) {
    $exists = Test-Path $file
    $relativePath = $file.Replace($ProjectRoot, "").TrimStart("\")
    Test-Condition -Name "STATUS.md exists: $relativePath" -Condition $exists
}

# ============================================
# Test 3: Check state.json exists and is valid JSON
# ============================================
Write-Host "`n--- Test 3: state.json Validation ---" -ForegroundColor Yellow

$stateJsonPath = "$ProjectRoot\state.json"
$stateJsonExists = Test-Path $stateJsonPath
Test-Condition -Name "state.json exists" -Condition $stateJsonExists

if ($stateJsonExists) {
    try {
        $stateJson = Get-Content $stateJsonPath -Raw | ConvertFrom-Json
        Test-Condition -Name "state.json is valid JSON" -Condition $true

        # Check required fields
        $hasInstances = $null -ne $stateJson.instances
        Test-Condition -Name "state.json has 'instances' field" -Condition $hasInstances

        $hasLockedFiles = $null -ne $stateJson.locked_files
        Test-Condition -Name "state.json has 'locked_files' field" -Condition $hasLockedFiles

        $hasSharedDecisions = $null -ne $stateJson.shared_decisions
        Test-Condition -Name "state.json has 'shared_decisions' field" -Condition $hasSharedDecisions

        # Check all instances are defined
        $expectedInstances = @("root", "core", "agents", "analysis", "contracts", "dashboard", "hotpath")
        foreach ($inst in $expectedInstances) {
            $hasInstance = $null -ne $stateJson.instances.$inst
            Test-Condition -Name "state.json has instance: $inst" -Condition $hasInstance
        }
    } catch {
        Test-Condition -Name "state.json is valid JSON" -Condition $false -FailMsg $_.Exception.Message
    }
}

# ============================================
# Test 4: Check CLAUDE.md files have required sections
# ============================================
Write-Host "`n--- Test 4: CLAUDE.md Content Validation ---" -ForegroundColor Yellow

$requiredSections = @("## Scope", "## Off-Limits", "## Status Tracking", "## Communication Protocol")

foreach ($file in $claudeFiles[1..6]) {  # Skip root CLAUDE.md
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $relativePath = $file.Replace($ProjectRoot, "").TrimStart("\")

        foreach ($section in $requiredSections) {
            $hasSection = $content -match [regex]::Escape($section)
            Test-Condition -Name "$relativePath has '$section'" -Condition $hasSection
        }
    }
}

# ============================================
# Test 5: Check STATUS.md files have required sections
# ============================================
Write-Host "`n--- Test 5: STATUS.md Content Validation ---" -ForegroundColor Yellow

$requiredStatusSections = @("## Current Status", "## Session Log", "## In Progress", "## Cross-Scope Requests")

foreach ($file in $statusFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $relativePath = $file.Replace($ProjectRoot, "").TrimStart("\")

        foreach ($section in $requiredStatusSections) {
            $hasSection = $content -match [regex]::Escape($section)
            Test-Condition -Name "$relativePath has '$section'" -Condition $hasSection
        }
    }
}

# ============================================
# Test 6: Check root CLAUDE.md has orchestrator sections
# ============================================
Write-Host "`n--- Test 6: Root CLAUDE.md Orchestrator Validation ---" -ForegroundColor Yellow

$rootClaudePath = "$ProjectRoot\CLAUDE.md"
if (Test-Path $rootClaudePath) {
    $content = Get-Content $rootClaudePath -Raw

    $orchestratorSections = @(
        "## Multi-Instance Mode",
        "### Running Parallel Instances",
        "### Root Instance Responsibilities",
        "### Global State Management",
        "### STATUS.md Files"
    )

    foreach ($section in $orchestratorSections) {
        $hasSection = $content -match [regex]::Escape($section)
        Test-Condition -Name "Root CLAUDE.md has '$section'" -Condition $hasSection
    }
}

# ============================================
# Test 7: Check memory.md exists and has multi-instance info
# ============================================
Write-Host "`n--- Test 7: memory.md Validation ---" -ForegroundColor Yellow

$memoryPath = "$ProjectRoot\memory.md"
$memoryExists = Test-Path $memoryPath
Test-Condition -Name "memory.md exists" -Condition $memoryExists

if ($memoryExists) {
    $content = Get-Content $memoryPath -Raw
    $hasMultiInstance = $content -match "multi-instance" -or $content -match "Multi-Instance"
    Test-Condition -Name "memory.md documents multi-instance setup" -Condition $hasMultiInstance
}

# ============================================
# Test 8: Simulate file locking (no conflicts)
# ============================================
Write-Host "`n--- Test 8: File Locking Simulation ---" -ForegroundColor Yellow

if ($stateJsonExists) {
    $stateJson = Get-Content $stateJsonPath -Raw | ConvertFrom-Json

    # Check locked_files is empty (no conflicts at start)
    $lockedFilesCount = ($stateJson.locked_files | Get-Member -MemberType NoteProperty).Count
    $noConflicts = $lockedFilesCount -eq 0
    Test-Condition -Name "No file locks at initialization" -Condition $noConflicts
}

# ============================================
# Summary
# ============================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Failed: $TestsFailed" -ForegroundColor $(if ($TestsFailed -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($TestsFailed -eq 0) {
    Write-Host "All tests passed! Multi-instance setup is ready." -ForegroundColor Green
    Write-Host ""
    Write-Host "To run parallel instances:" -ForegroundColor Cyan
    Write-Host "  Terminal 1: cd '$ProjectRoot' && claude" -ForegroundColor White
    Write-Host "  Terminal 2: cd '$ProjectRoot\core' && claude" -ForegroundColor White
    Write-Host "  Terminal 3: cd '$ProjectRoot\agents' && claude" -ForegroundColor White
    Write-Host "  Terminal 4: cd '$ProjectRoot\analysis' && claude" -ForegroundColor White
    Write-Host "  Terminal 5: cd '$ProjectRoot\dashboard' && claude" -ForegroundColor White
    exit 0
} else {
    Write-Host "Some tests failed. Please review the issues above." -ForegroundColor Red
    exit 1
}
