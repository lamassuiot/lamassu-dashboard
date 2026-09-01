'use client';

import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Loader2, ArrowLeft, RefreshCw as RefreshCwIcon, AlertTriangle, Info, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, findCaById, signCertificate } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { fetchIssuedCertificate, fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import type { CertificateData } from '@/types/certificate';
import { fetchDevices, type ApiDevice } from '@/lib/devices-api';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { CaVisualizerCard } from '../CaVisualizerCard';
import { DurationInput } from './DurationInput';
import { Alert, AlertDescription as AlertDescUI, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { CodeBlock } from './CodeBlock';
import { get_CMP_API_BASE_URL, get_CA_API_BASE_URL } from '@/lib/api-domains';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS,
} from '@/lib/form-options';
import { Switch } from '@/components/ui/switch';
import {
    buildSelfSignedCsr, initPkijsEngine, arrayBufferToBase64, formatAsPem,
} from '@/lib-crypto';
import { Stepper } from './Stepper';
import { useIsMobile } from '@/hooks/use-mobile';
import { TLS_KEY_USAGES } from '@/lib/certificate-usage-options';
import type { CmpPopoMethod, CmpRevocationReason, CmpGenmInformationTypes } from '@/lib/dms-api';
import { RfcLink } from './RfcLink';
import { CardSelector, type CardSelectorOption } from './CardSelector';

// Standalone recovery script for RFC 9483 §4.1.6 central key generation:
// openssl cmp's own -newkeyout auto-extraction only understands a bare
// OneAsymmetricKey, not the AsymmetricKeyPackage wrapper RFC 9483 mandates
// (see the CKG info alert in step 3), so it fails to decode the delivered
// key — and, since openssl cmp treats that decode failure as fatal to the
// whole exchange, -certout is never written either, even though the response
// carries a valid, issued certificate. This script recovers both with only
// standard `openssl cms`/`openssl x509` primitives plus a small generic DER
// walk — no third-party ASN.1 library. Verified end-to-end (both the happy
// path and the negative case: a wrong trust anchor is correctly rejected)
// against real KTRI responses produced by this backend's own kga package and
// response-marshalling code (not a hand-simulated approximation of the wire
// format — an earlier version of this script's EnvelopedData search matched
// only a literal universal SEQUENCE tag, which a real response never
// contains at that nesting level: privateKey [0] EXPLICIT wraps EncryptedKey,
// whose envelopedData [0] alternative is IMPLICIT, substituting away
// EnvelopedData's own SEQUENCE tag entirely).
const CKG_RECOVER_SCRIPT = `#!/usr/bin/env python3
"""Recover an RFC 9483 (S4.1.6) centrally-generated key -- and the issued
certificate delivered alongside it -- that openssl cmp's own -newkeyout
auto-extraction fails to decode (it only understands a bare OneAsymmetricKey,
not the AsymmetricKeyPackage this server correctly emits). openssl cmp treats
that decode failure as fatal to the whole ir, so it writes neither
-newkeyout nor -certout, even though the response itself carries a valid,
issued certificate.

Pipeline:
  1. Find the CertifiedKeyPair.privateKey EnvelopedData inside a raw ip
     PKIMessage DER file (a generic structural search, not a fixed offset).
  2. Decrypt it with openssl cms -decrypt under the recipient (bootstrap)
     key/cert -> inner SignedData.
  3. Verify/unwrap it with openssl cms -verify -> AsymmetricKeyPackage.
  4. Take the first OneAsymmetricKey out of the AsymmetricKeyPackage SEQUENCE
     OF, and convert it to a PEM private key with openssl pkey.
  5. Separately, find and extract the plain issued certificate
     (CertifiedKeyPair.certOrEncCert) from the same response.

Only Python's standard library + the openssl CLI are used. No third-party
ASN.1 packages required.

Scope: verified against RSA (KTRI / key-transport) bootstrap signers. If your
bootstrap signer is an EC key, the server uses ECDH key agreement (KARI)
instead, and its originator key is referenced by SubjectKeyIdentifier only
(RFC 5652 OriginatorIdentifierOrKey CHOICE) rather than embedded in-band --
openssl cms -decrypt has no way to resolve that reference on its own, so
this script's KARI support is not guaranteed. Prefer an RSA bootstrap signer
when planning to use this recovery path.
"""
import argparse
import subprocess
import sys
import tempfile
import os

UNIVERSAL = 0x00
CONTEXT = 0x80


def parse_tlv(data, offset=0):
    """Parse one DER TLV at offset. Returns (tag_byte, class, constructed,
    tag_number, content_start, content_end, next_offset)."""
    tag_byte = data[offset]
    tag_class = tag_byte & 0xC0
    constructed = bool(tag_byte & 0x20)
    tag_number = tag_byte & 0x1F
    pos = offset + 1
    if tag_number == 0x1F:
        tag_number = 0
        while True:
            b = data[pos]
            tag_number = (tag_number << 7) | (b & 0x7F)
            pos += 1
            if not (b & 0x80):
                break
    length_byte = data[pos]
    pos += 1
    if length_byte & 0x80:
        n = length_byte & 0x7F
        if n == 0:
            raise ValueError("indefinite length DER not supported")
        length = int.from_bytes(data[pos:pos + n], "big")
        pos += n
    else:
        length = length_byte
    content_start = pos
    content_end = pos + length
    return tag_byte, tag_class, constructed, tag_number, content_start, content_end, content_end


def find_enveloped_data(data, start=0, end=None):
    """Depth-first search for content matching EnvelopedData's shape:
    INTEGER version, ([0] originatorInfo)?, SET recipientInfos, SEQUENCE
    encryptedContentInfo, ... -- regardless of what tag wraps that content.

    On the wire, CertifiedKeyPair.privateKey [0] EXPLICIT wraps EncryptedKey,
    whose envelopedData [0] alternative is IMPLICIT -- so EnvelopedData's own
    SEQUENCE (0x30) tag is never actually present; it has been substituted by
    the innermost context tag (verified against a real server response:
    privateKey appears on the wire as A0 <len> A0 <len> <version INTEGER>
    <recipientInfos SET> ..., with no 0x30 anywhere in that chain). Matching
    only a literal universal SEQUENCE tag (as an earlier version of this
    script did) never finds it. Returns the raw CONTENT bytes (no tag/length
    header of its own) so the caller re-wraps them under a fresh SEQUENCE tag
    to reconstruct standard EnvelopedData DER.
    """
    if end is None:
        end = len(data)
    pos = start
    while pos < end:
        tag_byte, tag_class, constructed, tag_number, cstart, cend, nxt = parse_tlv(data, pos)
        if constructed:
            children = []
            p = cstart
            while p < cend:
                ctag_byte, ctag_class, cconstructed, ctag_number, ccstart, ccend, cnxt = parse_tlv(data, p)
                children.append((ctag_class, ctag_number, ccstart, ccend))
                p = cnxt
            if len(children) >= 3 and children[0][0] == UNIVERSAL and children[0][1] == 0x02:
                version_bytes = data[children[0][2]:children[0][3]]
                version_ok = len(version_bytes) == 1 and 0 <= version_bytes[0] <= 4
                idx = 1
                if idx < len(children) and children[idx][0] == CONTEXT and children[idx][1] == 0:
                    idx += 1
                has_recipient_infos = idx < len(children) and children[idx][0] == UNIVERSAL and children[idx][1] == 0x11
                has_enc_content_info = idx + 1 < len(children) and children[idx + 1][0] == UNIVERSAL and children[idx + 1][1] == 0x10
                if version_ok and has_recipient_infos and has_enc_content_info:
                    return data[cstart:cend]
            found = find_enveloped_data(data, cstart, cend)
            if found is not None:
                return found
        pos = nxt
    return None


def find_certificate(data, start=0, end=None):
    """Depth-first search for a plain X.509 certificate: a constructed node
    whose content is a single element, itself a universal SEQUENCE with
    exactly 3 children [SEQUENCE tbsCertificate, SEQUENCE signatureAlgorithm,
    BIT STRING signature] -- Certificate's fixed shape (RFC 5280 section 4.1).

    CertifiedKeyPair.certOrEncCert's certificate [0] alternative wraps the
    complete certificate DER verbatim (EXPLICIT-style: the cert's own
    SEQUENCE tag is preserved inside the wrapper, unlike privateKey's
    IMPLICIT envelopedData [0] -- verified against a real response). So the
    match returned here already includes its own valid SEQUENCE tag/length
    and can be used directly as a DER certificate with no re-wrapping.
    """
    if end is None:
        end = len(data)
    pos = start
    while pos < end:
        tag_byte, tag_class, constructed, tag_number, cstart, cend, nxt = parse_tlv(data, pos)
        if constructed:
            inner_children = list(_iter_children(data, cstart, cend))
            if len(inner_children) == 1:
                itag_class, itag_number, iconstructed, iheader_start, icstart, icend = inner_children[0]
                if itag_class == UNIVERSAL and itag_number == 0x10 and iconstructed:
                    cert_children = list(_iter_children(data, icstart, icend))
                    if (len(cert_children) == 3
                            and cert_children[0][0] == UNIVERSAL and cert_children[0][1] == 0x10
                            and cert_children[1][0] == UNIVERSAL and cert_children[1][1] == 0x10
                            and cert_children[2][0] == UNIVERSAL and cert_children[2][1] == 0x03
                            and not cert_children[2][2]):
                        return data[iheader_start:icend]
            found = find_certificate(data, cstart, cend)
            if found is not None:
                return found
        pos = nxt
    return None


def _iter_children(data, start, end):
    pos = start
    while pos < end:
        header_start = pos
        tag_byte, tag_class, constructed, tag_number, cstart, cend, nxt = parse_tlv(data, pos)
        yield tag_class, tag_number, constructed, header_start, cstart, cend
        pos = nxt


def find_ktri_recipient_ski(env_data_content):
    """Best-effort: return the first ktri RecipientInfo's subjectKeyIdentifier
    bytes from EnvelopedData CONTENT, or None if this response uses a
    different RecipientIdentifier (issuerAndSerialNumber) or a non-ktri (kari)
    RecipientInfo -- callers should skip any pre-check in that case, not fail.
    Used only to give a clear, specific error instead of openssl's generic
    "Error decrypting CMS using private key" when --recipient-cert simply
    isn't the certificate this response was encrypted to (e.g. stale files
    from a different wizard run: a fresh bootstrap cert is minted every time
    the Bootstrap step runs, and it must match the ir that produced --response).
    """
    children = list(_iter_children(env_data_content, 0, len(env_data_content)))
    idx = 1
    if idx < len(children) and children[idx][0] == CONTEXT and children[idx][1] == 0:
        idx += 1
    if idx >= len(children) or not (children[idx][0] == UNIVERSAL and children[idx][1] == 0x11):
        return None
    _, _, _, _, rinfos_cstart, rinfos_cend = children[idx]
    rinfo_children = list(_iter_children(env_data_content, rinfos_cstart, rinfos_cend))
    if not rinfo_children:
        return None
    itag_class, itag_number, iconstructed, iheader_start, icstart, icend = rinfo_children[0]
    if not (itag_class == UNIVERSAL and itag_number == 0x10):
        return None  # not ktri (e.g. kari's [1] alternative)
    ktri_children = list(_iter_children(env_data_content, icstart, icend))
    if len(ktri_children) < 2:
        return None
    rid_class, rid_number, rid_constructed, rid_header_start, rid_cstart, rid_cend = ktri_children[1]
    if rid_class == CONTEXT and rid_number == 0:
        return env_data_content[rid_cstart:rid_cend]
    return None  # issuerAndSerialNumber alternative -- not checked


def wrap_content_info(content_type_oid_der, content_der):
    """Wrap content in a full CMS ContentInfo: SEQUENCE { OID, [0] EXPLICIT content }."""
    explicit0 = _der_tlv(0xA0, content_der)
    seq_content = content_type_oid_der + explicit0
    return _der_tlv(0x30, seq_content)


def _der_len(n):
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(b)]) + b


def _der_tlv(tag, content):
    return bytes([tag]) + _der_len(len(content)) + content


OID_ENVELOPED_DATA = bytes.fromhex("06092a864886f70d010703")  # 1.2.840.113549.1.7.3
OID_SIGNED_DATA = bytes.fromhex("06092a864886f70d010702")  # 1.2.840.113549.1.7.2


def openssl(*args, input_bytes=None):
    proc = subprocess.run(["openssl", *args], input=input_bytes,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr.decode(errors="replace"))
        raise SystemExit(f"openssl {' '.join(args)} failed (exit {proc.returncode})")
    return proc.stdout


def wrap_enveloped_data_content(content):
    """Re-wrap EnvelopedData CONTENT bytes (found by find_enveloped_data,
    which never include their own header) under a fresh universal SEQUENCE
    tag to reconstruct standard EnvelopedData DER."""
    return _der_tlv(0x30, content)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--response", required=True, help="Raw ip PKIMessage DER (e.g. from openssl cmp -rspout)")
    ap.add_argument("--recipient-key", required=True, help="Bootstrap/recipient private key PEM")
    ap.add_argument("--recipient-cert", required=True, help="Bootstrap/recipient certificate PEM")
    ap.add_argument("--trusted-ca", help="Trust anchor PEM (e.g. the same enrollca.pem the ir command already fetches) to validate the KGA's signing certificate against. Strongly recommended: without it the signature is checked but the signer's identity is not.")
    ap.add_argument("--out", required=True, help="Output private key PEM path")
    ap.add_argument("--cert-out", help="Output issued-certificate PEM path (openssl cmp also fails to write -certout when central-key-generation decode fails, even though the response carries a valid certificate)")
    args = ap.parse_args()

    if not args.trusted_ca:
        print("WARNING: no --trusted-ca given — the KGA signature will be checked "
              "cryptographically but the signer certificate's chain of trust will "
              "NOT be validated. Pass --trusted-ca enrollca.pem (the same file the "
              "ir command fetches) to validate it properly.", file=sys.stderr)

    with open(args.response, "rb") as f:
        response_der = f.read()

    if args.cert_out:
        cert_der = find_certificate(response_der)
        if cert_der is None:
            print("WARNING: could not locate a certificate inside --response; skipping --cert-out", file=sys.stderr)
        else:
            with tempfile.TemporaryDirectory() as certtmp:
                cert_der_path = os.path.join(certtmp, "cert.der")
                with open(cert_der_path, "wb") as f:
                    f.write(cert_der)
                cert_pem = openssl("x509", "-inform", "DER", "-in", cert_der_path)
            with open(args.cert_out, "wb") as f:
                f.write(cert_pem)
            print(f"Recovered certificate written to {args.cert_out}")

    env_data_content = find_enveloped_data(response_der)
    if env_data_content is None:
        raise SystemExit("Could not locate an EnvelopedData structure inside --response")

    # Best-effort pre-check: if this response's ktri RecipientInfo names its
    # recipient by subjectKeyIdentifier (the common case for Lamassu-issued
    # certs), compare it against --recipient-cert's own SKI *before* calling
    # openssl. A mismatch here means --response/--recipient-key/--recipient-cert
    # don't all come from the same wizard run -- otherwise this fails deep
    # inside openssl cms -decrypt with just "Error decrypting CMS using
    # private key" and no indication of why.
    try:
        response_ski = find_ktri_recipient_ski(env_data_content)
        if response_ski is not None:
            ext_out = openssl("x509", "-in", args.recipient_cert, "-noout", "-ext", "subjectKeyIdentifier")
            hex_line = ext_out.decode().strip().splitlines()[-1]
            cert_ski = bytes.fromhex(hex_line.replace(":", "").strip())
            if cert_ski != response_ski:
                raise SystemExit(
                    "--recipient-cert does not match the recipient this response was "
                    "encrypted to (subjectKeyIdentifier mismatch: cert has "
                    f"{cert_ski.hex()}, response expects {response_ski.hex()}). "
                    "--response, --recipient-key and --recipient-cert must all come from "
                    "the SAME wizard run -- a fresh bootstrap cert is minted every time "
                    "the Bootstrap step runs, and it must match the ir that produced "
                    "--response. Re-fetch a matching bootstrap.crt/bootstrap.key/ip.der "
                    "triple and try again."
                )
    except SystemExit:
        raise
    except Exception:
        pass  # diagnostic only -- never block the real attempt below on it

    env_data_der = wrap_enveloped_data_content(env_data_content)

    with tempfile.TemporaryDirectory() as tmp:
        env_ci = os.path.join(tmp, "env.ci.der")
        with open(env_ci, "wb") as f:
            f.write(wrap_content_info(OID_ENVELOPED_DATA, env_data_der))

        signed_data_der = openssl(
            "cms", "-decrypt", "-inform", "DER", "-in", env_ci,
            "-inkey", args.recipient_key, "-recip", args.recipient_cert,
        )

        sd_ci = os.path.join(tmp, "sd.ci.der")
        with open(sd_ci, "wb") as f:
            f.write(wrap_content_info(OID_SIGNED_DATA, signed_data_der))

        # -purpose any: the KGA cert carries id-kp-cmKGA (RFC 9483), not
        # id-kp-emailProtection, so openssl's default S/MIME-signer purpose
        # check would reject it as "unsuitable certificate purpose" even
        # when the chain and signature are otherwise entirely valid.
        verify_args = ["cms", "-verify", "-inform", "DER", "-in", sd_ci, "-purpose", "any"]
        if args.trusted_ca:
            verify_args += ["-CAfile", args.trusted_ca]
        else:
            verify_args += ["-noverify"]
        akp_der = openssl(*verify_args)

        # AsymmetricKeyPackage ::= SEQUENCE OF OneAsymmetricKey. Take the
        # first (only) element out of the outer SEQUENCE OF wrapper.
        tag_byte, tag_class, constructed, tag_number, cstart, cend, _ = parse_tlv(akp_der, 0)
        if not (tag_class == UNIVERSAL and tag_number == 0x10):
            raise SystemExit("Unexpected AsymmetricKeyPackage encoding (not a SEQUENCE)")
        one_key_der = akp_der[cstart:cend]
        # Only the first OneAsymmetricKey is used — an ip response delivers a
        # single generated key.
        _, _, _, _, k_cstart, k_cend, k_next = parse_tlv(one_key_der, 0)
        one_key_der = one_key_der[0:k_next]

        onekey_path = os.path.join(tmp, "onekey.der")
        with open(onekey_path, "wb") as f:
            f.write(one_key_der)

        key_pem = openssl("pkey", "-inform", "DER", "-in", onekey_path)
        with open(args.out, "wb") as f:
            f.write(key_pem)

    print(f"Recovered private key written to {args.out}")


if __name__ == "__main__":
    main()
`;

// Subset of the RA shape we read for CMP enrollment. Mirrors the structure
// EstEnrollModal uses but pivots on the cmp_settings container instead of the
// EST branch. validation_cas is the list the DMS chain-validates the CMP
// signer against (RFC-9483 mirror of EST mTLS auth), so the bootstrap signer
// picker only shows CAs from that list.
interface ApiRaItem {
    id: string;
    name: string;
    settings: {
        protocol: string;
        cmp_settings?: {
            enrollment_settings: {
                enrollment_ca: string;
                client_certificate_settings?: {
                    validation_cas: string[];
                };
                // CMP's own wire convention for "no client auth" is the literal
                // NONE (EST uses NO_AUTH). Drives whether a bootstrap signer /
                // -srvcert / -trusted chain is needed at all.
                auth_mode?: 'CLIENT_CERTIFICATE' | 'EXTERNAL_WEBHOOK' | 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK' | 'NONE';
                // When true the server honours id-it-implicitConfirm and skips
                // the certConf round-trip; when false openssl auto-sends certConf.
                accept_implicit?: boolean;
                // Requires proof-of-possession — openssl generates it whenever
                // -newkey differs from -key, which is always the case here.
                enforce_popo?: boolean;
                // Serial of the cert the DMS signs its CMP responses with; when
                // set the client can pin it via -srvcert.
                protection_certificate?: string;
                // 'direct' (synchronous issuance) or 'phased' (admin-approved).
                // Absent/anything else is treated as 'direct'.
                workflow?: string;
                // Per-operation RFC011 blocks the wizard adapts its ir/kur/rr
                // commands to. Every field here can make the DMS reject a
                // request, so the wizard reads them to either shape the command
                // or warn the operator instead of generating a doomed command.
                ir?: {
                    enabled?: boolean;
                    proof_of_possession?: {
                        allowed_methods?: CmpPopoMethod[];
                    };
                    // RFC 4211 CRMF registration controls. openssl cmp cannot
                    // attach these, so a `required` mode means the wizard's ir
                    // cannot succeed and must warn.
                    registration_token?: { mode?: 'disabled' | 'optional' | 'required' };
                    authenticator_control?: { mode?: 'disabled' | 'optional' | 'required' };
                    policy_overrides?: {
                        confirmation?: 'inherit' | 'implicit' | 'explicit';
                    };
                    // RFC 9483 §4.1.6 central key generation opt-in (unified
                    // with the DMS-general server_key_gen_enabled by backend
                    // resolution, so this field alone reflects the effective
                    // state). Gates the "generate key on server" option below.
                    central_key_generation?: { enabled?: boolean };
                };
                cr?: {
                    enabled?: boolean;
                    proof_of_possession?: {
                        allowed_methods?: CmpPopoMethod[];
                    };
                    policy_overrides?: {
                        confirmation?: 'inherit' | 'implicit' | 'explicit';
                    };
                };
                p10cr?: {
                    enabled?: boolean;
                    policy_overrides?: {
                        confirmation?: 'inherit' | 'implicit' | 'explicit';
                    };
                };
                kur?: {
                    enabled?: boolean;
                    policy_overrides?: {
                        confirmation?: 'inherit' | 'implicit' | 'explicit';
                    };
                };
                rr?: {
                    enabled?: boolean;
                    allowed_reasons?: CmpRevocationReason[];
                };
                // General Messages (genm/genp, RFC 9483 §4.3). The wizard reads
                // access_policy to decide whether the genm try-it commands need a
                // signed request, and information_types to list one command per
                // endpoint the DMS actually answers.
                genm?: {
                    enabled?: boolean;
                    access_policy?: 'public_discovery' | 'require_signed';
                    information_types?: Partial<CmpGenmInformationTypes>;
                    preferred_symmetric_algorithm?: string;
                };
            };
        } | null;
    };
}

interface CmpEnrollModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    ra: ApiRaItem | null;
    initialDeviceId?: string;
    presentation?: 'dialog' | 'inline' | 'sheet';
    className?: string;
}

