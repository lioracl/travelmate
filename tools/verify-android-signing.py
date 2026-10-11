"""Verify public certificate identity after apksigner has validated the APK signature."""
import json
import os
from pathlib import Path
import re
import sys


def certificate_report(output, expected=""):
    matches = []
    for line in output.splitlines():
        owner, marker, digest = line.partition("certificate SHA-256 digest:")
        if marker and re.fullmatch(r"(?:Signer #\d+|V\d+ Signer):?", owner.strip()):
            matches.append(digest.strip())
    if len(matches) != 1:
        raise ValueError("Expected exactly one APK signing certificate")
    actual = matches[0].replace(":", "").lower()
    normalized = expected.strip().replace(":", "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", actual):
        raise ValueError("Invalid signing certificate SHA-256")
    if normalized and (not re.fullmatch(r"[0-9a-f]{64}", normalized) or actual != normalized):
        raise ValueError("APK certificate does not match configured stable QA fingerprint")
    return {"certificateSha256": actual, "stableQaCertificateVerified": bool(normalized),
            "updateCompatibility": "same-certificate-installed-build-only" if normalized else "not-guaranteed-ephemeral-debug"}


if __name__ == "__main__":
    report = certificate_report(Path(sys.argv[1]).read_text(encoding="utf-8"), os.environ.get("TRAVELMATE_QA_CERT_SHA256", ""))
    Path(sys.argv[2]).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
