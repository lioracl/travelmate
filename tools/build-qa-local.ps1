param([string]$SourceWeb,[string]$JavaHome='C:\TravelMateToolchain\java\jdk-21.0.12.1+1',[string]$AndroidSdk='C:\TravelMateToolchain\android-sdk')
$ErrorActionPreference='Stop'
$signRoot=Join-Path $env:LOCALAPPDATA 'TravelMate\signing'
if (!(Test-Path "$signRoot\travelmate-qa.p12") -or !(Test-Path "$signRoot\qa-password.dpapi")) { throw 'Permanent QA signer is required; no debug fallback' }
$env:JAVA_HOME=$JavaHome
$env:ANDROID_HOME=$AndroidSdk
$env:TRAVELMATE_QA_KEYSTORE="$signRoot\travelmate-qa.p12"
$env:TRAVELMATE_QA_KEY_ALIAS='travelmate-qa'
try {
 $secret=Get-Content "$signRoot\qa-password.dpapi" | ConvertTo-SecureString
 $env:TRAVELMATE_QA_STORE_PASSWORD=[System.Net.NetworkCredential]::new('', $secret).Password
 $env:TRAVELMATE_QA_KEY_PASSWORD=$env:TRAVELMATE_QA_STORE_PASSWORD
 Push-Location (Join-Path $PSScriptRoot '..')
 try {
  if (!$SourceWeb) { throw 'An exact web source worktree is required' }
  node tools/stage-native-web.mjs $SourceWeb dist
  if ($LASTEXITCODE -ne 0) { throw 'Native stage failed' }
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'Native sync failed' }
  Push-Location android
  try { .\gradlew.bat :app:check :app:assembleDebugAndroidTest :app:assembleDebug --console=plain; if ($LASTEXITCODE -ne 0) { throw 'Android build failed' } } finally { Pop-Location }
  $signature = & "$AndroidSdk\build-tools\36.0.0\apksigner.bat" verify --print-certs android/app/build/outputs/apk/debug/app-debug.apk
  $signature | Write-Output
  $expectedCertificate = (Get-FileHash -LiteralPath "$signRoot\qa-certificate.der" -Algorithm SHA256).Hash.ToLowerInvariant()
  if (!(($signature -join "`n").ToLowerInvariant().Contains($expectedCertificate))) { throw 'Permanent QA certificate mismatch' }
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
 } finally { Pop-Location }
} finally {
 Remove-Item Env:TRAVELMATE_QA_STORE_PASSWORD,Env:TRAVELMATE_QA_KEY_PASSWORD -ErrorAction SilentlyContinue
}