type CmpEnrollmentOperation = 'ir' | 'cr' | 'kur' | 'p10cr' | 'rr' | 'genm';
type CmpConfirmationMode = 'implicit' | 'explicit';

// The genm support messages the wizard can drive from `openssl cmp -cmd genm
// -infotype <name>`. openssl prepends `id-it-` to the name and resolves it via
// its OBJ database, so each `opensslName` is the suffix of a known id-it-*
// short name. `since` flags the OpenSSL version that first shipped the OBJ
// entry (the older discovery types resolve on any 3.x). supported_languages is
// intentionally absent: its request MUST carry the offered language list, which
// `openssl cmp -infotype` cannot attach, so a plain command would be rejected.
//
// `outputFlags` supplies the extra flags openssl requires (or accepts) to save
// that response's payload — verified empirically against `openssl cmp -help`
// and by running each -infotype against a throwaway server: caCerts,
// rootCaCert, certReqTemplate and crlStatusList each hard-fail client-side
// ("Missing -X option") without them; signKeyPairTypes/encKeyPairTypes/
// preferredSymmAlg/currentCRL have no dedicated output (openssl only warns
// "No specific support for -infotype X available" and still sends the
// request), so they're left undefined.
const GENM_INFOTYPE_COMMANDS: { key: keyof CmpGenmInformationTypes; opensslName: string; label: string; since?: string; outputFlags?: string[] }[] = [
    { key: 'ca_certificates', opensslName: 'caCerts', label: 'CA certificates', since: '3.2', outputFlags: [`-cacertsout cacerts.pem`] },
    { key: 'signing_key_types', opensslName: 'signKeyPairTypes', label: 'Signing key types' },
    { key: 'encryption_key_types', opensslName: 'encKeyPairTypes', label: 'Encryption key types' },
    { key: 'preferred_symmetric_algorithm', opensslName: 'preferredSymmAlg', label: 'Preferred symmetric algorithm' },
    {
        key: 'root_ca_update', opensslName: 'rootCaCert', label: 'Root CA update', since: '3.4',
        // -newwithnew is mandatory (openssl refuses to build the request without
        // it); -newwithold/-oldwithnew are optional but capture the full
        // RFC 9483 §4.3.2 RootCaKeyUpdateValue when the CA returns them.
        outputFlags: [`-newwithnew newwithnew.crt`, `-newwithold newwithold.crt`, `-oldwithnew oldwithnew.crt`],
    },
    {
        key: 'certificate_request_template', opensslName: 'certReqTemplate', label: 'Certificate request template', since: '3.4',
        outputFlags: [`-template certtemplate.der`, `-keyspec keyspec.der`],
    },
    { key: 'current_crl', opensslName: 'currentCRL', label: 'Current CRL' },
    {
        key: 'crl_update', opensslName: 'crlStatusList', label: 'CRL update', since: '3.4',
        // -crlcert names a certificate to identify the target CA (its issuer);
        // the enrollment CA cert itself works since it's self-issued.
        outputFlags: [`-crlcert enrollca.pem`, `-crlout crl.der`],
    },
];

const CMP_ENROLLMENT_OPERATIONS: CardSelectorOption<CmpEnrollmentOperation>[] = [
    {
        value: 'ir',
        label: 'Initialization Request (IR)',
        description: 'Initialization Request. Join a new PKI with CRMF, using a bootstrap credential and CRMF proof of possession.',
        icon: ShieldCheck,
    },
    {
        value: 'cr',
        label: 'Certification Request (CR)',
        description: 'Certification Request. Obtain an additional certificate with CRMF, authenticated by an existing target-PKI certificate.',
        icon: ShieldCheck,
    },
    {
        value: 'kur',
        label: 'Key Update Request (KUR)',
        description: 'Key Update Request. Replace a valid certificate with CRMF, authenticated by the certificate being updated; subject and SAN remain unchanged.',
        icon: ShieldCheck,
    },
    {
        value: 'p10cr',
        label: 'PKCS #10 Certification Request (P10CR)',
        description: 'PKCS #10 Certification Request. Request a certificate with a self-signed PKCS #10 CSR; authentication comes from the enrollment flow.',
        icon: ShieldCheck,
    },
    {
        value: 'rr',
        label: 'Revocation Request (RR)',
        description: 'Revocation Request. Revoke an existing certificate, authenticated by the certificate being revoked. No new certificate is issued.',
        icon: ShieldCheck,
    },
    {
        value: 'genm',
        label: 'General Messages (GENM/GENP)',
        description: 'Informational queries. Try each id-it support message this RA answers (CA certs, root CA update, CRLs, cert request template…). No certificate is issued.',
        icon: Info,
    },
];

const CMP_OPERATION_NAMES: Record<CmpEnrollmentOperation, string> = {
    ir: 'Initialization Request (IR)',
    cr: 'Certification Request (CR)',
    kur: 'Key Update Request (KUR)',
    p10cr: 'PKCS #10 Certification Request (P10CR)',
    rr: 'Revocation Request (RR)',
    genm: 'General Messages (GENM/GENP)',
};

const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;

// challenge_response / encrypted_certificate are RFC 4211 §4.1's "indirect"
// POPO methods (keyEncipherment/keyAgreement CertReq.popo, subsequentMessage
// encrCert/challengeResp): possession is proven by decrypting a subsequent
// message instead of signing, for keys that can't sign at all (a pure RSA
// encryption key, or an EC key-agreement key). They are NOT tied to central
// key generation — CKG happens to reuse the same KTRI/KARI wire primitives to
// deliver a server-generated key, but the backend's own encrCert/challengeResp
// handlers (buildEncryptedCertRepBody / handlePOPOChallenge) encrypt to
// whatever public key is in the CertTemplate, regardless of who generated it.
// A device generating its own RSA key locally can use encrypted_certificate
// exactly the same way (see popoUsableInWizard / the Device Key Type gating
// in step 3).
//
// challenge_response is disabled unconditionally, but for a DIFFERENT reason
// than previously documented here: openssl cmp's `-popo` option has no value
// that declares the challengeResp SubsequentMessage alternative at all — only
// encrCert (via `-popo 2`) is reachable from this client. This was verified
// empirically against a real server: `-popo 2` always produces encrCert, and
// a DMS configured to allow only challenge_response rejects it with
// "encrypted-certificate proof of possession is not permitted for this DMS".
// keyAgreement (EC) POPO is also unreachable from openssl regardless of
// method — its `-popo` range is documented (and enforced) as -1..2, with no
// value 3 for KEYAGREEMENT — so encrypted_certificate additionally requires
// an RSA device key (see the Device Key Type gating in step 3).
const POPO_METHOD_INFO: Record<CmpPopoMethod, { label: string }> = {
    trusted_ra: { label: 'RA Verified' },
    signature: { label: 'Signature' },
    encrypted_certificate: { label: 'Encrypted Certificate (RSA only)' },
    challenge_response: { label: 'Challenge Response' },
};

const CRMF_POPO_METHODS: CmpPopoMethod[] = [
    'trusted_ra',
    'signature',
    'encrypted_certificate',
    'challenge_response',
];

// RFC 5280 CRLReason codes for `openssl cmp -revreason`, keyed by the DMS's
// CmpRevocationReason names (the backend's cmpRevocationReasonName maps codes
// 0–5 back to these). Used to pin an rr to a reason the DMS's
// rr.allowed_reasons actually permits.
const REVOCATION_REASON_CODE: Record<CmpRevocationReason, number> = {
    unspecified: 0,
    key_compromise: 1,
    ca_compromise: 2,
    affiliation_changed: 3,
    superseded: 4,
    cessation_of_operation: 5,
};

function encodeToBase64(pem: string): string {
    if (!pem.trim()) return '';
    try {
        return btoa(unescape(encodeURIComponent(pem)));
    } catch {
        return '';
    }
}

