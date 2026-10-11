import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("signing", Path(__file__).with_name("verify-android-signing.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
FP = "a" * 64
OUTPUT = "Signer #1 certificate SHA-256 digest: " + FP

class SigningIdentityTests(unittest.TestCase):
    def test_ephemeral_is_explicit(self):
        self.assertFalse(module.certificate_report(OUTPUT)["stableQaCertificateVerified"])
    def test_matching_identity(self):
        self.assertTrue(module.certificate_report(OUTPUT, FP)["stableQaCertificateVerified"])
    def test_colon_normalization(self):
        self.assertEqual(module.certificate_report(OUTPUT, ":".join(["AA"] * 32))["certificateSha256"], FP)
    def test_changed_identity_rejected(self):
        with self.assertRaises(ValueError): module.certificate_report(OUTPUT, "b" * 64)
    def test_missing_certificate_rejected(self):
        with self.assertRaises(ValueError): module.certificate_report("")
    def test_multiple_signers_rejected(self):
        with self.assertRaises(ValueError): module.certificate_report(OUTPUT + "\nSigner #2 certificate SHA-256 digest: " + FP)
    def test_malformed_expected_rejected(self):
        with self.assertRaises(ValueError): module.certificate_report(OUTPUT, "invalid")

if __name__ == "__main__": unittest.main()
