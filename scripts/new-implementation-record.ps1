[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^MEDIQ-[A-Z0-9]+-[0-9]{3}$')]
    [string]$Ticket,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Title,

    [ValidateSet('CAPSTONE-P0', 'CAPSTONE-P1', 'POST-MVP', 'PRODUCTIONIZATION', 'OUT-OF-SCOPE')]
    [string]$Classification = 'CAPSTONE-P0',

    [string]$OutputRoot = (Join-Path $PSScriptRoot '..\docs\implementation')
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$templateRoot = Join-Path $repositoryRoot 'docs\implementation\_templates'
$reportTemplatePath = Join-Path $templateRoot 'IMPLEMENTATION-REPORT.md'
$evidenceTemplatePath = Join-Path $templateRoot 'TEST-EVIDENCE.md'

foreach ($templatePath in @($reportTemplatePath, $evidenceTemplatePath)) {
    if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
        throw "Required template was not found: $templatePath"
    }
}

$resolvedOutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$targetDirectory = [IO.Path]::GetFullPath((Join-Path $resolvedOutputRoot $Ticket))
$rootPrefix = $resolvedOutputRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

if (-not $targetDirectory.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The ticket directory must remain inside OutputRoot.'
}

if (Test-Path -LiteralPath $targetDirectory) {
    throw "Implementation record already exists: $targetDirectory"
}

$tokens = [ordered]@{
    '{{TICKET}}' = $Ticket
    '{{TITLE}}' = $Title
    '{{CLASSIFICATION}}' = $Classification
    '{{DATE}}' = (Get-Date -Format 'yyyy-MM-dd')
}

function Expand-ImplementationTemplate {
    param([Parameter(Mandatory = $true)][string]$Path)

    $content = [IO.File]::ReadAllText($Path)
    foreach ($token in $tokens.GetEnumerator()) {
        $content = $content.Replace($token.Key, $token.Value)
    }
    return $content
}

$reportContent = Expand-ImplementationTemplate -Path $reportTemplatePath
$evidenceContent = Expand-ImplementationTemplate -Path $evidenceTemplatePath
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)

if ($PSCmdlet.ShouldProcess($targetDirectory, 'Create implementation record')) {
    [IO.Directory]::CreateDirectory($targetDirectory) | Out-Null

    $reportPath = Join-Path $targetDirectory 'IMPLEMENTATION-REPORT.md'
    $evidencePath = Join-Path $targetDirectory 'TEST-EVIDENCE.md'
    [IO.File]::WriteAllText($reportPath, $reportContent, $utf8WithoutBom)
    [IO.File]::WriteAllText($evidencePath, $evidenceContent, $utf8WithoutBom)

    Write-Output "Created: $reportPath"
    Write-Output "Created: $evidencePath"
    Write-Output 'Next: update docs/implementation/README.md and fill both records during the same ticket.'
}

