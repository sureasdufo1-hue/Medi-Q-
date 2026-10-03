$ErrorActionPreference = 'Stop'
$wrapperPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../scripts/test-int001-source-capture.ps1'))
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($wrapperPath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'CLEANUP_WRAPPER_SYNTAX_INVALID' }
$functions = @($ast.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Stop-OwnedPrivacyObserver'
}, $true))
if ($functions.Count -ne 1) { throw 'CLEANUP_HELPER_MISSING' }
. ([scriptblock]::Create($functions[0].Extent.Text))
$script:project = 'mediq-int001-capture-123456abcdef'
$script:observerName = "$script:project-privacy-observer"
$script:validIdentity = "$script:project|source-capture-db-observer|/$script:observerName|true"
$script:cases = 0
function Check([bool]$condition) { if (-not $condition) { throw 'CLEANUP_ASSERTION_FAILED' } }
function Reset-Fake {
    $script:calls = @(); $script:inventory = @('123456abcdef'); $script:identity = $script:validIdentity
    $script:failCommand = ''; $script:polls = 0; $script:linger = 0; $script:sleeps = 0; $script:elapsed = 0
}
function docker {
    $script:calls += ,@($args)
    $global:LASTEXITCODE = 0
    if ($args[0] -eq $script:failCommand) { $global:LASTEXITCODE = 1; return }
    switch ($args[0]) {
        'ps' {
            if ($args[-1] -like 'id=*') {
                if ($script:failCommand -eq 'poststop') { $global:LASTEXITCODE = 1; return }
                $script:polls++
                if ($script:polls -le $script:linger) { Write-Output '123456abcdef' }
            } else { $script:inventory | Write-Output }
        }
        'inspect' { Write-Output $script:identity }
        'stop' { Check (($args -join '|') -ceq 'stop|--timeout|15|123456abcdef') }
        default { throw 'UNEXPECTED_DOCKER_COMMAND' }
    }
}
function Start-Sleep([int]$Milliseconds) { Check ($Milliseconds -eq 250); $script:sleeps++ }
function Get-ObserverRemovalElapsedMilliseconds([Diagnostics.Stopwatch]$Clock) {
    Check ($Clock.IsRunning); $value = $script:elapsed; $script:elapsed += 250; return $value
}
function Run-Case([string]$Expected = '', [string]$Name = $script:observerName, [string]$Project = $script:project) {
    $caught = ''
    try { Stop-OwnedPrivacyObserver -Name $Name -ProjectName $Project } catch { $caught = $_.Exception.Message }
    Check ($caught -ceq $Expected); $script:cases++
}
Reset-Fake; Run-Case
Check (($script:calls | ForEach-Object { $_[0] }) -join '|' -ceq 'ps|inspect|stop|ps')
Reset-Fake; $script:inventory = @(); Run-Case; Check ($script:calls.Count -eq 1)
Reset-Fake; Run-Case -Name 'unowned' -Expected 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'; Check ($script:calls.Count -eq 0)
Reset-Fake; Run-Case -Project 'mediq' -Expected 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'; Check ($script:calls.Count -eq 0)
Reset-Fake; $script:inventory = @('123456abcdef', 'abcdef123456'); Run-Case 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'; Check ($script:calls.Count -eq 1)
Reset-Fake; $script:inventory = @('TEST-INVALID-ID'); Run-Case 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'; Check ($script:calls.Count -eq 1)
foreach ($wrong in @('other|source-capture-db-observer|/TEST|true',
    "$script:project|other|/$script:observerName|true", "$script:project|source-capture-db-observer|/other|true",
    "$script:project|source-capture-db-observer|/$script:observerName|false")) {
    Reset-Fake; $script:identity = $wrong; Run-Case 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'; Check ($script:calls.Count -eq 2)
}
foreach ($failure in @(@('ps', 'INT001_PRIVACY_OBSERVER_INVENTORY_FAILED'), @('inspect', 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'), @('stop', 'INT001_PRIVACY_OBSERVER_STOP_FAILED'))) {
    Reset-Fake; $script:failCommand = $failure[0]; Run-Case $failure[1]
}
Reset-Fake; $script:linger = 2; Run-Case; Check ($script:polls -eq 3 -and $script:sleeps -eq 2)
Reset-Fake; $script:linger = 120; Run-Case 'INT001_PRIVACY_OBSERVER_AUTOREMOVE_INCOMPLETE'; Check ($script:polls -eq 120 -and $script:sleeps -eq 120)
Reset-Fake; $script:failCommand = 'poststop'; Run-Case 'INT001_PRIVACY_OBSERVER_POSTSTOP_INVENTORY_FAILED'
# Structural ordering check complements helper execution, not actual Docker proof.
$mainTry = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] })[-1]
$finallyText = $mainTry.Finally.Extent.Text
Check ($finallyText.IndexOf('Assert-ObserverLogPrivacy') -lt $finallyText.IndexOf('Stop-OwnedPrivacyObserver') -and
    $finallyText.IndexOf('Stop-OwnedPrivacyObserver') -lt $finallyText.IndexOf('("down", "--volumes"'))
$script:cases++
# Execute the actual cleanup try-body with fakes to prove failure preservation
# and attempted down after an identity-verified stop/wait failure.
$cleanupBodies = @($mainTry.Finally.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.TryStatementAst] -and
    $node.Body.Statements.Count -gt 0 -and $node.Body.Statements[0].Extent.Text -eq 'Assert-OwnedResources $projectName'
}, $true))
Check ($cleanupBodies.Count -eq 1)
$bodyText = $cleanupBodies[0].Body.Extent.Text
$cleanupBody = [scriptblock]::Create($bodyText.Substring(1, $bodyText.Length - 2))
function Assert-OwnedResources { $script:cleanupActions += 'ownership' }
function Stop-OwnedPrivacyObserver { $script:cleanupActions += 'stop'; if ($script:stopError) { throw $script:stopError } }
function Get-ProjectResources { return $developmentSnapshot }
function Invoke-DockerQuiet { $script:cleanupActions += 'down' }
function Assert-NoProjectResources { $script:cleanupActions += 'empty' }
$projectName = $script:project
$privacyObserverOwned = $true
$composeBase = @('compose', '--project-name', $projectName)
$developmentSnapshot = [pscustomobject]@{ Containers = @('TEST-container'); Volumes = @('TEST-volume'); Networks = @('TEST-network') }
foreach ($stopError in @('', 'INT001_PRIVACY_OBSERVER_AUTOREMOVE_INCOMPLETE', 'INT001_PRIVACY_OBSERVER_OWNER_INVALID')) {
    $script:stopError = $stopError; $script:cleanupActions = @(); $caught = ''
    try { $null = & $cleanupBody } catch { $caught = $_.Exception.Message }
    Check ($caught -ceq $stopError)
    Check (($script:cleanupActions -contains 'down') -eq ($stopError -ne 'INT001_PRIVACY_OBSERVER_OWNER_INVALID'))
    $script:cases++
}
$global:LASTEXITCODE = 0
Write-Output "int001_observer_cleanup_unit=PASS cases=$script:cases fake_docker=true no_resource_mutation=true"
