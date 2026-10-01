[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\data\local-tls"),
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
$requiredFiles = @("test-ca.crt", "test-ca.key", "orthanc-a.pem", "orthanc-b.pem")
$existing = @($requiredFiles | Where-Object { Test-Path -LiteralPath (Join-Path $resolvedOutput $_) })

if ($existing.Count -eq $requiredFiles.Count -and -not $Force) {
    Write-Output "Local Test CA and A/B server certificates already exist; no files were overwritten."
    exit 0
}
if ($existing.Count -gt 0 -and -not $Force) {
    throw "Partial local TLS material exists in the target directory. Inspect and recover it manually; this script will not overwrite or delete existing files."
}

[IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null
$now = [DateTimeOffset]::UtcNow
$caKey = [System.Security.Cryptography.RSA]::Create(3072)
$caCertificate = $null
$leafKeys = [System.Collections.Generic.List[System.Security.Cryptography.RSA]]::new()
$leafCertificates = [System.Collections.Generic.List[System.Security.Cryptography.X509Certificates.X509Certificate2]]::new()

try {
    $caRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
        "CN=MediQ Local Synthetic Test CA",
        $caKey,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256,
        [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
    $caRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true, $false, 0, $true))
    $caRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
        [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign,
        $true
    ))
    $caRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($caRequest.PublicKey, $false))
    $caCertificate = $caRequest.CreateSelfSigned($now.AddMinutes(-5), $now.AddDays(365))

    $outputs = [ordered]@{}
    foreach ($hospital in @("a", "b")) {
        $hostName = "orthanc-$hospital"
        $leafKey = [System.Security.Cryptography.RSA]::Create(3072)
        $leafKeys.Add($leafKey)
        $leafRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
            "CN=$hostName",
            $leafKey,
            [System.Security.Cryptography.HashAlgorithmName]::SHA256,
            [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
        )
        $san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
        $san.AddDnsName($hostName)
        $san.AddDnsName("localhost")
        $leafRequest.CertificateExtensions.Add($san.Build())
        $leafRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
        $leafRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
            [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,
            $true
        ))
        $serverAuthOid = [System.Security.Cryptography.Oid]::new("1.3.6.1.5.5.7.3.1")
        $ekuOids = [System.Security.Cryptography.OidCollection]::new()
        $ekuOids.Add($serverAuthOid) | Out-Null
        $eku = [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($ekuOids, $true)
        $leafRequest.CertificateExtensions.Add($eku)
        $leafRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509AuthorityKeyIdentifierExtension]::CreateFromCertificate($caCertificate, $true, $true))
        $leafRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($leafRequest.PublicKey, $false))
        $serial = [byte[]]::new(16)
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($serial)
        $leaf = $leafRequest.Create($caCertificate, $now.AddMinutes(-5), $now.AddDays(90), $serial)
        $leafCertificates.Add($leaf)

        $pem = $leafKey.ExportPkcs8PrivateKeyPem() + "`n" + $leaf.ExportCertificatePem() + "`n" + $caCertificate.ExportCertificatePem() + "`n"
        $outputs["orthanc-$hospital.pem"] = $pem
    }

    $outputs["test-ca.crt"] = $caCertificate.ExportCertificatePem() + "`n"
    $outputs["test-ca.key"] = $caKey.ExportPkcs8PrivateKeyPem() + "`n"

    $encoding = [Text.UTF8Encoding]::new($false)
    foreach ($entry in $outputs.GetEnumerator()) {
        $target = Join-Path $resolvedOutput $entry.Key
        if ((Test-Path -LiteralPath $target) -and -not $Force) { throw "Refusing to overwrite existing TLS file: $target" }
        [IO.File]::WriteAllText($target, $entry.Value, $encoding)
    }

    Write-Output "Generated local-only Test CA and separate A/B TLS certificates in data/local-tls."
    Write-Output "The Test CA private key and Orthanc private keys are ignored runtime material; never commit or reuse them outside synthetic local testing."
}
finally {
    if ($caCertificate) { $caCertificate.Dispose() }
    foreach ($certificate in $leafCertificates) { $certificate.Dispose() }
    foreach ($key in $leafKeys) { $key.Dispose() }
    $caKey.Dispose()
}
