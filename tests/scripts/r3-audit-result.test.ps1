$ErrorActionPreference = 'Stop'
$wrapperPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../scripts/test-db-008-full-schema.ps1'))
$tokens=$null; $parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($wrapperPath,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'R3_WRAPPER_PARSE_FAILED' }
$functions=@($ast.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-R3AuditReadResult'
},$true))
if ($functions.Count -ne 1) { throw 'R3_RESULT_FUNCTION_MISSING' }
. ([scriptblock]::Create($functions[0].Extent.Text))
$marker='dispatch_audit_metadata=PASS exact_privileges=258 audit_select=9 insert=12 rls=forced immutable=true synthetic_rollback=true'
$valid=@('# tests 1','# pass 1','# fail 0','# cancelled 0','# skipped 0','# todo 0',"# $marker")
$cases=0
foreach ($lines in @(@($valid),@($valid | ForEach-Object { $_ + "`r" }))) {
    Assert-R3AuditReadResult -ExitCode 0 -Output $lines
    $cases++
}
$invalidSets=@()
foreach ($line in $valid) { $invalidSets += ,@($valid | Where-Object { $_ -ne $line }) }
$invalidSets += ,@($valid + '# pass 1')
$invalidSets += ,@($valid + '# fail 1')
$invalidSets += ,@($valid + '# tests 2')
$invalidSets += ,@($valid + '# dispatch_audit_metadata=FAIL')
$invalidSets += ,@($valid + "# $marker")
$invalidSets += ,@($valid | ForEach-Object { $_ -replace '^# tests 1$','# tests 2' })
$invalidSets += ,@($valid | ForEach-Object { $_ -replace '^# skipped 0$','# skipped 1' })
$invalidSets += ,@($valid | ForEach-Object { $_ -replace '^# fail 0$','# fail 1' })
$invalidSets += ,@($valid | ForEach-Object { $_ -replace '^# dispatch_audit_metadata=', 'dispatch_audit_metadata=' })
$invalidSets += ,@($valid | ForEach-Object { $_ -replace 'exact_privileges=258','exact_privileges=249' })
foreach ($invalid in $invalidSets) {
    $caught=$null
    try { Assert-R3AuditReadResult -ExitCode 0 -Output @($invalid) } catch { $caught=$_.Exception.Message }
    if ($caught -cne 'R3 Audit metadata runtime acceptance failed (exit=0, marker=R3_RESULT_UNCLASSIFIED); raw output suppressed.') { throw 'R3_INVALID_RESULT_NOT_DENIED' }
    $cases++
}
foreach ($failure in @('RAW_SECRET_SENTINEL','R3_AUDIT_METADATA_FAILED_42501 RAW_SECRET_SENTINEL')) {
    $caught=$null
    try { Assert-R3AuditReadResult -ExitCode 1 -Output @($valid + $failure) } catch { $caught=$_.Exception.Message }
    $expected=if ($failure.StartsWith('R3_AUDIT_METADATA_FAILED_42501')) { 'R3_AUDIT_METADATA_FAILED_42501' } else { 'R3_RESULT_UNCLASSIFIED' }
    if ($caught -cne "R3 Audit metadata runtime acceptance failed (exit=1, marker=$expected); raw output suppressed.") { throw 'R3_FAILURE_PRIVACY_FAILED' }
    $cases++
}
Write-Output "r3_audit_result_unit=PASS cases=$cases no_network=true no_db=true actual_wrapper_function=true"