export const CmpEnrollModal: React.FC<CmpEnrollModalProps> = ({
    isOpen,
    onOpenChange,
    ra,
    initialDeviceId,
    presentation = 'dialog',
    className,
}) => {
    const isMobile = useIsMobile();
    const resolvedPresentation = presentation === 'inline' && isMobile ? 'dialog' : presentation;

    // ── Dependencies ────────────────────────────────────────────────────────
    const [availableCAs, setAvailableCAs] = useState<CA[]>([]);
    const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
    const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
    const [errorDependencies, setErrorDependencies] = useState<string | null>(null);
    // The protection certificate (which signs every CMP response) is picked
    // independently of the enrollment CA — the RA settings' certificate picker
    // has no CA restriction, so an operator can select a cert from any CA. If
    // its issuer differs from enrollment_ca, the wizard's trust anchor must
    // include both or openssl fails to validate the response's signer chain.
    const [protectionCertIssuerCaId, setProtectionCertIssuerCaId] = useState<string | null>(null);

    // ── Wizard state ────────────────────────────────────────────────────────
    const [step, setStep] = useState(1);
    const [selectedOperation, setSelectedOperation] = useState<CmpEnrollmentOperation>('ir');
    const [confirmationMode, setConfirmationMode] = useState<CmpConfirmationMode>('explicit');
    const [deviceId, setDeviceId] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Step 3: bootstrap signer issuance
    const [bootstrapSigner, setBootstrapSigner] = useState<CA | null>(null);
    const [bootstrapValidity, setBootstrapValidity] = useState('1h');
    const [bootstrapCn, setBootstrapCn] = useState('');
    const [selectableSigners, setSelectableSigners] = useState<CA[]>([]);
    const [bootstrapKeygenType, setBootstrapKeygenType] = useState('RSA');
    const [bootstrapKeygenSpec, setBootstrapKeygenSpec] = useState('2048');

    // Step 3/4: device cert key params (used for openssl cmp -newkey)
    const [deviceKeygenType, setDeviceKeygenType] = useState('EC');
    const [deviceKeygenSpec, setDeviceKeygenSpec] = useState('P-256');
    // RFC 9483 §4.1.6 central key generation opt-in — 'device' (default) keeps
    // the wizard's existing -newkey flow; 'server' switches the ir command to
    // -centralkeygen/-newkeyout. Only meaningful for selectedOperation 'ir'
    // (the only request this wizard renders a command for that could use it).
    const [keygenMethod, setKeygenMethod] = useState<'device' | 'server'>('device');

    // Step 4: issued bootstrap material
    const [bootstrapCertificate, setBootstrapCertificate] = useState('');
    const [bootstrapPrivateKey, setBootstrapPrivateKey] = useState('');

    // Step 5: command rendering options
    const [pinProtectionCert, setPinProtectionCert] = useState(true);
    const [popoMethod, setPopoMethod] = useState<CmpPopoMethod>('signature');
    // Which single id-it information type the step-5 genm/genp selector renders a
    // command for (mirrors the step-1 request-type picker: one request at a
    // time). Never reset explicitly — effectiveGenmType below falls back to the
    // first RA-enabled type, so a stale/empty value self-heals when the RA or its
    // enabled information_types change.
    const [selectedGenmType, setSelectedGenmType] = useState<keyof CmpGenmInformationTypes | ''>('');

    // Existing issued certificates for this device (subject CN == deviceId).
    // KUR renews one of these; RR can optionally revoke one. Unlike ir/cr, these
    // operate on a certificate that already exists in the backend rather than
    // one produced earlier in this same wizard session, so the operator selects
    // it here instead of the command assuming a <deviceId>.crt file is present.
    const [deviceCerts, setDeviceCerts] = useState<CertificateData[]>([]);
    const [isLoadingDeviceCerts, setIsLoadingDeviceCerts] = useState(false);
    // Serial of the existing cert the step-3 picker targets — the cert KUR
    // renews or (when RR is the chosen operation) the cert RR revokes. Empty ⇒
    // none selected (command falls back to a placeholder the operator fills in).
    const [existingCertSerial, setExistingCertSerial] = useState('');
    // Serial the step-5 RR *companion* revokes (only shown for ir/cr/kur/p10cr).
    // Empty ⇒ the certificate the enrollment command above just issued.
    const [revokeCertSerial, setRevokeCertSerial] = useState('');

    // Existing devices registered under this RA, so step 1 can offer picking
    // one (useful for kur/rr, which act on a device that already enrolled)
    // instead of only typing/generating a fresh device ID.
    const [raDevices, setRaDevices] = useState<ApiDevice[]>([]);
    const [isLoadingRaDevices, setIsLoadingRaDevices] = useState(false);

    // ── Effects ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            setIsLoadingDependencies(true);
            setErrorDependencies(null);
            try {
                const [casData, enginesData] = await Promise.all([
                    fetchAndProcessCAs(),
                    fetchCryptoEngines(),
                ]);
                setAvailableCAs(casData);
                setAllCryptoEngines(enginesData);
            } catch (err: any) {
                setErrorDependencies(err.message || 'Failed to load required data.');
            } finally {
                setIsLoadingDependencies(false);
            }
        };
        load();
    }, [isOpen]);

    // Load the device's existing ACTIVE certificates (subject CN == deviceId)
    // so KUR/RR can target a real, already-issued cert. Keyed on deviceId — for
    // the common case it's a fixed GUID set once; a manual edit refetches, which
    // is acceptable. Only the public certificate is fetched; the matching
    // private key stays on the device and the operator supplies it themselves.
    useEffect(() => {
        if (!isOpen || !deviceId.trim()) { setDeviceCerts([]); return; }
        let cancelled = false;
        const load = async () => {
            setIsLoadingDeviceCerts(true);
            try {
                const params = new URLSearchParams({ sort_by: 'valid_from', sort_mode: 'desc', page_size: '50' });
                params.append('filter', 'status[equal]ACTIVE');
                params.append('filter', `subject.common_name[equal]${deviceId.trim()}`);
                const { certificates } = await fetchIssuedCertificates({ apiQueryString: params.toString() });
                if (cancelled) return;
                const leaves = certificates.filter((c) => !c.rawApiData?.is_ca);
                setDeviceCerts(leaves);
                // Default the KUR selection to the most recent cert; also reset
                // if the previously-selected serial isn't in the new list (e.g.
                // the device id changed), so we never keep a stale selection.
                setExistingCertSerial((prev) =>
                    leaves.some((c) => c.serialNumber === prev) ? prev : (leaves[0]?.serialNumber ?? ''));
                setRevokeCertSerial((prev) =>
                    leaves.some((c) => c.serialNumber === prev) ? prev : '');
            } catch {
                if (!cancelled) setDeviceCerts([]);
            } finally {
                if (!cancelled) setIsLoadingDeviceCerts(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [isOpen, deviceId]);

    // Load the devices registered under this RA so step 1 can offer selecting
    // an existing one. Skipped when the wizard is opened for a fixed device
    // (initialDeviceId), since the id is then locked.
    useEffect(() => {
        if (!isOpen || !ra?.id || initialDeviceId) { setRaDevices([]); return; }
        let cancelled = false;
        const load = async () => {
            setIsLoadingRaDevices(true);
            try {
                const params = new URLSearchParams({ sort_by: 'creation_timestamp', sort_mode: 'desc', page_size: '100' });
                params.append('filter', `dms_owner[equal]${ra.id}`);
                const result = await fetchDevices(params);
                if (!cancelled) setRaDevices(result.list ?? []);
            } catch {
                if (!cancelled) setRaDevices([]);
            } finally {
                if (!cancelled) setIsLoadingRaDevices(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [isOpen, ra?.id, initialDeviceId]);

    useEffect(() => {
        if (!isOpen) return;
        const newDeviceId = initialDeviceId || crypto.randomUUID();
        setStep(1);
        setSelectedOperation('ir');
        setDeviceId(newDeviceId);
        setBootstrapCn(newDeviceId);
        setBootstrapValidity('1h');
        setBootstrapCertificate('');
        setBootstrapPrivateKey('');
        setBootstrapKeygenType('RSA');
        setBootstrapKeygenSpec('2048');
        // deviceKeygenType/Spec and keygenMethod are NOT reset here — this
        // effect re-fires whenever availableCAs changes (it's in the dep array
        // below, and the CA fetch resolves asynchronously after the modal
        // opens). Resetting them here would stomp the DMS-adaptive choices the
        // other effect (deps: selectedOperation) makes right after mount — in
        // particular the RSA lock it applies when a DMS's only usable POPO is
        // encrypted_certificate. That effect owns both entirely.
        setPinProtectionCert(true);

        if (ra && availableCAs.length > 0) {
            const validationCaIds =
                ra.settings.cmp_settings?.enrollment_settings.client_certificate_settings?.validation_cas ?? [];
            const signers = validationCaIds
                .map((id) => findCaById(id, availableCAs))
                .filter((c): c is CA => !!c);
            setSelectableSigners(signers);
            const def = signers.length > 0 ? signers[0] : null;
            setBootstrapSigner(def);
            if (def?.defaultIssuanceLifetime && DURATION_REGEX.test(def.defaultIssuanceLifetime)) {
                setBootstrapValidity(def.defaultIssuanceLifetime);
            }
        } else {
            setBootstrapSigner(null);
            setSelectableSigners([]);
        }
    }, [isOpen, ra, availableCAs, initialDeviceId]);

    useEffect(() => {
        if (!isOpen) return;

        // Central key generation only applies to ir here (see keygenMethod's
        // doc comment) — switching to any other operation makes a stale
        // 'server' choice both meaningless and inconsistent with the device
        // key parameters that operation's command actually uses.
        if (selectedOperation !== 'ir') setKeygenMethod('device');

        // Baseline device key type (EC), owned here rather than in the
        // availableCAs-dependent reset effect so it can't be stomped by that
        // effect re-firing when CAs load async. The encrypted_certificate
        // branch below overrides this to RSA (its only openssl-supported key
        // type) when that's the effective default POPO.
        setDeviceKeygenType('EC');
        setDeviceKeygenSpec('P-256');

        const resetCmp = ra?.settings.cmp_settings?.enrollment_settings;
        const selectedSettings =
            selectedOperation === 'ir' ? resetCmp?.ir
            : selectedOperation === 'cr' ? resetCmp?.cr
            : selectedOperation === 'kur' ? resetCmp?.kur
            : resetCmp?.p10cr;
        const confirmationOverride = selectedSettings?.policy_overrides?.confirmation;
        const supportsImplicit =
            confirmationOverride === 'implicit'
            || (confirmationOverride !== 'explicit' && (resetCmp?.accept_implicit ?? false));
        setConfirmationMode(supportsImplicit ? 'implicit' : 'explicit');

        if (selectedOperation !== 'ir' && selectedOperation !== 'cr') {
            setPopoMethod('signature');
            return;
        }

        // IR and CR expose configurable CRMF PoP methods. Prefer signature for
        // this client-generated-key flow, then raVerified when the request has
        // a trusted message-protection signer.
        const resetAuthMode = resetCmp?.auth_mode ?? 'CLIENT_CERTIFICATE';
        const resetRequiresClientCert =
            resetAuthMode === 'CLIENT_CERTIFICATE'
            || resetAuthMode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
        const resetAllowed =
            (selectedOperation === 'ir'
                ? resetCmp?.ir?.proof_of_possession?.allowed_methods
                : resetCmp?.cr?.proof_of_possession?.allowed_methods)
            ?? ['signature', 'trusted_ra'];
        const usable = resetAllowed.filter(
            (method) =>
                method === 'signature'
                || (method === 'trusted_ra' && resetRequiresClientCert)
                || method === 'encrypted_certificate',
        );
        // Fall back to 'signature' when nothing is usable — NOT to
        // resetAllowed[0]. This DMS may only permit challenge_response
        // (never producible by openssl cmp, see POPO_METHOD_INFO's doc
        // comment), and defaulting to it would silently select a value the
        // dropdown itself refuses to let the user click.
        const defaultPopo: CmpPopoMethod =
            usable.includes('signature') ? 'signature'
            : usable.includes('trusted_ra') ? 'trusted_ra'
            : usable.includes('encrypted_certificate') ? 'encrypted_certificate'
            : 'signature';
        setPopoMethod(defaultPopo);
        if (defaultPopo === 'encrypted_certificate') {
            setDeviceKeygenType('RSA');
            setDeviceKeygenSpec('2048');
        }

        // Adapt to the DMS: when ir's allow-list has NO method the wizard can
        // produce at all (usable is empty — this DMS only accepts
        // challenge_response, which openssl cmp can never produce) but the
        // DMS DOES support central key generation, default straight into it
        // instead of leaving every option in the POPO selector permanently
        // disabled.
        if (selectedOperation === 'ir') {
            const resetCkgAvailable = resetRequiresClientCert && (resetCmp?.ir?.central_key_generation?.enabled ?? false);
            setKeygenMethod(usable.length === 0 && resetCkgAvailable ? 'server' : 'device');
        }
    }, [isOpen, ra, selectedOperation]);

    useEffect(() => {
        setProtectionCertIssuerCaId(null);
        if (!isOpen) return;
        const serial = ra?.settings.cmp_settings?.enrollment_settings.protection_certificate;
        if (!serial) return;
        let isCancelled = false;
        fetchIssuedCertificate(serial)
            .then((cert) => { if (!isCancelled) setProtectionCertIssuerCaId(cert.issuerCaId ?? null); })
            .catch(() => { if (!isCancelled) setProtectionCertIssuerCaId(null); });
        return () => { isCancelled = true; };
    }, [isOpen, ra]);

    useEffect(() => { initPkijsEngine(); }, []);

    // ── Form handlers ──────────────────────────────────────────────────────
    const handleBootstrapKeygenTypeChange = (t: string) => {
        setBootstrapKeygenType(t);
        setBootstrapKeygenSpec(t === 'RSA' ? '2048' : 'P-256');
    };
    const handleDeviceKeygenTypeChange = (t: string) => {
        setDeviceKeygenType(t);
        setDeviceKeygenSpec(t === 'RSA' ? '2048' : 'P-256');
    };
    // encrypted_certificate (openssl -popo 2) only exists for RSA keys — there
    // is no openssl-reachable keyAgreement (EC) equivalent — so picking it
    // switches the device key type to RSA immediately, before the user even
    // reaches the Bootstrap step where that selector lives.
    const handlePopoMethodChange = (method: CmpPopoMethod) => {
        setPopoMethod(method);
        if (method === 'encrypted_certificate' && deviceKeygenType !== 'RSA') {
            setDeviceKeygenType('RSA');
            setDeviceKeygenSpec('2048');
        }
    };
    const handleBootstrapSignerChange = (caId: string) => {
        const sel = selectableSigners.find((s) => s.id === caId) || null;
        setBootstrapSigner(sel);
        if (sel?.defaultIssuanceLifetime && DURATION_REGEX.test(sel.defaultIssuanceLifetime)) {
            setBootstrapValidity(sel.defaultIssuanceLifetime);
        } else {
            setBootstrapValidity('1h');
        }
    };

    const currentBootstrapKeySpecOptions = bootstrapKeygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;
    const currentDeviceKeySpecOptions = deviceKeygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;

    const handleSkipBootstrap = () => {
        setBootstrapCertificate('');
        setBootstrapPrivateKey('');
        setStep(5);
    };

    const handleNext = async () => {
        if (step === 1) {
            // General messages are informational and device-agnostic: no device
            // ID or POPO/flow-variant config. When this RA requires signed genm
            // AND has a validation CA to issue from, route through the same
            // Bootstrap (3) / Credentials (4) flow ir/cr use to get a real
            // certificate; otherwise (unsigned, or signed but no CA available)
            // jump straight to the commands.
            if (selectedOperation === 'genm') {
                if (genmUsesIssuedCert) {
                    setBootstrapCn('genm-client');
                    setStep(3);
                } else {
                    setStep(5);
                }
                return;
            }
            if (!deviceId.trim()) { sileo.error({ title: 'Device ID required' }); return; }
            setBootstrapCn(deviceId.trim());
            // Revocation has no CRMF proof-of-possession or certConf to
            // configure, so it skips the "Flow variant" step and goes straight
            // to selecting the certificate to revoke.
            setStep(selectedOperation === 'rr' ? 3 : 2);
        } else if (step === 2) {
            setStep(3);
        } else if (step === 3) {
            if (selectedOperation === 'kur' || selectedOperation === 'rr') {
                // KUR/RR act on an existing certificate (renew / revoke), not by
                // a bootstrap cert — there is nothing to issue here, and no
                // Credentials step. Jump straight to the commands.
                setStep(5);
                return;
            }
            // genm reaches step 3 ONLY when genmUsesIssuedCert is already true
            // (see step 1 above) — always proceed with real issuance there,
            // regardless of the enrollment auth_mode (requiresClientCert is about
            // ir/cr/kur's OWN protection requirement, unrelated to genm's).
            if (selectedOperation !== 'genm' && !requiresClientCert) {
                // This RA's auth_mode doesn't validate a client certificate at
                // all — there's nothing to issue, so behave like "Skip".
                handleSkipBootstrap();
                return;
            }
            if (!bootstrapSigner) {
                sileo.error({
                    title: 'Bootstrap Signer Required',
                    description: 'You must select a CA to sign the bootstrap certificate. If the list is empty, add a CA to client_certificate_settings.validation_cas on this RA first.',
                });
                return;
            }
            if (!bootstrapCn.trim()) {
                sileo.error({ title: 'Bootstrap CN Required' });
                return;
            }
            setIsGenerating(true);
            try {
                const algorithm = bootstrapKeygenType === 'RSA'
                    ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: parseInt(bootstrapKeygenSpec, 10), publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
                    : { name: 'ECDSA', namedCurve: bootstrapKeygenSpec };
                const keyPair = await crypto.subtle.generateKey(algorithm as any, true, ['sign', 'verify']);

                const privateKeyPem = formatAsPem(
                    arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)),
                    'PRIVATE KEY',
                );
                setBootstrapPrivateKey(privateKeyPem);

                const signedCsrPem = await buildSelfSignedCsr({
                    subject: { commonName: bootstrapCn.trim() },
                    keyPair,
                });
                const payload = {
                    csr: window.btoa(signedCsrPem),
                    profile: {
                        // In CKG mode this cert is also the CMS recipient the
                        // server encrypts the generated key to — it needs
                        // KeyAgreement (ECDH/KARI) alongside the signing usage
                        // TLS_KEY_USAGES already covers. An RSA signer needs no
                        // change: TLS_KEY_USAGES already includes
                        // KeyEncipherment (RSA-OAEP/KTRI).
                        key_usage: usingCkg && bootstrapKeygenType === 'EC'
                            ? [...TLS_KEY_USAGES, 'KeyAgreement' as const]
                            : [...TLS_KEY_USAGES],
                        honor_subject: true,
                        honor_extensions: false,
                        validity: { type: 'Duration', duration: bootstrapValidity },
                    },
                };
                const result = await signCertificate(bootstrapSigner.id, payload);
                const issuedPem = result.certificate
                    ? window.atob(result.certificate)
                    : 'Error: Certificate not found in response.';
                setBootstrapCertificate(issuedPem);
                setStep(4);
            } catch (e: any) {
                sileo.error({ title: 'Bootstrap Certificate Issuance Failed', description: e.message });
            } finally {
                setIsGenerating(false);
            }
        } else if (step === 4) {
            setStep(5);
        }
    };

    const handleBack = () => {
        if (step === 5 && selectedOperation === 'genm') {
            // genm reached step 5 either directly from step 1 (unsigned, or
            // signed with no CA to issue from) or via the Bootstrap/Credentials
            // flow (genmUsesIssuedCert) — go back to wherever it actually came from.
            setStep(genmUsesIssuedCert ? (bootstrapCertificate ? 4 : 3) : 1);
        } else if (step === 5 && !bootstrapCertificate) {
            setStep(3);
        } else if (step === 3 && (selectedOperation === 'rr' || selectedOperation === 'genm')) {
            setStep(1); // RR and genm both skip step 2 (Flow variant)
        } else {
            setStep((p) => (p > 1 ? p - 1 : 1));
        }
    };

    // ── Command rendering ──────────────────────────────────────────────────
    const finalDeviceId = deviceId || 'device-id';
    const cmpBase = get_CMP_API_BASE_URL();
    const cmpPath = `/p/${ra?.id ?? '<dms-id>'}`;
    const cmpServer = cmpBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const cmpServerScheme = cmpBase.startsWith('https://') ? 'https' : 'http';
    const cmpServerUrl = `${cmpServerScheme}://${cmpServer}`;
    // openssl cmp uses -server (host:port) + -path (URL path) — assembling the
    // path from the base URL keeps the command portable across deployments that
    // serve CMP under different prefixes.
    const cmpServerPath = (() => {
        try {
            const u = new URL(cmpBase + cmpPath);
            return u.pathname;
        } catch {
            return `/dmsmanager/.well-known/cmp${cmpPath}`;
        }
    })();

    // ── DMS config that shapes the commands ──────────────────────────────────
    // Mirror the reference cmp-*.sh scripts: the trust anchor is always the
    // enrollment CA (verifies the server's signed CMP responses + the issued
    // chain), -srvcert is added only when a protection cert is configured, and
    // -implicit_confirm is sent only when the DMS accepts it.
    const cmp = ra?.settings.cmp_settings?.enrollment_settings;
    const enrollmentCaId = cmp?.enrollment_ca;
    const protectionSerial = cmp?.protection_certificate;
    const acceptImplicit = cmp?.accept_implicit ?? false;
    const selectedOperationSettings =
        selectedOperation === 'ir' ? cmp?.ir
        : selectedOperation === 'cr' ? cmp?.cr
        : selectedOperation === 'kur' ? cmp?.kur
        : cmp?.p10cr;
    const confirmationOverride = selectedOperationSettings?.policy_overrides?.confirmation;
    const supportsImplicitConfirmation =
        confirmationOverride === 'implicit'
        || (confirmationOverride !== 'explicit' && acceptImplicit);
    const usesImplicitConfirmation =
        confirmationMode === 'implicit' && supportsImplicitConfirmation;
    const confirmationModeOptions: CardSelectorOption<CmpConfirmationMode>[] = [
        {
            value: 'implicit',
            label: 'Implicit',
            description: supportsImplicitConfirmation
                ? 'Request implicitConfirm so the certificate is accepted without a certConf round trip.'
                : 'Unavailable for this request because its effective policy requires explicit confirmation.',
            icon: ShieldCheck,
            disabled: !supportsImplicitConfirmation,
        },
        {
            value: 'explicit',
            label: 'Explicit',
            description: 'Complete the exchange with an explicit certConf confirmation.',
            icon: ShieldCheck,
        },
    ];
    const authMode = cmp?.auth_mode ?? 'CLIENT_CERTIFICATE';
    // Only these two modes require the IR to be signed by a cert chaining to
    // validation_cas; NONE and EXTERNAL_WEBHOOK accept an unprotected IR
    // (authorization, if any, happens via the webhook instead).
    const requiresClientCert = authMode === 'CLIENT_CERTIFICATE' || authMode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
    const enforcePopo = cmp?.enforce_popo ?? false;
    const isPhasedWorkflow = cmp?.workflow === 'phased';
    const usesSrvcert = pinProtectionCert && !!protectionSerial;
    const caApiBase = get_CA_API_BASE_URL();

    // Which POPO methods this DMS actually honours for the selected CRMF
    // request. IR and CR read ProofOfPossession.AllowedMethods and fall back to
    // the backend default; KUR uses the signature PoP required by its flow.
    // trusted_ra (raVerified) additionally needs a signed request (asks the DMS
    // to trust the message-protection signer instead of a POPOSigningKey), so
    // it's disabled in the selector below when this RA's auth_mode doesn't
    // validate a client certificate.
    const allowedPopoMethods: CmpPopoMethod[] =
        selectedOperation === 'kur'
            ? ['signature']
            : (selectedOperation === 'cr'
            ? cmp?.cr?.proof_of_possession?.allowed_methods
            : cmp?.ir?.proof_of_possession?.allowed_methods)
            ?? ['signature', 'trusted_ra'];

    // ── Per-operation gates the DMS enforces (RFC011) ─────────────────────────
    // The backend rejects any request whose operation is disabled, and openssl
    // cmp cannot satisfy some controls at all — surface these as warnings so the
    // wizard never hands over a command the DMS is guaranteed to reject.
    const irEnabled = cmp?.ir?.enabled ?? true;
    const crEnabled = cmp?.cr?.enabled ?? true;
    const kurEnabled = cmp?.kur?.enabled ?? true;
    const p10crEnabled = cmp?.p10cr?.enabled ?? true;
    const rrEnabled = cmp?.rr?.enabled ?? true;
    // Whether the operation the user selected in step 1 is enabled on this DMS —
    // drives the "operation disabled" warning shown above its command.
    const selectedOpEnabled =
        selectedOperation === 'ir' ? irEnabled
        : selectedOperation === 'cr' ? crEnabled
        : selectedOperation === 'kur' ? kurEnabled
        : p10crEnabled;
    // RFC 4211 regToken / authenticator controls can't be attached by openssl
    // cmp; a `required` mode makes the ir impossible from this wizard.
    const regTokenRequired = cmp?.ir?.registration_token?.mode === 'required';
    const authenticatorRequired = cmp?.ir?.authenticator_control?.mode === 'required';
    // The wizard can drive signature (default), trusted_ra (raVerified), and
    // encrypted_certificate (openssl `-popo 2`, RSA device key only — the
    // wizard switches the device key type to RSA automatically when this
    // method is selected, see handlePopoMethodChange). challenge_response
    // can't be produced by openssl cmp at all (no CLI value declares that
    // SubsequentMessage alternative), and keyAgreement (EC) POPO doesn't
    // exist in openssl's `-popo` range either way.
    const popoUsableInWizard = (m: CmpPopoMethod) =>
        m === 'signature' || (m === 'trusted_ra' && requiresClientCert) || m === 'encrypted_certificate';
    const hasUsablePopo = allowedPopoMethods.some(popoUsableInWizard);
    // trusted_ra (-popo 0) delegates POPO to the message-protection signer, which
    // the DMS only accepts from a trusted RA (id-kp-cmcRA, chaining to a
    // validation CA) — not the plain bootstrap cert this wizard issues.
    const usingTrustedRaPopo = popoMethod === 'trusted_ra';
    // Field path the "no usable POPO" warning below points operators at —
    // ir/cr each have their own allow-list, so the warning must name the one
    // that's actually in effect rather than hardcoding ir's.
    const popoAllowlistFieldPath = selectedOperation === 'cr'
        ? 'cr.proof_of_possession.allowed_methods'
        : 'ir.proof_of_possession.allowed_methods';

    // RFC 9483 §4.1.6 central key generation. Only meaningful for ir — the
    // wizard's cr/kur/p10cr commands aren't wired to a CKG-capable template,
    // and the backend requires a signature-protected request (the protecting
    // cert becomes the CMS recipient), so it's unavailable without a client
    // cert. Gated on the per-op field, which backend resolution keeps in sync
    // with the DMS-general server_key_gen_enabled toggle.
    const ckgSupportedByDms = cmp?.ir?.central_key_generation?.enabled ?? false;
    const ckgAvailable = selectedOperation === 'ir' && requiresClientCert && ckgSupportedByDms;
    const usingCkg = selectedOperation === 'ir' && keygenMethod === 'server';

    // Shared between step 2 (right where the fully-disabled Select otherwise
    // looks "stuck" with no explanation) and step 5's command summary — surfacing
    // it immediately in step 2 avoids the confusing experience of a POPO selector
    // that shows a method selected yet marked disabled, with no visible reason
    // until several steps later.
    const noUsablePopoWarning = !hasUsablePopo && !usingCkg && selectedOperation !== 'p10cr' && selectedOperation !== 'rr' && (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No proof-of-possession method this wizard can produce</AlertTitle>
            <AlertDescUI>
                This DMS only permits {allowedPopoMethods.map((m) => POPO_METHOD_INFO[m].label).join(', ') || 'no'} for
                <code className="font-mono"> {selectedOperation}</code>. That&apos;s{' '}
                <code className="font-mono">challenge_response</code>, which{' '}
                <code className="font-mono">openssl cmp</code> can never produce (no <code className="font-mono">-popo</code>{' '}
                value declares that SubsequentMessage alternative) — a locally-generated device key via{' '}
                <code className="font-mono">-newkey</code> can only prove possession with{' '}
                <code className="font-mono">signature</code>
                {requiresClientCert ? <>, <code className="font-mono">trusted_ra</code></> : null}, or{' '}
                <code className="font-mono">encrypted_certificate</code> (RSA only).
                {ckgAvailable
                    ? <> Pick &quot;Generate key on server&quot; in the Bootstrap step to use central key generation instead.</>
                    : <> Add one of those to <code className="font-mono">{popoAllowlistFieldPath}</code>, or use a client that supports challengeResp.</>}
            </AlertDescUI>
        </Alert>
    );

    // rr: openssl omits a reason by default (→ the DMS reads it as
    // unspecified/0). If rr.allowed_reasons is restricted and excludes
    // unspecified, pin an explicit -revreason to the first allowed reason so the
    // rr isn't rejected.
    const rrAllowedReasons = cmp?.rr?.allowed_reasons ?? [];
    const rrReason: CmpRevocationReason | undefined =
        rrAllowedReasons.length === 0 || rrAllowedReasons.includes('unspecified')
            ? undefined
            : rrAllowedReasons[0];
    const rrReasonCode = rrReason ? REVOCATION_REASON_CODE[rrReason] : undefined;

    const deviceKeyCmd = deviceKeygenType === 'RSA'
        ? `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${deviceKeygenSpec} -out ${finalDeviceId}.key`
        : `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:${deviceKeygenSpec} -out ${finalDeviceId}.key`;
    const newKeyCmd = deviceKeygenType === 'RSA'
        ? `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${deviceKeygenSpec} -out ${finalDeviceId}-new.key`
        : `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:${deviceKeygenSpec} -out ${finalDeviceId}-new.key`;

    // The protection certificate (which signs every CMP response) is selected
    // independently of the enrollment CA in the RA settings' certificate picker
    // — nothing constrains it to be issued by enrollment_ca. -trusted is what
    // openssl uses to chain-validate the response's signer, so when the two
    // CAs differ, enrollca.pem must contain BOTH or response verification
    // fails (this matters whenever -srvcert isn't pinning the exact leaf —
    // e.g. the "Pin Protection Certificate" switch below is off).
    const protectionCaDiffersFromEnrollmentCa =
        !!protectionCertIssuerCaId && protectionCertIssuerCaId !== enrollmentCaId;

    // Trust anchor fetch — the enrollment CA, plus the protection cert's own
    // issuing CA when it differs (or, if the RA has no enrollment CA at all, a
    // bundle of every CA). openssl aborts response verification without a
    // trust store. The descriptive comment lives on the numbered step line in
    // each command.
    const fetchTrustAnchor = enrollmentCaId
        ? protectionCaDiffersFromEnrollmentCa
            ? [
                `curl -sf -H "Authorization: Bearer $TOKEN" "${caApiBase}/cas/${enrollmentCaId}" \\\n    | jq -r '.certificate.certificate' | base64 -d > enrollca.pem`,
                `curl -sf -H "Authorization: Bearer $TOKEN" "${caApiBase}/cas/${protectionCertIssuerCaId}" \\\n    | jq -r '.certificate.certificate' | base64 -d >> enrollca.pem`,
              ].join('\n')
            : `curl -sf -H "Authorization: Bearer $TOKEN" "${caApiBase}/cas/${enrollmentCaId}" \\\n    | jq -r '.certificate.certificate' | base64 -d > enrollca.pem`
        : `curl -sf -H "Authorization: Bearer $TOKEN" "${caApiBase}/cas?page_size=100" \\\n    | jq -r '.list[].certificate.certificate' \\\n    | while IFS= read -r c; do echo "$c" | base64 -d; done > enrollca.pem`;

    const fetchProtectionCert = `curl -sf -H "Authorization: Bearer $TOKEN" "${caApiBase}/certificates/${(protectionSerial ?? '').toLowerCase()}" \\\n    | jq -r '.certificate' | base64 -d > srvcert.pem`;

    // Fetch an issued certificate (public) by serial into outFile — used by
    // KUR/RR, which operate on a cert that already exists in the backend. The
    // certificates endpoint keys on the colon-stripped serial.
    const certApiSerial = (s: string) => s.replace(/:/g, '').toLowerCase();
    const fetchCertBySerial = (serial: string, outFile: string) =>
        `curl -sf -H "Authorization: Bearer $TOKEN" "${caApiBase}/certificates/${certApiSerial(serial)}" \\\n    | jq -r '.certificate' | base64 -d > ${outFile}`;

    // Verification flag lines shared by ir/kur/rr, each terminated with a line
    // continuation. RR ends on these flags, so it strips the trailing "\".
    const verifyFlagLines = [`    -trusted enrollca.pem \\`];
    if (usesSrvcert) verifyFlagLines.push(`    -srvcert srvcert.pem \\`);
    const implicitLine = usesImplicitConfirmation ? [`    -implicit_confirm \\`] : [];

    // Only signed when this RA's auth_mode actually validates a client
    // certificate — NONE/EXTERNAL_WEBHOOK accept an unprotected IR. openssl
    // cmp refuses to build a request with neither a signer nor a shared
    // secret unless -unprotected_requests explicitly opts into sending it
    // with no CMP-level protection at all.
    const bootstrapSignerLines = requiresClientCert
        ? [`    -cert bootstrap.crt -key bootstrap.key \\`, `    -extracerts bootstrap.crt \\`]
        : [`    -unprotected_requests \\`];
    // ir and cr share the same CRMF -newkey enrollment command shape (POPO,
    // CKG, protection all identical); only the -cmd verb and the labels differ.
    // The values feeding the command below (popoMethod, allowedPopoMethods,
    // usingCkg, confirmation) are already resolved from selectedOperation, so
    // the same builder serves both. kur and p10cr are distinct enough to have
    // their own builders.
    const enrollCmd = selectedOperation === 'cr' ? 'cr' : 'ir';
    const enrollOpName = selectedOperation === 'cr'
        ? 'Certification Request (cr)'
        : 'Initialization Request (ir)';

    // Numbered dynamically rather than hardcoded — the device-key-gen step is
    // absent entirely in CKG mode (the server generates the key), so the
    // count of steps preceding the ir/cr invocation varies.
    let irStepCounter = 0;
    const deviceKeyStepNumber = usingCkg ? null : ++irStepCounter;
    const trustAnchorStepNumber = ++irStepCounter;
    const protectionCertStepNumber = usesSrvcert ? ++irStepCounter : null;
    const irStepNumber = ++irStepCounter;
    const enrollCommand = [
        ...(deviceKeyStepNumber !== null ? [
            `# ${deviceKeyStepNumber}. Generate the device key pair (the key you want a certificate for).`,
            deviceKeyCmd,
            ``,
        ] : []),
        `# ${trustAnchorStepNumber}. Fetch the enrollment CA — openssl's trust anchor for verifying the`,
        `#    server's signed CMP responses and the issued certificate chain.`,
        ...(protectionCaDiffersFromEnrollmentCa ? [
            `#    The protection certificate is issued by a DIFFERENT CA than the`,
            `#    enrollment CA, so both are fetched into the same trust store.`,
        ] : []),
        fetchTrustAnchor,
        ...(protectionCertStepNumber !== null ? [
            ``,
            `# ${protectionCertStepNumber}. Pin the DMS protection certificate so openssl checks the exact`,
            `#    server identity via -srvcert.`,
            fetchProtectionCert,
        ] : []),
        ``,
        ...(usingCkg ? [
            `# ${irStepNumber}. ${enrollOpName}: central key generation — the server`,
            `#    generates the key pair and delivers it encrypted to the bootstrap`,
            `#    signer; proof of possession is implicit (RFC 9483 §4.1.6).`,
        ] : requiresClientCert ? [
            `# ${irStepNumber}. ${enrollOpName}: send a signature-protected request. The`,
            `#    bootstrap cert in extraCerts is the message-protection signer; the DMS`,
            `#    chain-validates it against client_certificate_settings.validation_cas.`,
        ] : [
            `# ${irStepNumber}. ${enrollOpName}: this RA's auth_mode (${authMode}) does not`,
            `#    validate a client certificate, so the request is sent unprotected${authMode === 'EXTERNAL_WEBHOOK' ? ' — the' : '.'}`,
            ...(authMode === 'EXTERNAL_WEBHOOK' ? [`#    configured webhook authorizes the request instead.`] : []),
        ]),
        `openssl cmp \\`,
        `    -cmd ${enrollCmd} \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        ...bootstrapSignerLines,
        ...(usingCkg
            ? [
                `    -popo -1 -centralkeygen \\`,
                `    -newkeyout ${finalDeviceId}.key \\`,
                // Saves the raw PKIMessage(s) as received, independent of
                // whether openssl's own -newkeyout decode below succeeds —
                // see the recovery script two steps down for why this matters.
                `    -rspout ${usesImplicitConfirmation ? 'ip.der' : 'ip.der,pkiconf.der'} \\`,
              ]
            : [
                `    -newkey ${finalDeviceId}.key \\`,
                ...(popoMethod === 'trusted_ra' ? [`    -popo 0 \\`] : []),
                // encrypted_certificate: keyEncipherment POPO — openssl decrypts
                // the delivered certificate automatically and writes -certout
                // once it verifies the recovered public key matches -newkey.
                ...(popoMethod === 'encrypted_certificate' ? [`    -popo 2 \\`] : []),
              ]),
        `    -subject "/CN=${finalDeviceId}" \\`,
        ...verifyFlagLines,
        ...implicitLine,
        `    -certout ${finalDeviceId}.crt`,
    ].join('\n');

    const ckgRecoverCommand = [
        `# openssl cmp's own -newkeyout above is expected to fail with a decode`,
        `# error (see the warning in the previous step), and it treats that as`,
        `# fatal to the whole exchange — it writes neither -newkeyout nor`,
        `# -certout, even though the response carries a valid issued certificate.`,
        `# -rspout still captured the raw ip response before that happens; recover`,
        `# both the key and the certificate from it directly with the script below.`,
        `python3 cmp-ckg-recover.py \\`,
        `    --response ip.der \\`,
        `    --recipient-key bootstrap.key \\`,
        `    --recipient-cert bootstrap.crt \\`,
        `    --trusted-ca enrollca.pem \\`,
        `    --out ${finalDeviceId}.key \\`,
        `    --cert-out ${finalDeviceId}.crt`,
    ].join('\n');

    const renewSerial = existingCertSerial || '<serial-of-cert-to-renew>';
    // The fetch is offered COMMENTED, not run automatically: it must not
    // overwrite the device's real certificate with one that may not match the
    // OLDKEY the operator has (that produces openssl's "cert and key do not
    // match"). Each command line is prefixed so the whole helper is inert
    // until the operator deliberately uncomments it.
    const kurFetchCommented = `#   ${fetchCertBySerial(renewSerial, '"$OLDCERT"').replace(/\n/g, '\n#   ')}`;
    const kurCommand = [
        `# Key Update Request (kur) — renew a certificate with a fresh key.`,
        `# Per RFC 9483 §4.1.3 the KUR is authenticated by the certificate being`,
        `# renewed TOGETHER WITH the private key it was issued for — a matching`,
        `# pair the device holds (the dashboard cannot supply the key). openssl`,
        `# refuses locally with "cert and key do not match" if OLDCERT and OLDKEY`,
        `# are not a pair, and the server rejects renewing a revoked/expired cert.`,
        `# (KUR also requires the enrollment CA to be a trusted CMP signer, i.e.`,
        `# present in client_certificate_settings.validation_cas.)`,
        `#`,
        `# Point these at the device's CURRENT matching cert+key. If it enrolled`,
        `# via the IR command here, they are ${finalDeviceId}.crt / ${finalDeviceId}.key.`,
        `# After a previous renewal, its current key is the -new.key that run`,
        `# produced — set OLDKEY to that (and OLDCERT to its cert) instead.`,
        `OLDCERT=${finalDeviceId}.crt`,
        `OLDKEY=${finalDeviceId}.key`,
        `#`,
        `# If you don't have the certificate file, fetch the cert matching OLDKEY`,
        `# (uncomment — make sure the serial is the cert your OLDKEY belongs to):`,
        kurFetchCommented,
        `#`,
        `# Generate the fresh key the renewed certificate will use:`,
        newKeyCmd,
        ``,
        `openssl cmp \\`,
        `    -cmd kur \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        `    -cert "$OLDCERT" -key "$OLDKEY" \\`,
        `    -extracerts "$OLDCERT" \\`,
        `    -oldcert "$OLDCERT" \\`,
        `    -newkey ${finalDeviceId}-new.key \\`,
        ...verifyFlagLines,
        ...implicitLine,
        `    -certout ${finalDeviceId}-new.crt`,
    ].join('\n');

    // p10cr: a legacy PKCS#10 certification request. Possession is proven by
    // the CSR's own self-signature (no CRMF POPO / -newkey), so the device key
    // goes into the CSR via `openssl req`, and openssl cmp forwards it verbatim
    // with -csr. Message protection still follows the DMS auth_mode.
    const p10crCommand = [
        `# 1. Generate the device key pair and a self-signed PKCS#10 CSR.`,
        `#    The CSR's self-signature is the proof of possession for p10cr.`,
        deviceKeyCmd,
        `openssl req -new -key ${finalDeviceId}.key -subj "/CN=${finalDeviceId}" -out ${finalDeviceId}.csr`,
        ``,
        `# 2. Fetch the enrollment CA — openssl's trust anchor for verifying the`,
        `#    server's signed CMP responses and the issued certificate chain.`,
        fetchTrustAnchor,
        ...(usesSrvcert ? [
            ``,
            `# 3. Pin the DMS protection certificate via -srvcert.`,
            fetchProtectionCert,
        ] : []),
        ``,
        `# ${usesSrvcert ? 4 : 3}. PKCS #10 Certification Request (p10cr).`,
        `openssl cmp \\`,
        `    -cmd p10cr \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        ...bootstrapSignerLines,
        // Unprotected requests carry no signer cert to derive the CMP sender
        // from, and p10cr has no -newkey/-subject either, so openssl aborts with
        // "must give -ref if no -cert and no -subject given" unless we supply a
        // sender reference explicitly.
        ...(requiresClientCert ? [] : [`    -ref ${finalDeviceId} \\`]),
        `    -csr ${finalDeviceId}.csr \\`,
        ...verifyFlagLines,
        ...implicitLine,
        `    -certout ${finalDeviceId}.crt`,
    ].join('\n');

    // RR target. When RR is the CHOSEN operation, it revokes the certificate
    // selected in step 3 (existingCertSerial). When RR is the step-5 COMPANION
    // to an enrollment, it defaults to the certificate that enrollment just
    // produced (kur writes "<id>-new.crt", every other enrollment "<id>.crt")
    // — which the operator has in hand — but can instead target any of the
    // device's existing issued certs (revokeCertSerial). Either "fetch an
    // existing cert" case supplies the device-held key as revokecert.key.
    const rrIsPrimary = selectedOperation === 'rr';
    const rrSelectedSerial = rrIsPrimary ? existingCertSerial : revokeCertSerial;
    const rrUsesSelectedCert = rrIsPrimary || revokeCertSerial !== '';
    const rrFetchSerial = rrSelectedSerial || '<serial-of-cert-to-revoke>';
    // Default companion target: the cert the enrollment above just issued (kur
    // writes "<id>-new.crt", every other enrollment "<id>.crt") — the operator
    // has that matching pair in hand, so RR can reference it directly.
    const defaultRevokeCertFile = selectedOperation === 'kur' ? `${finalDeviceId}-new.crt` : `${finalDeviceId}.crt`;
    const defaultRevokeKeyFile = selectedOperation === 'kur' ? `${finalDeviceId}-new.key` : `${finalDeviceId}.key`;
    // Selecting a specific existing cert to revoke has the same matching-pair
    // constraint as KUR: the key must be the one THAT cert was issued for, which
    // the dashboard can't know. So use explicit REVCERT/REVKEY the operator sets,
    // and offer the fetch commented so it never clobbers a good local cert.
    const rrRevFetchCommented = `#   ${fetchCertBySerial(rrFetchSerial, '"$REVCERT"').replace(/\n/g, '\n#   ')}`;
    // RR issues no certificate, so its final flag is the last verification flag.
    const rrVerifyLines = verifyFlagLines.map((l, i) =>
        i === verifyFlagLines.length - 1 ? l.replace(/ \\$/, '') : l);
    const rrCommand = [
        `# Revocation Request (rr) — revoke a certificate.`,
        ...(rrUsesSelectedCert ? [
            `# Authenticated by the certificate being revoked TOGETHER WITH the private`,
            `# key it was issued for — a matching pair the device holds (the dashboard`,
            `# cannot supply the key). openssl refuses with "cert and key do not match"`,
            `# if REVCERT and REVKEY are not a pair. Point them at that cert and its key:`,
            `REVCERT=revokecert.crt`,
            `REVKEY=revokecert.key`,
            `#`,
            `# If you don't have the certificate file, fetch the selected cert`,
            `# (uncomment — its REVKEY must be the key this cert was issued for):`,
            rrRevFetchCommented,
            ``,
        ] : []),
        ...(rrReason ? [`# This DMS restricts revocation reasons; pinned to "${rrReason}" (-revreason ${rrReasonCode}).`] : []),
        ...(!rrUsesSelectedCert ? [`# Authenticated and identified by the cert the command above issued.`] : []),
        `openssl cmp \\`,
        `    -cmd rr \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        `    -cert ${rrUsesSelectedCert ? '"$REVCERT" -key "$REVKEY"' : `${defaultRevokeCertFile} -key ${defaultRevokeKeyFile}`} \\`,
        `    -extracerts ${rrUsesSelectedCert ? '"$REVCERT"' : defaultRevokeCertFile} \\`,
        `    -oldcert ${rrUsesSelectedCert ? '"$REVCERT"' : defaultRevokeCertFile} \\`,
        ...(rrReasonCode !== undefined ? [`    -revreason ${rrReasonCode} \\`] : []),
        ...rrVerifyLines,
    ].join('\n');

    // The single enrollment command shown in step 5 matches the operation the
    // user chose in step 1 (each is its own request type — kur is not a
    // universal "renewal" companion to every enrolment, so it only appears when
    // actually selected). RR is shown alongside as the revocation companion for
    // whatever cert the chosen operation issues.
    const primaryEnrollCommand =
        selectedOperation === 'rr' ? rrCommand
        : selectedOperation === 'kur' ? kurCommand
        : selectedOperation === 'p10cr' ? p10crCommand
        : enrollCommand;
    const primaryEnrollLabel = CMP_OPERATION_NAMES[selectedOperation];

    // ── General Messages (genm) try-it commands ──────────────────────────────
    // One `openssl cmp -cmd genm` per id-it support message this DMS answers.
    //
    // genm protection is governed SOLELY by GENM.access_policy, independent of
    // the enrollment auth_mode: a DMS can require client-certificate enrollment
    // yet still answer capability-discovery genm unauthenticated
    // (public_discovery). Only require_signed forces a signed request.
    const genmAccessPolicy = cmp?.genm?.access_policy ?? 'public_discovery';
    const genmRequiresSigned = genmAccessPolicy === 'require_signed';
    // When signing is required, prefer a REAL certificate issued from one of
    // this RA's trusted CAs — reusing the exact same Bootstrap (step 3) /
    // Credentials (step 4) flow ir/cr already use — over a synthetic one.
    // genm itself doesn't chain-validate its signer (see cmp_genmsg.go), so a
    // throwaway self-signed cert WOULD also satisfy the server; it's only used
    // as a last resort when this RA has no validation_cas configured at all
    // (nothing to issue from), so the wizard still produces a working command
    // regardless of how the RA happens to be set up.
    const genmUsesIssuedCert = genmRequiresSigned && selectableSigners.length > 0;
    const genmUsesSelfSignedCert = genmRequiresSigned && selectableSigners.length === 0;
    // Step 3 (Bootstrap) renders the CA/key-issuance form for whichever
    // operation actually needs a signer at that step — ir/cr/p10cr per
    // requiresClientCert (their own enrollment auth_mode), or genm per
    // genmUsesIssuedCert (genm only ever reaches step 3 when that's true).
    const stepThreeShowsBootstrapForm = selectedOperation === 'genm' ? genmUsesIssuedCert : requiresClientCert;
    const genmInformationTypes = cmp?.genm?.information_types;
    const genmEnabledCommands = GENM_INFOTYPE_COMMANDS.filter((t) => genmInformationTypes?.[t.key]);
    // The genm/genp step lets the operator pick ONE of the id-it types this RA
    // answers and shows just that command (a genm exchange carries a single
    // -infotype). effectiveGenmType falls back to the first enabled type so the
    // selection always resolves to a real, RA-answerable info type — no reset
    // effect needed when the RA (and thus genmEnabledCommands) changes.
    const effectiveGenmType: keyof CmpGenmInformationTypes | '' =
        genmEnabledCommands.some((c) => c.key === selectedGenmType)
            ? selectedGenmType
            : (genmEnabledCommands[0]?.key ?? '');
    const selectedGenmCommand = genmEnabledCommands.find((c) => c.key === effectiveGenmType);
    const genmSelectorOptions: CardSelectorOption<keyof CmpGenmInformationTypes>[] = genmEnabledCommands.map((t) => ({
        value: t.key,
        label: t.label,
        description: `openssl -infotype ${t.opensslName}${t.since ? ` · OpenSSL ${t.since}+` : ''}`,
        icon: Info,
    }));
    // Verify flags with the trailing "\" stripped from the last line — genm ends
    // on them, like rr.
    const genmVerifyLines = verifyFlagLines.map((l, i) =>
        i === verifyFlagLines.length - 1 ? l.replace(/ \\$/, '') : l);

    // Filenames the signed genm commands reference: the real cert/key produced
    // by the Bootstrap/Credentials steps (same files ir/cr download) when one
    // was issued, otherwise the self-signed fallback pair.
    const genmCertFile = genmUsesIssuedCert ? 'bootstrap.crt' : 'genm.crt';
    const genmKeyFile = genmUsesIssuedCert ? 'bootstrap.key' : 'genm.key';

    let genmStepCounter = 0;
    // The self-signed generation step only appears when there's no RA CA to
    // issue from — otherwise the cert already came from steps 3-4 above.
    const genmSignerStepNumber = genmUsesSelfSignedCert ? ++genmStepCounter : null;
    const genmTrustAnchorStepNumber = ++genmStepCounter;
    const genmProtectionCertStepNumber = usesSrvcert ? ++genmStepCounter : null;
    const genmSetupCommand = [
        ...(genmSignerStepNumber !== null ? [
            `# ${genmSignerStepNumber}. This RA has no client_certificate_settings.validation_cas to`,
            `#    issue a real certificate from, so generate a throwaway self-signed`,
            `#    one instead. genm doesn't chain-validate its signer (unlike`,
            `#    ir/cr/kur), so any cert/key pair satisfies the protection requirement.`,
            `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \\`,
            `    -keyout ${genmKeyFile} -out ${genmCertFile} -days 1 -subj "/CN=genm-client"`,
            ``,
        ] : []),
        `# ${genmTrustAnchorStepNumber}. Fetch the enrollment CA — openssl's trust anchor for verifying the`,
        `#    server's signed CMP (genp) responses.`,
        ...(protectionCaDiffersFromEnrollmentCa ? [
            `#    The protection certificate is issued by a DIFFERENT CA than the`,
            `#    enrollment CA, so both are fetched into the same trust store.`,
        ] : []),
        fetchTrustAnchor,
        ...(genmProtectionCertStepNumber !== null ? [
            ``,
            `# ${genmProtectionCertStepNumber}. Pin the DMS protection certificate so openssl checks the exact`,
            `#    server identity via -srvcert.`,
            fetchProtectionCert,
        ] : []),
    ].join('\n');
    const buildGenmCommand = (opensslName: string, outputFlags?: string[]) => [
        `openssl cmp \\`,
        `    -cmd genm \\`,
        `    -infotype ${opensslName} \\`,
        `    -server ${cmpServerUrl} \\`,
        `    -path ${cmpServerPath} \\`,
        ...(genmRequiresSigned
            ? [`    -cert ${genmCertFile} -key ${genmKeyFile} \\`, `    -extracerts ${genmCertFile} \\`]
            // A genm has no certificate template to carry a subject, but openssl
            // cmp still needs SOME way to fill the PKIHeader sender field when no
            // -cert is given — otherwise it refuses with "must give -ref if no
            // -cert and no -subject given". -subject is a generic placeholder
            // identity here, not a certificate request.
            : [`    -unprotected_requests \\`, `    -subject "/CN=genm-client" \\`]),
        ...(outputFlags ?? []).map((f) => `    ${f} \\`),
        ...genmVerifyLines,
    ].join('\n');

    // ── Panel layout ───────────────────────────────────────────────────────
    const panelContent = (
        <>
            <div className="border-b p-6 pb-4">
                <h2 className="text-lg font-semibold">CMP Enroll</h2>
                <p className="text-sm text-muted-foreground">
                    Generate enrollment commands for RA: {ra?.name} ({ra?.id})
                </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                <div className="pt-2">
                    <Stepper
                        currentStep={
                            selectedOperation === 'genm'
                                ? (genmUsesIssuedCert
                                    ? (step === 1 ? 1 : step === 3 ? 2 : step === 4 ? 3 : 4)
                                    : (step === 1 ? 1 : 2))
                            : selectedOperation === 'rr' ? (step === 1 ? 1 : step === 3 ? 2 : 3)
                            : selectedOperation === 'kur' && step === 5 ? 4
                            : step
                        }
                        steps={
                            selectedOperation === 'genm'
                                ? (genmUsesIssuedCert
                                    ? ['Request', 'Signer', 'Credentials', 'General messages']
                                    : ['Request', 'General messages'])
                            : selectedOperation === 'rr' ? ['Request', 'Certificate', 'Command']
                            : selectedOperation === 'kur' ? ['Request', 'Flow variant', 'Certificate', 'Commands']
                            : ['Request', 'Flow variant', 'Bootstrap', 'Credentials', 'Commands']
                        }
                    />
                </div>

                <div className="space-y-4">
                    {isLoadingDependencies && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading CAs…
                        </div>
                    )}
                    {errorDependencies && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Could not load dependencies</AlertTitle>
                            <AlertDescUI>{errorDependencies}</AlertDescUI>
                        </Alert>
                    )}

                    {step === 1 && (
                        <div className="space-y-4">
                            <CardSelector
                                label="Request type"
                                value={selectedOperation}
                                onChange={setSelectedOperation}
                                options={CMP_ENROLLMENT_OPERATIONS}
                                columns={2}
                            />

                            {selectedOperation === 'genm' ? (
                                <Alert>
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>Informational queries — no device needed</AlertTitle>
                                    <AlertDescUI className="text-xs">
                                        General messages ask the CA about its capabilities and don&apos;t issue a
                                        device certificate, so there&apos;s no device ID.
                                        {genmUsesIssuedCert
                                            ? <> This RA requires general messages to be signed, so the next steps
                                                issue a short-lived certificate from one of its trusted CAs to
                                                protect the request — the same flow used for ir/cr.</>
                                            : genmUsesSelfSignedCert
                                            ? <> This RA requires general messages to be signed, but has no
                                                validation CA configured to issue a real certificate from, so the
                                                next step generates a throwaway self-signed one instead — genm
                                                doesn&apos;t validate its signer&apos;s identity, so this is sufficient.</>
                                            : <> The next step lists one <code className="font-mono">openssl cmp -cmd genm</code>{' '}
                                                command per id-it information type this RA is configured to answer.</>}
                                    </AlertDescUI>
                                </Alert>
                            ) : (
                            <div className="space-y-2">
                                <Label htmlFor="cmp-device-id">Device ID</Label>
                                {!initialDeviceId && (
                                    <Select
                                        value={raDevices.some((d) => d.id === deviceId) ? deviceId : ''}
                                        onValueChange={setDeviceId}
                                        disabled={isLoadingRaDevices || raDevices.length === 0}
                                    >
                                        <SelectTrigger id="cmp-device-select">
                                            <SelectValue placeholder={
                                                isLoadingRaDevices ? 'Loading devices…'
                                                : raDevices.length === 0 ? 'No existing devices for this RA'
                                                : 'Select an existing device from this RA…'
                                            } />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {raDevices.map((d) => (
                                                <SelectItem key={d.id} value={d.id}>
                                                    {d.id}{d.status ? ` — ${d.status}` : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                <div className="flex items-center gap-2">
                                    <Input id="cmp-device-id" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="e.g., test-1, sensor-12345" disabled={!!initialDeviceId} />
                                    <Button type="button" variant="outline" size="icon"
                                        onClick={() => setDeviceId(crypto.randomUUID())}
                                        title="Generate random GUID"
                                        disabled={!!initialDeviceId}>
                                        <RefreshCwIcon className="h-4 w-4" />
                                    </Button>
                                </div>
                                {!initialDeviceId && (
                                    <p className="text-xs text-muted-foreground">
                                        Pick an existing device from this RA, type an ID, or generate a random one
                                        {(selectedOperation === 'kur' || selectedOperation === 'rr')
                                            ? ' — for renewal/revocation, choose the device whose certificate you are acting on.'
                                            : '.'}
                                    </p>
                                )}
                            </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <p className="font-semibold">Flow variant</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Configure key generation, confirmation, and proof of possession for {CMP_OPERATION_NAMES[selectedOperation]}.
                                </p>
                            </div>

                            {selectedOperation !== 'rr' && selectedOperation !== 'genm' && (
                            <div className="space-y-4">
                                <Label>{selectedOperation === 'kur' ? 'New device key parameters' : 'Device key parameters'} (used by <code className="font-mono">openssl cmp -newkey</code>)</Label>

                                {selectedOperation === 'ir' && (
                                    <RadioGroup
                                        value={keygenMethod}
                                        onValueChange={(v) => setKeygenMethod(v as 'device' | 'server')}
                                        className="grid grid-cols-2 gap-4"
                                    >
                                        <div>
                                            <RadioGroupItem value="device" id="cmp-keygen-device" className="peer sr-only" />
                                            <Label
                                                htmlFor="cmp-keygen-device"
                                                className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 text-center hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                            >
                                                Generate key on device
                                            </Label>
                                        </div>
                                        <div>
                                            <RadioGroupItem value="server" id="cmp-keygen-server" className="peer sr-only" disabled={!ckgAvailable} />
                                            <Label
                                                htmlFor="cmp-keygen-server"
                                                className={cn(
                                                    'flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 text-center',
                                                    ckgAvailable
                                                        ? 'hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary'
                                                        : 'cursor-not-allowed opacity-50',
                                                )}
                                            >
                                                Generate key on server
                                                {!ckgAvailable && (
                                                    <Badge variant="destructive" className="mt-2">
                                                        {!requiresClientCert ? 'Requires a signed request' : 'Not Supported by RA'}
                                                    </Badge>
                                                )}
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                )}

                                {selectedOperation === 'ir' && ckgAvailable && (
                                    <p className="text-xs text-muted-foreground">
                                        &quot;Generate key on device&quot; and &quot;Generate key on server&quot; (central key
                                        generation) are mutually exclusive enrollment modes. Central key generation has the
                                        server create the key, so there is no device-held key to prove possession of —
                                        choosing it <strong>replaces</strong> the proof-of-possession method
                                        {popoMethod === 'encrypted_certificate'
                                            ? <> you picked below (<code className="font-mono">encrypted_certificate</code>)</>
                                            : null}
                                        {' '}with implicit possession (<RfcLink rfc={9483} section="4.1.6" />). This is why
                                        both appear even when the DMS only allows device-key proof-of-possession methods:
                                        they are two independent ways this DMS lets you enrol.
                                    </p>
                                )}

                                {keygenMethod === 'device' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="cmp-dev-key-type">Device Key Type</Label>
                                            <Select value={deviceKeygenType} onValueChange={handleDeviceKeygenTypeChange}>
                                                <SelectTrigger id="cmp-dev-key-type"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {KEY_TYPE_OPTIONS.map((opt) => (
                                                        <SelectItem
                                                            key={opt.value}
                                                            value={opt.value}
                                                            disabled={popoMethod === 'encrypted_certificate' && opt.value !== 'RSA'}
                                                        >
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {popoMethod === 'encrypted_certificate' && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Locked to RSA — encrypted_certificate POPO only exists for
                                                    keyEncipherment (RSA) keys.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <Label htmlFor="cmp-dev-key-spec">{deviceKeygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                            <Select value={deviceKeygenSpec} onValueChange={setDeviceKeygenSpec}>
                                                <SelectTrigger id="cmp-dev-key-spec"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {currentDeviceKeySpecOptions.map((opt) => (
                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                ) : (
                                    <Alert>
                                        <Info className="h-4 w-4" />
                                        <AlertTitle>Central key generation (<RfcLink rfc={9483} section="4.1.6" />)</AlertTitle>
                                        <AlertDescUI className="space-y-1 text-xs">
                                            <p>
                                                The server generates the key pair and delivers it confidentiality-protected to the
                                                bootstrap signer (RSA-OAEP/KTRI or ECDH/KARI, per{' '}
                                                <RfcLink rfc={5652} section="6.2" />, chosen automatically from its key type) — openssl
                                                has no flag to request a specific algorithm, so it defaults to RSA-2048 unless this DMS
                                                is configured otherwise.
                                            </p>
                                            <p>
                                                Because the bootstrap signer is also the decryption recipient, the wizard requests{' '}
                                                <code className="font-mono">KeyAgreement</code> alongside its signing usage when it's an
                                                EC key (an RSA signer already carries <code className="font-mono">KeyEncipherment</code>).
                                            </p>
                                            <p className="text-amber-600 dark:text-amber-400">
                                                Known limitation: <code className="font-mono">openssl cmp</code>&apos;s CLI only
                                                consumes a bare key as the delivered content, while <RfcLink rfc={9483} section="4.1.6" />{' '}
                                                (and the compliance test suite this DMS is validated against) require the key wrapped in
                                                an AsymmetricKeyPackage. The two requirements are mutually exclusive for a single
                                                response, and this DMS stays spec-compliant — so <code className="font-mono">openssl cmp</code>{' '}
                                                itself will fail with a decode error (&quot;failed extracting central gen key&quot;). It
                                                treats that as fatal to the whole exchange, so it writes neither{' '}
                                                <code className="font-mono">-newkeyout</code> nor <code className="font-mono">-certout</code>{' '}
                                                — even though the issued certificate is present in the response. The final step generates
                                                a small recovery script (using only standard <code className="font-mono">openssl cms</code>{' '}
                                                primitives) that recovers the key directly from the raw saved response instead — no
                                                other CMP client needed.
                                            </p>
                                        </AlertDescUI>
                                    </Alert>
                                )}
                            </div>
                            )}

                            <CardSelector
                                label="Confirmation mode"
                                value={confirmationMode}
                                onChange={setConfirmationMode}
                                options={confirmationModeOptions}
                                columns={2}
                            />

                            <div className="space-y-2">
                                <Label htmlFor="cmp-popo-method">Proof of possession</Label>

                                {usingCkg ? (
                                    <Alert>
                                        <Info className="h-4 w-4" />
                                        <AlertTitle>Not applicable — central key generation selected</AlertTitle>
                                        <AlertDescUI className="text-xs">
                                            You selected &quot;Generate key on server&quot; above for this ir. Central
                                            key generation has no CRMF proof of possession to choose — possession is implicit in
                                            successfully decrypting the delivered key (RFC 9483 §4.1.6). Switch back to
                                            &quot;Generate key on device&quot; above to pick a POPO method instead.
                                        </AlertDescUI>
                                    </Alert>
                                ) : selectedOperation !== 'p10cr' && (
                                    <>
                                        <Select
                                            value={popoMethod}
                                            onValueChange={handlePopoMethodChange}
                                        >
                                            <SelectTrigger id="cmp-popo-method">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CRMF_POPO_METHODS.map((method) => {
                                                    const info = POPO_METHOD_INFO[method];
                                                    const enabledForRequest = allowedPopoMethods.includes(method);
                                                    const disabled =
                                                        !enabledForRequest
                                                        || method === 'challenge_response'
                                                        || (method === 'trusted_ra' && !requiresClientCert);

                                                    return (
                                                        <SelectItem key={method} value={method} disabled={disabled}>
                                                            {info.label}
                                                            {!enabledForRequest ? ' (not enabled for this request)' : ''}
                                                            {enabledForRequest && method === 'challenge_response'
                                                                ? ' (openssl cmp cannot produce this)'
                                                                : ''}
                                                            {enabledForRequest && method === 'trusted_ra' && !requiresClientCert
                                                                ? ' (requires a signed request)'
                                                                : ''}
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            All CRMF proof-of-possession methods are shown. Methods that are not enabled
                                            for this request cannot be selected, and{' '}
                                            <code className="font-mono">challenge_response</code> never can — openssl cmp&apos;s{' '}
                                            <code className="font-mono">-popo</code> option has no value that produces it.{' '}
                                            <code className="font-mono">encrypted_certificate</code> switches the device key
                                            type to RSA automatically (openssl has no keyAgreement/EC equivalent either).{' '}
                                            raVerified is intended for RA-proxy flows: EE → RA proxy
                                            (verifies the EE and sets raVerified) → RA/CA.
                                        </p>
                                        {noUsablePopoWarning}
                                    </>
                                )}

                                {selectedOperation === 'p10cr' && (
                                    <>
                                        <Select value="pkcs10-self-signature" disabled>
                                            <SelectTrigger id="cmp-popo-method">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pkcs10-self-signature">
                                                    PKCS #10 self-signature
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            P10CR proves possession through the signature embedded in the PKCS #10 certification request.
                                        </p>
                                    </>
                                )}

                                {selectedOperation !== 'p10cr' && !usingCkg && usingTrustedRaPopo && (
                                    <Alert variant="warning">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Use raVerified only through a trusted RA proxy</AlertTitle>
                                        <AlertDescUI className="text-xs">
                                            Expected flow: EE → RA proxy (verifies possession and sets raVerified) → RA/CA.
                                            The proxy&apos;s message-protection certificate must carry{' '}
                                            <code className="font-mono">id-kp-cmcRA</code> and chain to a Validation CA.
                                            A regular bootstrap certificate is not sufficient.
                                        </AlertDescUI>
                                    </Alert>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            {(selectedOperation === 'kur' || selectedOperation === 'rr') ? (
                                <div className="space-y-2">
                                    <Label htmlFor="cmp-renew-cert">Certificate to {selectedOperation === 'rr' ? 'revoke' : 'renew'}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Active certificates issued to <code className="font-mono">CN={finalDeviceId}</code>.
                                        The request is authenticated by this certificate <strong>and the exact private key
                                        it was issued for</strong> — a matching pair the device holds (the dashboard never
                                        has the key). The command below takes them as{' '}
                                        <code className="font-mono">{selectedOperation === 'rr' ? 'REVCERT' : 'OLDCERT'}</code>/<code className="font-mono">{selectedOperation === 'rr' ? 'REVKEY' : 'OLDKEY'}</code>{' '}
                                        for you to point at that pair; if the device was renewed before, its current key is
                                        the <code className="font-mono">-new.key</code> from that run, not the original.
                                    </p>
                                    {isLoadingDeviceCerts && (
                                        <div className="flex items-center text-sm text-muted-foreground">
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading certificates…
                                        </div>
                                    )}
                                    {!isLoadingDeviceCerts && deviceCerts.length === 0 && (
                                        <Alert variant="warning">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertTitle>No active certificates found for this device</AlertTitle>
                                            <AlertDescUI className="text-xs">
                                                No <code className="font-mono">ACTIVE</code> certificate with{' '}
                                                <code className="font-mono">CN={finalDeviceId}</code> was found on this backend.
                                                You can still generate the command — it will contain a placeholder serial you
                                                must replace with the certificate you are {selectedOperation === 'rr' ? 'revoking' : 'renewing'}.
                                            </AlertDescUI>
                                        </Alert>
                                    )}
                                    {!isLoadingDeviceCerts && deviceCerts.length > 0 && (
                                        <Select value={existingCertSerial} onValueChange={setExistingCertSerial}>
                                            <SelectTrigger id="cmp-renew-cert"><SelectValue placeholder="Select a certificate…" /></SelectTrigger>
                                            <SelectContent>
                                                {deviceCerts.map((c) => (
                                                    <SelectItem key={c.serialNumber} value={c.serialNumber}>
                                                        {c.serialNumber}{c.validTo ? ` — expires ${c.validTo.slice(0, 10)}` : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                            ) : stepThreeShowsBootstrapForm ? (
                                <>
                                    {selectedOperation === 'genm' && (
                                        <Alert>
                                            <Info className="h-4 w-4" />
                                            <AlertDescUI className="text-xs">
                                                genm doesn&apos;t actually validate its signer&apos;s identity, so any
                                                certificate would satisfy the protection requirement — issuing from an
                                                RA-trusted CA here just gives you a real, verifiable certificate
                                                instead of an ad-hoc one.
                                            </AlertDescUI>
                                        </Alert>
                                    )}
                                    <div>
                                        <Label htmlFor="cmp-bootstrap-cn">Bootstrap Common Name (CN)</Label>
                                        <Input id="cmp-bootstrap-cn" value={bootstrapCn} onChange={(e) => setBootstrapCn(e.target.value)} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="cmp-bs-key-type">Bootstrap Key Type</Label>
                                            <Select value={bootstrapKeygenType} onValueChange={handleBootstrapKeygenTypeChange}>
                                                <SelectTrigger id="cmp-bs-key-type"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {KEY_TYPE_OPTIONS.map((opt) => (
                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="cmp-bs-key-spec">{bootstrapKeygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                            <Select value={bootstrapKeygenSpec} onValueChange={setBootstrapKeygenSpec}>
                                                <SelectTrigger id="cmp-bs-key-spec"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {currentBootstrapKeySpecOptions.map((opt) => (
                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="cmp-bs-signer">Bootstrap Signer (must be in validation_cas)</Label>
                                        <p className="text-xs text-muted-foreground mb-2">
                                            Only CAs configured on this RA's CMP <code className="font-mono">client_certificate_settings.validation_cas</code> are listed
                                            {selectedOperation === 'genm'
                                                ? <> as a source of real, RA-trusted certificates.</>
                                                : <> — using anything else would make the DMS reject the enrollment.</>}
                                        </p>
                                        {selectableSigners.length === 0 && !isLoadingDependencies && (
                                            <Alert variant="destructive">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertTitle>No Validation CAs configured</AlertTitle>
                                                <AlertDescUI>
                                                    This RA has no CAs in <code className="font-mono">cmp_settings.enrollment_settings.client_certificate_settings.validation_cas</code>.
                                                    Add at least one before issuing a bootstrap signer, otherwise
                                                    the DMS will refuse the IR.
                                                </AlertDescUI>
                                            </Alert>
                                        )}
                                        <Select value={bootstrapSigner?.id} onValueChange={handleBootstrapSignerChange}>
                                            <SelectTrigger id="cmp-bs-signer">
                                                <SelectValue placeholder="Select a signing CA..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {selectableSigners.map((signer) => (
                                                    <SelectItem key={signer.id} value={signer.id}>{signer.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {bootstrapSigner && (
                                            <div className="mt-2">
                                                <CaVisualizerCard ca={bootstrapSigner} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} />
                                            </div>
                                        )}
                                    </div>

                                    <DurationInput id="cmp-bs-validity" label="Bootstrap Certificate Validity" value={bootstrapValidity} onChange={setBootstrapValidity} />

                                    <div className="relative pt-4">
                                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                                        <div className="relative flex justify-center text-xs uppercase">
                                            <span className="bg-background px-2 text-muted-foreground">Or</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground text-center">
                                        If you already have a bootstrap cert+key chained to a Validation CA,
                                        skip this step and bring them yourself.
                                    </p>
                                </>
                            ) : (
                                <Alert>
                                    <Info className="h-4 w-4" />
                                    <AlertTitle>No bootstrap signer required</AlertTitle>
                                    <AlertDescUI>
                                        This RA's <code className="font-mono">auth_mode</code> is <code className="font-mono">{authMode}</code>,
                                        which does not validate a client certificate on the IR
                                        {authMode === 'EXTERNAL_WEBHOOK' && ' — authorization is delegated to the configured webhook instead'}.
                                        There's nothing to issue here; clicking Next renders the enrollment commands directly.
                                    </AlertDescUI>
                                </Alert>
                            )}
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <div>
                                <Label>Bootstrap Certificate</Label>
                                <CodeBlock content={bootstrapCertificate} showDownload downloadFilename="bootstrap.crt" textareaClassName="h-48" />
                            </div>
                            <div>
                                <Label>Bootstrap Private Key</Label>
                                <Alert variant="warning" className="mb-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Save Your Private Key</AlertTitle>
                                    <AlertDescUI>This is your only chance to save the private key. It will not be stored and cannot be recovered.</AlertDescUI>
                                </Alert>
                                <CodeBlock content={bootstrapPrivateKey} showDownload downloadFilename="bootstrap.key" textareaClassName="h-48" />
                            </div>
                            <div>
                                <Label>Restore the files with one paste</Label>
                                <CodeBlock
                                    content={`echo "${encodeToBase64(bootstrapCertificate)}" | base64 -d > bootstrap.crt\necho "${encodeToBase64(bootstrapPrivateKey)}" | base64 -d > bootstrap.key`}
                                    textareaClassName="h-24"
                                />
                            </div>
                        </div>
                    )}

                    {step === 5 && selectedOperation !== 'genm' && (
                        <div className="space-y-6">
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Commands reflect this DMS's CMP configuration</AlertTitle>
                                <AlertDescUI>
                                    <ul className="mt-1 space-y-0.5 text-xs">
                                        <li><code className="font-mono">auth_mode</code>: {authMode}
                                            {authMode === 'NONE'
                                                ? ' — no client authentication required; the bootstrap signer is optional.'
                                                : ' — requests must be signed by a cert that chains to a Validation CA.'}
                                        </li>
                                        <li><code className="font-mono">confirmation</code>: {confirmationMode}
                                            {' '}(<code className="font-mono">accept_implicit</code>: {String(acceptImplicit)})
                                            {usesImplicitConfirmation
                                                ? ' — the request asks the server to skip the certConf round trip.'
                                                : ' — openssl sends an explicit certConf within the DMS confirmation timeout.'}
                                        </li>
                                        <li><code className="font-mono">enforce_popo</code>: {String(enforcePopo)} — {usingCkg
                                            ? <>not applicable — central key generation proves possession implicitly via <code className="font-mono">-centralkeygen</code>.</>
                                            : popoMethod === 'trusted_ra'
                                            ? <>proof-of-possession is delegated to the message-protection signer via <code className="font-mono">-popo 0</code>.</>
                                            : popoMethod === 'encrypted_certificate'
                                            ? <>proven indirectly: the issued certificate is decrypted with the RSA device key via <code className="font-mono">-popo 2</code>.</>
                                            : <>proof-of-possession is generated automatically because <code className="font-mono">-newkey</code> differs from <code className="font-mono">-key</code>.</>}
                                        </li>
                                        <li><code className="font-mono">protection_certificate</code>: {protectionSerial
                                            ? <>configured — pin it with <code className="font-mono">-srvcert</code>.</>
                                            : <span className="text-destructive">not set — see warning below.</span>}
                                            {protectionCaDiffersFromEnrollmentCa && (
                                                <> Issued by a <strong>different CA</strong> than <code className="font-mono">enrollment_ca</code> — both are added to the trust store.</>
                                            )}
                                        </li>
                                        <li><code className="font-mono">workflow</code>: {isPhasedWorkflow ? 'phased' : 'direct'}
                                            {isPhasedWorkflow
                                                ? ' — an administrator must approve the enrollment before a certificate is issued; the ir below blocks and polls (openssl cmp does this automatically) until approval or timeout.'
                                                : ' — the certificate is issued synchronously as part of the ir exchange.'}
                                        </li>
                                    </ul>
                                </AlertDescUI>
                            </Alert>

                            {!selectedOpEnabled && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>{primaryEnrollLabel} is disabled on this DMS</AlertTitle>
                                    <AlertDescUI>
                                        <code className="font-mono">{selectedOperation}.enabled</code> is off, so the DMS rejects every
                                        such request with <code className="font-mono">notAuthorized</code>. Enable it in this
                                        RA&apos;s CMP settings before using the command below.
                                    </AlertDescUI>
                                </Alert>
                            )}
                            {noUsablePopoWarning}
                            {(regTokenRequired || authenticatorRequired) && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>This DMS requires a CRMF registration control openssl cmp cannot attach</AlertTitle>
                                    <AlertDescUI>
                                        {regTokenRequired && <><code className="font-mono">ir.registration_token.mode</code> is <code className="font-mono">required</code> (<RfcLink rfc={4211} section="6.1" />). </>}
                                        {authenticatorRequired && <><code className="font-mono">ir.authenticator_control.mode</code> is <code className="font-mono">required</code> (<RfcLink rfc={4211} section="6.2" />). </>}
                                        These controls are carried inside the CertRequest, and <code className="font-mono">openssl cmp</code> has
                                        no option to add them — the ir below will be rejected with <code className="font-mono">badRequest</code>.
                                        Use a CMP client that can attach the control, or set the mode to <code className="font-mono">optional</code>/<code className="font-mono">disabled</code> on this RA.
                                    </AlertDescUI>
                                </Alert>
                            )}

                            {!protectionSerial && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Enrollment will fail without a Protection Certificate</AlertTitle>
                                    <AlertDescUI>
                                        This RA has no <code className="font-mono">protection_certificate</code> configured, so the DMS
                                        sends every CMP response <strong>unprotected</strong> — independent of <code className="font-mono">auth_mode</code>.
                                        The <code className="font-mono">-trusted</code> flag only verifies a <em>signed</em> response's chain; it
                                        does nothing for a response with no signature at all. A standards-compliant client refuses to
                                        accept an unprotected successful response — <code className="font-mono">openssl cmp</code> has no flag
                                        for this (<code className="font-mono">-unprotected_errors</code> only covers negative/error responses).
                                        The IR below will be accepted server-side and a certificate will be issued, but
                                        <code className="font-mono"> openssl cmp</code> will still report <code className="font-mono">missing protection</code> and
                                        exit without writing <code className="font-mono">-certout</code>. Configure a Protection Certificate on
                                        this RA's CMP Enrollment Settings before enrolling.
                                    </AlertDescUI>
                                </Alert>
                            )}
                            <div className="flex items-center space-x-2">
                                <Switch id="cmp-pin-cert" checked={pinProtectionCert} onCheckedChange={setPinProtectionCert} disabled={!protectionSerial} />
                                <Label htmlFor="cmp-pin-cert" className={cn(!protectionSerial && 'text-muted-foreground')}>
                                    Pin DMS Protection Certificate via <code className="font-mono">-srvcert</code> (Recommended)
                                </Label>
                            </div>
                            <div>
                                <Label>{primaryEnrollLabel}</Label>
                                <p className="text-xs text-muted-foreground mb-1">
                                    {selectedOperation === 'rr'
                                        ? <>Revoke the selected certificate. Authenticated by that certificate&apos;s private
                                            key, which the device holds — supply it as{' '}
                                            <code className="font-mono">revokecert.key</code>. No new certificate is issued.</>
                                        : selectedOperation === 'kur'
                                        ? <>Renew an existing device certificate with a fresh key. The previously-issued
                                            cert authenticates the request — the enrollment CA must be in{' '}
                                            <code className="font-mono">validation_cas</code> for this to be accepted.</>
                                        : selectedOperation === 'p10cr'
                                        ? <>Request a certificate from a self-signed PKCS #10 CSR. Possession is proven by
                                            the CSR&apos;s own signature.</>
                                        : <>Run on the device to obtain a certificate.{requiresClientCert ? <> Assumes{' '}
                                            <code className="font-mono">bootstrap.crt</code>/<code className="font-mono">bootstrap.key</code>{' '}
                                            are present in the working directory.</> : null}</>}
                                </p>
                                <CodeBlock content={primaryEnrollCommand} textareaClassName="h-72" />
                            </div>

                            {usingCkg && (
                                <div className="border-t pt-4">
                                    <Label>Recover the server-generated key and certificate</Label>
                                    <Alert className="mt-1 mb-2">
                                        <Info className="h-4 w-4" />
                                        <AlertTitle>Required when using central key generation</AlertTitle>
                                        <AlertDescUI className="space-y-1 text-xs">
                                            <p>
                                                The ir command above adds <code className="font-mono">-rspout</code> so the raw
                                                response is saved to disk even though{' '}
                                                <code className="font-mono">openssl cmp</code>&apos;s own{' '}
                                                <code className="font-mono">-newkeyout</code> decode is expected to fail (see the
                                                warning in the previous step) — and, since it treats that as fatal to the whole
                                                exchange, <code className="font-mono">-certout</code> is never written either,
                                                even though the response carries a valid issued certificate. The script below
                                                recovers both the key and the certificate from that saved response using only
                                                standard <code className="font-mono">openssl cms</code>/<code className="font-mono">openssl x509</code>{' '}
                                                primitives — no other CMP client is required.
                                            </p>
                                            <p>
                                                Verified end-to-end against real responses produced by this backend&apos;s own KGA
                                                code (RSA/KTRI bootstrap signer), including the negative case: a wrong trust anchor
                                                is correctly rejected. If the bootstrap signer is an EC key, the server uses ECDH
                                                key agreement (KARI) instead, whose originator key openssl&apos;s generic{' '}
                                                <code className="font-mono">cms -decrypt</code> cannot resolve on its own — prefer
                                                an RSA bootstrap signer when planning to use this recovery path.
                                            </p>
                                        </AlertDescUI>
                                    </Alert>
                                    <CodeBlock
                                        content={CKG_RECOVER_SCRIPT}
                                        showDownload
                                        downloadFilename="cmp-ckg-recover.py"
                                        textareaClassName="h-40"
                                        language="python"
                                    />
                                    <p className="text-xs text-muted-foreground mt-2 mb-1">
                                        Run after the ir command above (it will still print an error from{' '}
                                        <code className="font-mono">openssl cmp</code> itself — that&apos;s expected):
                                    </p>
                                    <CodeBlock content={ckgRecoverCommand} textareaClassName="h-32" />
                                </div>
                            )}

                            {selectedOperation !== 'rr' && (
                            <div className="border-t pt-4">
                                <Label>Revocation Request (RR)</Label>
                                <p className="text-xs text-muted-foreground mb-1">
                                    Companion command to revoke a certificate. By default it revokes the one the{' '}
                                    {selectedOperation.toUpperCase()} above issues; or pick an existing certificate to revoke
                                    instead — the command then fetches it and you supply its device-held key as{' '}
                                    <code className="font-mono">revokecert.key</code>.
                                </p>
                                <div className="mb-2 space-y-1">
                                    <Label htmlFor="cmp-revoke-cert" className="text-xs">Certificate to revoke</Label>
                                    <Select value={revokeCertSerial || '__enrolled__'} onValueChange={(v) => setRevokeCertSerial(v === '__enrolled__' ? '' : v)}>
                                        <SelectTrigger id="cmp-revoke-cert"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__enrolled__">The certificate enrolled above</SelectItem>
                                            {deviceCerts.map((c) => (
                                                <SelectItem key={c.serialNumber} value={c.serialNumber}>
                                                    {c.serialNumber}{c.validTo ? ` — expires ${c.validTo.slice(0, 10)}` : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {!rrEnabled && (
                                    <Alert variant="warning" className="mb-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescUI className="text-xs">
                                            <code className="font-mono">rr.enabled</code> is off on this DMS — this command will be
                                            rejected with <code className="font-mono">notAuthorized</code> until revocation is enabled.
                                        </AlertDescUI>
                                    </Alert>
                                )}
                                <CodeBlock content={rrCommand} textareaClassName="h-44" />
                            </div>
                            )}
                        </div>
                    )}

                    {step === 5 && selectedOperation === 'genm' && (
                        <div className="space-y-6">
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>General message queries for {ra?.name}</AlertTitle>
                                <AlertDescUI className="text-xs space-y-1">
                                    <p>
                                        <code className="font-mono">genm.access_policy</code>: {genmAccessPolicy}
                                        {genmUsesIssuedCert
                                            ? <> — this RA requires signature-protected general messages, so each command
                                                below signs with the certificate issued in the previous steps
                                                (<code className="font-mono">bootstrap.crt</code>/<code className="font-mono">bootstrap.key</code>).
                                                Any certificate would have worked: unlike ir/cr/kur, genm does not
                                                chain-validate the signer against a trusted CA — an RA-issued one was
                                                used anyway so it&apos;s a real, verifiable credential.</>
                                            : genmUsesSelfSignedCert
                                            ? <> — this RA requires signature-protected general messages, but has no
                                                validation CA configured to issue from, so each command below signs
                                                with a throwaway self-signed certificate
                                                (<code className="font-mono">genm.crt</code>/<code className="font-mono">genm.key</code>)
                                                generated in the setup step. genm does not chain-validate its signer,
                                                so this is sufficient.</>
                                            : <> — genm is answered unauthenticated regardless of the DMS enrollment
                                                auth mode, so requests are sent with <code className="font-mono">-unprotected_requests</code>.
                                                The accompanying <code className="font-mono">-subject</code> is just a placeholder sender
                                                identity openssl requires in the message header; it has no effect on the query.</>}
                                    </p>
                                    <p>
                                        Choose which general message to run below — each sets{' '}
                                        <code className="font-mono">-infotype</code> to one id-it type this RA
                                        answers. openssl maps that name to <code className="font-mono">id-it-&lt;name&gt;</code>;
                                        the newer types are flagged with the OpenSSL version that first recognized them.
                                    </p>
                                </AlertDescUI>
                            </Alert>

                            {!(cmp?.genm?.enabled ?? true) && (
                                <Alert variant="warning">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>General messages are disabled on this DMS</AlertTitle>
                                    <AlertDescUI className="text-xs">
                                        <code className="font-mono">genm.enabled</code> is off, so the DMS rejects every general
                                        message. Enable it in this RA&apos;s GENM settings before using the commands below.
                                    </AlertDescUI>
                                </Alert>
                            )}

                            {!protectionSerial && (
                                <Alert variant="warning">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Responses will be unprotected</AlertTitle>
                                    <AlertDescUI className="text-xs">
                                        This RA has no <code className="font-mono">protection_certificate</code>, so genp responses
                                        are unsigned. <code className="font-mono">openssl cmp</code> may report{' '}
                                        <code className="font-mono">missing protection</code>; the returned data is still shown.
                                        Configure a protection certificate to get signed, verifiable responses.
                                    </AlertDescUI>
                                </Alert>
                            )}

                            <div>
                                <Label>Setup{genmUsesSelfSignedCert ? ' — signer certificate and trust anchor' : ' — trust anchor'}</Label>
                                <p className="text-xs text-muted-foreground mb-1">
                                    Run once; the command below reuses
                                    {genmUsesIssuedCert
                                        ? <> <code className="font-mono">bootstrap.crt</code>/<code className="font-mono">bootstrap.key</code> (from the previous steps) and</>
                                        : genmUsesSelfSignedCert
                                        ? <> <code className="font-mono">genm.crt</code>/<code className="font-mono">genm.key</code> and</>
                                        : null}{' '}
                                    <code className="font-mono">enrollca.pem</code>
                                    {usesSrvcert ? <> and <code className="font-mono">srvcert.pem</code></> : null}.
                                </p>
                                <CodeBlock content={genmSetupCommand} textareaClassName="h-40" />
                            </div>

                            {genmEnabledCommands.length === 0 ? (
                                <Alert>
                                    <Info className="h-4 w-4" />
                                    <AlertDescUI className="text-xs">
                                        No queryable id-it information types are enabled for this RA (or the only enabled one,
                                        supported languages, can&apos;t be driven by <code className="font-mono">openssl cmp</code>,
                                        which cannot attach the required language list). Enable information types in this RA&apos;s
                                        GENM settings.
                                    </AlertDescUI>
                                </Alert>
                            ) : (
                                <div className="space-y-4">
                                    <CardSelector
                                        label="General message to run"
                                        value={effectiveGenmType as keyof CmpGenmInformationTypes}
                                        onChange={setSelectedGenmType}
                                        options={genmSelectorOptions}
                                        columns={2}
                                    />
                                    {selectedGenmCommand && (
                                        <div className="border-t pt-4">
                                            <div className="flex items-center gap-2">
                                                <Label>{selectedGenmCommand.label}</Label>
                                                <code className="font-mono text-xs text-muted-foreground">-infotype {selectedGenmCommand.opensslName}</code>
                                                {selectedGenmCommand.since && (
                                                    <Badge variant="outline" className="text-[10px]">OpenSSL {selectedGenmCommand.since}+</Badge>
                                                )}
                                            </div>
                                            <CodeBlock content={buildGenmCommand(selectedGenmCommand.opensslName, selectedGenmCommand.outputFlags)} textareaClassName="h-40" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <DialogFooter className="border-t px-6 py-4">
                <div className="w-full flex justify-between">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <div className="flex space-x-2">
                        {step > 1 && (
                            <Button variant="outline" onClick={handleBack} disabled={isGenerating}>
                                <ArrowLeft className="mr-2 h-4 w-4" />Back
                            </Button>
                        )}
                        {step === 3 && stepThreeShowsBootstrapForm && selectedOperation !== 'kur' && (
                            <Button variant="secondary" onClick={handleSkipBootstrap}>
                                Skip &amp; Use Existing
                            </Button>
                        )}
                        {step < 5 ? (
                            <Button onClick={handleNext} disabled={isGenerating}>
                                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {step === 3
                                    ? (selectedOperation === 'kur' ? 'Show Commands'
                                        : selectedOperation === 'genm' ? 'Issue Certificate'
                                        : requiresClientCert ? 'Issue Bootstrap Cert' : 'Next')
                                    : step === 4 ? 'Show Commands' : 'Next'}
                            </Button>
                        ) : (
                            <Button onClick={() => onOpenChange(false)}>Finish</Button>
                        )}
                    </div>
                </div>
            </DialogFooter>
        </>
    );

    if (resolvedPresentation === 'inline') {
        if (!isOpen) return null;
        return (
            <Card className={cn('flex h-full min-h-[650px] flex-col overflow-hidden', className)}>
                {panelContent}
            </Card>
        );
    }

    if (resolvedPresentation === 'sheet') {
        return (
            <Sheet open={isOpen} onOpenChange={onOpenChange}>
                <SheetContent
                    side="right"
                    className={cn(
                        // The base SheetContent className hardcodes
                        // data-[side=right]:w-3/4 and data-[side=right]:sm:max-w-sm.
                        // tailwind-merge only dedupes classes with an IDENTICAL
                        // modifier chain, so a plain `sm:max-w-3xl` here would NOT
                        // replace `data-[side=right]:sm:max-w-sm` — both would ship,
                        // and max-w-sm (24rem) was winning, clamping this sheet to a
                        // tiny width. Overriding with the same data-[side=right]:
                        // prefix is what actually gets tailwind-merge to strip it.
                        'flex flex-col overflow-hidden p-0',
                        'data-[side=right]:w-full data-[side=right]:sm:max-w-3xl data-[side=right]:lg:max-w-4xl data-[side=right]:xl:max-w-5xl',
                        className,
                    )}
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>CMP Enroll</SheetTitle>
                    </SheetHeader>
                    {panelContent}
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className={cn('sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col', className)}>
                <DialogHeader className="sr-only">
                    <DialogTitle>CMP Enroll</DialogTitle>
                    <DialogDescription>
                        Generate enrollment commands for RA: {ra?.name} ({ra?.id})
                    </DialogDescription>
                </DialogHeader>
                {panelContent}
            </DialogContent>
        </Dialog>
    );
};
